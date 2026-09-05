"""The world: one event heap, the decision loop, the event handlers and the agent calls."""
import heapq

from .clock import DAY, WEEK, day_start, fit_end, minutes
from .seeds import stream
from .people import make_population, Segment
from .commitments import INF, travel_min, trip_lead, lead_min, next_commitment, following_commitment, plan_week
from .sleep_and_meals import sleep_end, wake_up, meal_day, meal_due, meal, break_meal, snack_due
from .free_time import INTERRUPTIBLE, MOVE_NEEDS, pick_free_activity, free_end
from .agent_api import Observation, PingHandle, Reply, Slot, Ping, checked_slot, reply_latency, free_windows, request_slot, verdict


LUNCH_OUT = 0.25        # share of workplace days the lunch at the cut is eaten out (a trip there and back)


class World:
    def __init__(self, seed=1, n=200):
        self.seed = seed
        self.people, self.households, self.workplaces = make_population(seed, n)
        self.now, self.heap, self.seq, self.ids = 0, [], 0, 0
        self.pings, self.reply_log = [], []
        plan_week(self, 0)
        plan_week(self, WEEK)                                            # two weeks are always planned
        self.planned_until = 2 * WEEK                                    # no offer or invite beyond it
        self.push(6 * DAY + 1200, "world", "plan_week", 0)               # Sunday 20:00: the week after next
        for p in self.people:                                            # asleep since Sunday night
            p.bed_at = p.started_at = min(0, p.traits.bedtime_minute - DAY + p.rand.randint(-20, 60))
            p.woke_at, p.last_meal_at = p.bed_at - 900, p.bed_at - 200
            p.ends_at = sleep_end(p, p.bed_at)
            self.push(p.ends_at, f"person:{p.id}", "activity_end", 0)

    def new_id(self):
        self.ids += 1
        return self.ids

    def push(self, t, owner, kind, version):
        self.seq += 1
        heapq.heappush(self.heap, (t, self.seq, owner, kind, version))

    def run_until(self, t_stop):
        if type(t_stop) is not int:
            raise ValueError(f"run_until({t_stop!r}) needs a whole number of minutes")
        if t_stop < self.now:
            raise ValueError(f"run_until({t_stop}) is before world.now = {self.now}; time only moves forward")
        heap = self.heap
        while heap and heap[0][0] <= t_stop:
            t, _, owner, kind, version = heapq.heappop(heap)
            self.now = t
            id = owner.partition(":")[2]
            if kind == "plan_week":
                plan_week(self, day_start(t) + DAY + WEEK)
                self.planned_until = day_start(t) + DAY + 2 * WEEK
                self.push(t + WEEK, "world", "plan_week", 0)
            elif kind == "reply_due":
                self.deliver(self.pings[int(id)], t)
            elif kind == "commitment_start":
                self.commitment_start(self.people[int(id)], t)
            elif version == self.people[int(id)].version:               # else stale
                p = self.people[int(id)]
                if kind == "activity_end":
                    self.finish(p, t)
                    self.start(p, t, *self.decide(p, t))
                else:                                                    # phone_end
                    self.finish(p, t)
                    p.activity, p.interruptible, p.with_ids = p.resume[:3]
                    p.started_at, p.resume = t, None
        self.now = t_stop

    # -- one person's activities ------------------------------------------------------

    def start(self, p, t, activity, place, end, interruptible, with_ids):
        p.version += 1
        p.activity, p.place, p.started_at, p.ends_at = activity, place, t, end
        p.interruptible, p.with_ids = interruptible, with_ids
        p.today[activity] = p.today.get(activity, 0) + 1
        self.push(end, f"person:{p.id}", "activity_end", p.version)

    def finish(self, p, t):
        """Log the running activity up to t and record what it changed."""
        a = p.activity
        if p.started_at < t:
            p.log.append(Segment(p.id, a, logged_place(p), max(p.started_at, 0), t, p.with_ids))
        p.minutes_today[a] = p.minutes_today.get(a, 0) + t - p.started_at
        kind, _, label = a.partition(":")
        if kind == "sleep":
            wake_up(p, t, self.households[p.household_id])
        elif kind == "meal":                                             # breakfast belongs to the wake, the rest to the day ending 05:00
            p.last_meal_at, p.last_meal_day[label] = t, p.woke_at if label == "breakfast" else meal_day(t)
        elif kind in ("snack", "break"):                                 # the work break counts as a snack for spacing
            p.last_snack_at = t
            if kind == "break":
                p.last_meal_day[kind] = meal_day(t)

    def segments(self, p):
        """The log plus the activity still running at world.now."""
        tail = [Segment(p.id, p.activity, logged_place(p), max(p.started_at, 0), self.now, p.with_ids)] if p.started_at < self.now else []
        return p.log + tail

    def decide(self, p, t):
        """-> (activity, place, end, interruptible, with_ids).  Commitments first, then the
        morning, then getting home and to bed, then meals, then a free activity."""
        tr, day = p.traits, meal_day(t)
        c = next_commitment(p, t)
        if c and c.start <= t:                                           # inside one: time to leave for (or start) the next?
            f = following_commitment(p, t)
            if f and f.activity != "dinner" and t >= f.start - lead_min(p, f) - (4 if f.place != p.place else 0):
                c = f                                                    # (a household dinner waits: they join late)
        # a boundary 1-4 minutes before the time to set off (or an appointment here) leaves now, not after an idle
        if c and t >= c.start - start_lead(p, c) - (4 if p.place != c.place or c.activity == "appointment" else 0):
            if p.place != c.place:
                if c.activity == "work" and p.place == "out" and p.planned and p.planned[0] == break_meal(c.lunch_cut):
                    p.planned = None                                     # out for lunch (work_block sent them): a longer sit
                    return meal(p, t, break_meal(c.lunch_cut), c.end - 60, minutes(p.rand, 30, 0.25, 25, 45)) or commute(p, t, c.place)
                return commute(p, t, c.place, c)
            if c.activity == "work":
                return self.work_block(p, t, c)
            if c.activity == "dinner" and (t - p.last_meal_at < 90 or c.end - t < 12) \
                    or c.activity == "dishes" and p.last_meal_day.get("dinner") != day:
                p.commitments.remove(c)                                  # just ate, or too late to join (eats alone later); no dinner, no dishes
                return self.decide(p, t)
            if c.activity == "dinner":                                   # a latecomer eats for their own drawn length
                own = fit_end(t, minutes(p.rand, 25, 0.3, 20, 60), free_until(p, following_commitment(p, t), "home"))
                return self.join_table(p, t, "dinner", c.end if t <= c.start else own)
            end = c.end
            if c.place == "out" and c.activity != "appointment" and p.last_meal_day.get("lunch") != day:   # an outing over lunch pauses for it
                if p.activity == c.activity and p.started_at >= c.start - 10 and meal_due(p, t) == "lunch" and (m := meal(p, t, "lunch", c.end - 15)):
                    return m[:4] + (c.with_ids,)                         # (ten minutes in at the earliest)
                due = max(p.lunch_at, p.last_meal_at + 141, t + 10)
                if due < min(c.end - 35, p.lunch_at + 100):
                    end = due
            return (c.activity, c.place, end, INTERRUPTIBLE[c.activity], c.with_ids)
        # free time ends when it is time to leave; at the same place it ends at the start itself
        limit, away = free_until(p, c, p.place), free_until(p, c, "home" if p.place == "out" else "out")
        early = c and c.place == p.place != "home" and c.start - t < 60   # in early for something here: wait
        if early:
            limit = c.start
        if t == p.woke_at:
            wash = round(tr.prep_min * p.rand.uniform(0.85, 1.15) * 0.6)
            room = limit - t - (0 if tr.skips_breakfast else p.breakfast_min)   # until leaving, less the breakfast
            if wash <= room < wash + 10:                                 # a little slack: the routine takes it
                wash = room
            return ("wash", "home", fit_end(t, max(10, wash), limit), INTERRUPTIBLE["wash"], frozenset())
        if p.activity == "wash" and not tr.skips_breakfast and p.last_meal_day.get("breakfast") != p.woke_at:
            if (m := meal(p, t, "breakfast", limit, p.breakfast_min)):
                return m
        if p.place != "home" and t >= limit:
            return commute(p, t, "home")
        if p.place == "home" and limit == p.bed_tonight and t >= limit - 10:   # bedtime, or nothing left to do before it
            p.bed_at = t
            return ("sleep", "home", sleep_end(p, t), INTERRUPTIBLE["sleep"], frozenset())
        if p.place == "work" and not early:                              # off to the next thing
            if c and c.place == "out" and c.start - travel_min(p, "home", "out") - (t + tr.commute_min) < 30:
                return commute(p, t, "out")                              # no time at home before it: straight there
            if away - t >= 30 and pick_free_activity(p, t, away, away) is None:      # a stop out on the way costs its own legs; picked, so straight there
                return commute(p, t, p.planned[1])
            return commute(p, t, "home")
        if p.place == "home" and p.last_meal_day.get("lunch") != day:    # free time ends at the household lunch, once it is due (under 10 min away: eat now)
            due = max(p.lunch_at, p.last_meal_at + 141)
            if t + 10 < due < p.lunch_at + 100:
                limit, away = min(limit, due), min(away, due)
        if (name := meal_due(p, t) or p.place == "home" and self.table_meal(p, t)) and (m := meal(p, t, name, limit)):
            return self.join_table(p, t, name, m[2]) if p.place == "home" else m
        stay = c and c.place != "home" and (c.place == "out" or c.start - travel_min(p, "home", c.place) - travel_min(p, "out", "home") - 5 - t < 30)
        if p.place == "out" and limit - t < 30:                          # nothing fits out here; going home first may not be worth it
            if stay:
                name = "idle" if limit - t < 15 else "walk"              # a few minutes early is a wait
                return (name, "out", max(t + 5, limit), INTERRUPTIBLE[name], frozenset())
            return commute(p, t, "home")
        if limit - t >= 30 and snack_due(p, t):
            return ("snack", p.place, t + p.rand.randint(8, 15), INTERRUPTIBLE["snack"], frozenset())
        planned, p.planned = p.planned, None
        if planned and planned[1] == p.place and limit - t >= 30:        # arrived where the pick happens (a short gap takes the short-gap rule)
            name, place, duration, longest = planned
            return (name, place, free_end(t, duration, limit, longest), INTERRUPTIBLE[name], frozenset())
        pick = pick_free_activity(p, t, limit, away)
        if pick is None:
            return commute(p, t, p.planned[1])
        if pick[0] == "idle" and p.place == "out":                       # nothing left to pick out here
            if stay and limit - t < MOVE_NEEDS:                          # the next thing is near and soon: a walk, not a trip home and back
                return ("walk", "out", limit, INTERRUPTIBLE["walk"], frozenset())
            return commute(p, t, "home")
        return pick

    def work_block(self, p, t, c):
        """Blocks of 45-120 minutes up to the next boundary; the meal at lunch_cut, the break at break_at."""
        day = meal_day(t)
        pending = break_meal(c.lunch_cut) if c.lunch_cut else None
        if pending and p.last_meal_day.get(pending) == day:
            pending = None
        f = next((x for x in p.commitments if x.start > t and x is not c and not (x.activity == "dinner" and x.place != p.place)), None)
        cap = min(c.end, f.start - lead_min(p, f) if f else INF)
        soon = f and f.place == p.place and f.start - t < 45                 # a meeting in under 45 min: eat after it
        if pending and t >= c.lunch_cut and t - p.last_meal_at > 180 and not soon:
            if p.place == "work" and cap - t >= 150 and p.rand.random() < LUNCH_OUT:   # out for lunch: the trip there and back, then work
                p.planned = (pending, "out", 0, 0)
                return commute(p, t, "out")
            if (m := meal(p, t, pending, cap)):
                return m
        if pending and c.lunch_cut > t:
            cap = min(cap, c.lunch_cut)
        if c.break_at and p.last_meal_day.get("break") != day:            # one short break a day, an hour clear of a meal, not right before a meeting
            if t >= c.break_at and not soon and cap - t > 30 and t - p.last_meal_at >= 60 and not (pending and c.lunch_cut - t < 60):
                return ("break", p.place, t + p.rand.randint(10, 15), INTERRUPTIBLE["break"], frozenset())
            if c.break_at > t and cap - c.break_at >= 45:                    # else the break waits until after the meeting
                cap = min(cap, c.break_at)
        if cap - t > 30 and snack_due(p, t, c):
            return ("snack", p.place, t + p.rand.randint(8, 15), INTERRUPTIBLE["snack"], frozenset())
        end = t + p.rand.randint(45, 120)
        if cap - end < 15:                                               # a remainder under 15 minutes joins this block
            end = max(cap, t + 5)
        kind = "work:focused" if p.rand.random() < 0.6 else "work:routine"
        return (kind, p.place, end, INTERRUPTIBLE[kind], frozenset())

    def table_meal(self, p, t):
        """The lunch or dinner a housemate is eating at home right now (12 minutes left) that p
        has not had today, two hours or more after p's last meal: p sits down with them."""
        for q in map(self.people.__getitem__, self.households[p.household_id].members):
            label = running(q).partition(":")[2]
            if q is not p and label in ("lunch", "dinner") and q.place == "home" and q.ends_at >= t + 12 \
                    and p.last_meal_day.get(label) != meal_day(t) and t - p.last_meal_at > 120:
                return label
        return None

    def join_table(self, p, t, name, end):
        """A meal at home: sit down with the household members already eating it (12 minutes or
        more left), for p's own length; each of them now lists p too (a member on a call at the
        table lists p once the call ends), so with_ids stay symmetric and name only people who
        actually overlap."""
        table = [q for q in map(self.people.__getitem__, self.households[p.household_id].members)
                 if q is not p and running(q) == "meal:" + name and q.place == "home" and t + 12 <= q.ends_at]
        for q in table:
            if q.activity == "phone":
                q.resume = (q.resume[0], INTERRUPTIBLE["dinner"], q.resume[2] | {p.id}, q.resume[3])
            else:
                q.with_ids, q.interruptible = q.with_ids | {p.id}, INTERRUPTIBLE["dinner"]
        ids = frozenset(q.id for q in table)
        return ("meal:" + name, "home", end, INTERRUPTIBLE["dinner" if ids else "meal"], ids)

    # -- events from outside the person -----------------------------------------------

    def commitment_start(self, p, t):
        """Only appointments push this: one accepted while something else was running.  The
        time to set off is judged from where the person is now, not where the invite found them."""
        c = next((x for x in p.commitments if x.activity == "appointment" and x.end > t), None)
        if c is None or (p.activity == "appointment" and p.started_at >= c.start - 4):
            return
        lead = lead_min(p, c)                                            # at the same place it starts on the minute
        if t < c.start - lead:
            self.push(c.start - lead, f"person:{p.id}", "commitment_start", 0)
        elif p.activity in ("commute", "phone"):                         # again when the call ends or on arrival (queued behind that event)
            self.push(p.resume[3] if p.activity == "phone" else p.ends_at, f"person:{p.id}", "commitment_start", 0)
        elif p.activity != "sleep":
            self.finish(p, t)
            self.start(p, t, *self.decide(p, t))

    def deliver(self, ping, t):
        """The reply, as a short phone call splitting the running activity.  A call cannot split
        sleep, anything with interruptible under 0.3 or under 8 minutes left, or an activity in
        its first minute: the ping then waits a few minutes, or for that activity's end (a running
        call's end when it landed on one), and is judged again."""
        p = self.people[ping.person]
        splittable = p.activity != "sleep" and p.interruptible >= 0.3 and p.ends_at - t >= 8
        if not splittable or p.started_at == t:
            end = t if splittable else p.resume[3] if p.activity == "phone" else p.ends_at
            self.push(end + ping.rand.randint(1, 4), f"ping:{ping.id}", "reply_due", 0)
            return
        self.finish(p, t)
        p.resume = (p.activity, p.interruptible, p.with_ids, t + ping.rand.randint(2, 5))
        p.activity, p.started_at, p.interruptible, p.with_ids = "phone", t, INTERRUPTIBLE["phone"], frozenset()
        self.push(p.resume[3], f"person:{p.id}", "phone_end", p.version)
        decision, counter, reason = verdict(self, p, ping, t)
        self.reply_log.append(Reply(ping.id, p.id + 1, t, decision, counter, ping.agent_id, reason))

    # -- agent calls: person ids are 1-based here, `person 17` is the 17th person ----------

    def person(self, id):
        if not 1 <= id <= len(self.people):
            raise ValueError(f"person id {id} is outside 1..{len(self.people)}")
        return self.people[id - 1]

    def check_now(self, t):
        if t != self.now:
            raise ValueError(f"t = {t} but world.now = {self.now}; agent calls take the current time")

    def observe(self, person, t):
        self.check_now(t)
        p = self.person(person)
        c = following_commitment(p, t)
        gaps = [(s, e) for s, e in free_windows(p, t, DAY) if e - s >= 30]
        window = None
        if gaps:                                                         # a later gap opens at home: after sleep, or a commitment plus the trip back
            s, e = gaps[0]
            window = Slot(s, e, ("home" if p.place == "home" else "out") if s == t else "home")
        return Observation(p.activity, logged_place(p), p.started_at, p.ends_at,
                           p.interruptible, frozenset(i + 1 for i in p.with_ids), c.start if c else None, window)

    def ping(self, person, t, agent_id, kind, payload=None):
        self.check_now(t)
        p = self.person(person)
        if kind == "invite":
            payload = checked_slot(payload, t)
        elif kind != "question":
            raise ValueError(f"ping kind {kind!r} is not 'question' or 'invite'")
        nag, at, charged = p.pings_from.get(agent_id, (0, t, None))
        before = p.resume[1] if p.activity == "phone" else p.interruptible   # what the ping lands on, phone call or not
        extra = 2 if before < 0.2 and p.started_at != charged else 0     # waking someone or breaking into a meeting: once per agent and activity
        nag = max(0, nag - (t - at) // 360) + 1 + extra                  # decays one per whole 6 h of quiet
        p.pings_from[agent_id] = (nag, t, p.started_at if extra else charged)
        ping = Ping(len(self.pings), p.id, agent_id, kind, payload, t, nag, stream(self.seed, "reply", p.id, len(self.pings)))
        self.pings.append(ping)
        if nag <= 8:                                                     # the 9th ping in a day is the first ignored
            self.push(t + max(1, round(reply_latency(p, t, ping.rand, nag))), f"ping:{ping.id}", "reply_due", 0)
        return PingHandle(ping.id, t, nag > 8)

    def request_slot(self, person, t, duration_min, window, place="out"):
        self.check_now(t)
        return request_slot(self.person(person), t, duration_min, window, place, self.planned_until)

    def replies(self, agent_id, since_t):
        return [r for r in self.reply_log if r.delivered_at >= since_t and r.agent_id == agent_id]


def running(p):
    """The activity a phone call interrupted, else the activity itself."""
    return p.resume[0] if p.activity == "phone" else p.activity


def logged_place(p):
    """Where a segment is: transit during a commute, out on a walk (a call taken on either too)."""
    return "transit" if running(p) == "commute" else "out" if running(p) == "walk" else p.place


def free_until(p, c, place):
    """When free time at `place` ends: the leave time for the next commitment, or for bed (from
    out, the trip home and the wind-down before); a commitment at home within two hours after
    bedtime keeps the person up for it."""
    home = p.bed_tonight - (travel_min(p, place, "home") + p.wind_down if place != "home" else 0)
    if c and c.place == "home" and c.start < p.bed_tonight + 120:
        return c.start - trip_lead(p, place, c.place)
    return min(c.start - trip_lead(p, place, c.place) if c else INF, home)


def start_lead(p, c):
    """How early a commitment may begin from where the person is: after the trip, or at the same
    place up to 5 minutes early (10 for housework, never for an appointment)."""
    travel = travel_min(p, p.place, c.place)
    if travel:
        return travel + 5
    return 0 if c.activity == "appointment" else 10 if c.activity in ("cook", "dishes", "laundry") else 5


def commute(p, t, place, toward=None):
    """Travel with 15 % jitter either way, never more than 5 minutes over the trait (the departure
    lead), so a commute is never late; one to an appointment arriving under 5 minutes early, or
    to anything at out under 10 minutes early, runs to its start (the trip just took longer)."""
    travel = travel_min(p, p.place, place)
    end = t + max(3, min(round(travel * p.rand.uniform(0.85, 1.15)), travel + 5))
    if toward and toward.place == place and 0 < toward.start - end < (10 if place == "out" else 5 if toward.activity == "appointment" else 0):
        end = toward.start
    return ("commute", place, end, INTERRUPTIBLE["commute"], frozenset())
