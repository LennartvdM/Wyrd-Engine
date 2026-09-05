"""The world: one event heap, the decision loop, the event handlers and the agent calls."""
import heapq

from .clock import DAY, WEEK, day_start
from .seeds import stream
from .people import make_population, Segment
from .commitments import INF, travel_min, next_commitment, following_commitment, plan_week
from .sleep_and_meals import wants_sleep, sleep_end, wake_up, meal_due, meal, fit_end
from .free_time import INTERRUPTIBLE, pick_free_activity
from .agent_api import Observation, PingHandle, Reply, Slot, Ping, reply_latency, free_windows, request_slot, verdict


class World:
    def __init__(self, seed=1, n=200):
        self.seed = seed
        self.people, self.households, self.workplaces = make_population(seed, n)
        self.now, self.heap, self.seq, self.ids = 0, [], 0, 0
        self.pings, self.reply_log = [], []
        plan_week(self, 0)
        self.push(6 * DAY + 1200, "world", "plan_week", 0)               # Sunday 20:00
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
        heap = self.heap
        while heap and heap[0][0] <= t_stop:
            t, _, owner, kind, version = heapq.heappop(heap)
            self.now = t
            who, _, id = owner.partition(":")
            if kind == "plan_week":
                plan_week(self, day_start(t) + DAY)
                self.push(t + WEEK, "world", "plan_week", 0)
            elif kind == "dinner_call":
                self.dinner_call(self.households[int(id)], t)
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
                    p.activity, p.interruptible, p.with_ids = p.resume
                    p.started_at, p.resume = t, None
        self.now = t_stop

    # -- one person's activities ------------------------------------------------------

    def start(self, p, t, activity, place, end, interruptible, with_ids):
        p.version += 1
        p.activity, p.place, p.started_at, p.ends_at = activity, place, t, end
        p.interruptible, p.with_ids = interruptible, with_ids
        self.push(end, f"person:{p.id}", "activity_end", p.version)

    def finish(self, p, t):
        """Log the running activity up to t and record what it changed."""
        a = p.activity
        if p.started_at < t:
            p.log.append(Segment(p.id, a, "transit" if a == "commute" else p.place, max(p.started_at, 0), t, p.with_ids))
        kind, _, label = a.partition(":")
        if kind == "sleep":
            wake_up(p, t)
        elif kind == "meal":
            p.last_meal_at, p.last_meal_day[label] = t, t // DAY
        elif kind == "snack":
            p.last_snack_at = t

    def segments(self, p):
        """The log plus the activity still running at world.now."""
        tail = [Segment(p.id, p.activity, "transit" if p.activity == "commute" else p.place,
                        max(p.started_at, 0), self.now, p.with_ids)] if p.started_at < self.now else []
        return p.log + tail

    def decide(self, p, t):
        """-> (activity, place, end, interruptible, with_ids).  Commitments first, then the
        morning, then getting home and to bed, then meals, then a free activity."""
        tr, day = p.traits, t // DAY
        c = next_commitment(p, t)
        travel = travel_min(p, p.place, c.place) if c else 0
        lead = travel + 5 if c else 0
        if c and t >= c.start - lead:
            if p.place != c.place:
                return commute(p, t, c.place)
            if c.activity == "work":
                return self.work_block(p, t, c)
            if c.activity == "dinner":
                if t - p.last_meal_at < 90:                              # just ate; sit this one out
                    p.commitments.remove(c)
                    return self.decide(p, t)
                return ("meal:dinner", "home", c.end, 0.35 if c.with_ids else 0.6, c.with_ids)
            return (c.activity, c.place, c.end, INTERRUPTIBLE[c.activity], c.with_ids)
        # free time ends when it is time to leave; at the same place it ends at the start itself
        limit = min(c.start - (lead if travel else 0) if c else INF, p.bed_tonight - travel_min(p, p.place, "home"))
        if t == p.woke_at:
            wash = round(tr.prep_min * p.rand.uniform(0.85, 1.15) * 0.6)
            return ("wash", "home", fit_end(t, wash, limit), 0.3, frozenset())
        if p.activity == "wash" and not tr.skips_breakfast and p.last_meal_day.get("breakfast") != day:
            if (m := meal(p, t, "breakfast", limit)):
                return m
        if p.place != "home" and t >= limit:
            return commute(p, t, "home")
        if p.place == "home" and wants_sleep(p, t):
            p.bed_at = t
            return ("sleep", "home", sleep_end(p, t), 0.0, frozenset())
        if p.place == "work" and not (c and c.place == "work" and c.start - t < 60):   # early: wait, else go home
            return commute(p, t, "home")
        if p.place == "home" and p.last_meal_day.get("lunch") != day and t < p.lunch_at:
            limit = min(limit, p.lunch_at)
        if (name := meal_due(p, t)) and (m := meal(p, t, name, limit)):
            return m
        planned, p.planned = p.planned, None
        if planned and planned[1] == p.place:                            # arrived where the pick happens
            name, place, duration = planned
            return (name, place, fit_end(t, duration, limit), INTERRUPTIBLE[name], frozenset())
        if t - p.last_meal_at > 300 and t - p.last_snack_at > 150:
            return ("snack", p.place, fit_end(t, 10, limit), 0.6, frozenset())
        return pick_free_activity(p, t, limit) or commute(p, t, p.planned[1])

    def work_block(self, p, t, c):
        lunch_pending = c.lunch_cut and p.last_meal_day.get("lunch") != t // DAY
        f = next((x for x in p.commitments if x.start > t and x is not c), None)
        travel = travel_min(p, p.place, f.place) if f else 0
        cap = min(c.end, f.start - (travel + 5 if travel else 0) if f else INF)
        if lunch_pending and t >= c.lunch_cut and t - p.last_meal_at > 180 and c.end - t > 45:
            if (m := meal(p, t, "lunch", cap)):
                return m
        if lunch_pending and c.lunch_cut > t:
            cap = min(cap, c.lunch_cut)
        if t - p.last_meal_at > 300 and t - p.last_snack_at > 150 and cap - t > 30:
            return ("snack", p.place, t + 10, 0.6, frozenset())
        end = fit_end(t, p.rand.randint(45, 120), cap)
        kind = "work:focused" if p.rand.random() < 0.6 else "work:routine"
        return (kind, p.place, end, INTERRUPTIBLE[kind], frozenset())

    # -- events from outside the person -----------------------------------------------

    def commitment_start(self, p, t):
        """Only appointments push this: a commitment accepted while something else was running."""
        c = next_commitment(p, t)
        if c is None or c.activity == p.activity:
            return
        lead = travel_min(p, p.place, c.place) + 5
        if t < c.start - lead:
            self.push(c.start - lead, f"person:{p.id}", "commitment_start", 0)
        elif p.activity in ("commute", "phone"):
            self.push(t + 5, f"person:{p.id}", "commitment_start", 0)      # try again shortly
        elif p.activity != "sleep":
            self.finish(p, t)
            self.start(p, t, *self.decide(p, t))

    def dinner_call(self, h, t):
        """Everyone at the table now is eating together."""
        h.dinner_ends.pop(t)
        at_table = [p for p in map(self.people.__getitem__, h.members) if p.place == "home" and p.activity == "meal:dinner"]
        ids = frozenset(p.id for p in at_table)
        for p in at_table:
            p.with_ids, p.interruptible = ids - {p.id}, 0.35 if len(ids) > 1 else 0.6

    def deliver(self, ping, t):
        p = self.people[ping.person]
        splittable = p.interruptible >= 0.3 and p.ends_at - t >= 8 and p.started_at < t
        if (not ping.deferred and not splittable) or p.activity == "sleep":
            ping.deferred = True                                         # lands at the next boundary
            self.push(p.ends_at, f"ping:{ping.id}", "reply_due", 0)
            return
        if not ping.deferred:                                            # a short phone break
            self.finish(p, t)
            p.resume = (p.activity, p.interruptible, p.with_ids)
            p.activity, p.started_at, p.interruptible, p.with_ids = "phone", t, 0.1, frozenset()
            self.push(t + ping.rand.randint(2, 5), f"person:{p.id}", "phone_end", p.version)
        decision, counter = verdict(self, p, ping, t)
        self.reply_log.append(Reply(ping.id, p.id, t, decision, counter))

    # -- agent calls --------------------------------------------------------------------

    def observe(self, person, t):
        assert t == self.now
        p = self.people[person]
        c = following_commitment(p, t)
        windows = [Slot(s, e, "out") for s, e in free_windows(p, t, DAY) if e - s >= 30]
        return Observation(p.activity, "transit" if p.activity == "commute" else p.place, p.started_at, p.ends_at,
                           p.interruptible, p.with_ids, c.start if c else None, windows[0] if windows else None)

    def ping(self, person, t, agent_id, kind, payload=None):
        assert t == self.now
        p = self.people[person]
        nag, at = p.pings_from.get(agent_id, (0.0, t))
        nag = max(0.0, nag - (t - at) / 360) + 1 + (2 if p.interruptible < 0.2 and p.activity != "phone" else 0)
        p.pings_from[agent_id] = (nag, t)
        ping = Ping(len(self.pings), person, agent_id, kind, payload, t, nag, stream(self.seed, "reply", person, len(self.pings)))
        self.pings.append(ping)
        if nag < 8:                                                      # the 9th ping in a day is ignored
            self.push(t + round(reply_latency(p, t, ping.rand, nag)), f"ping:{ping.id}", "reply_due", 0)
        return PingHandle(ping.id, t)

    def request_slot(self, person, t, duration_min, window, place="out"):
        assert t == self.now
        return request_slot(self.people[person], t, duration_min, window, place)

    def replies(self, agent_id, since_t):
        return [r for r in self.reply_log if r.delivered_at >= since_t and self.pings[r.ping_id].agent_id == agent_id]


def commute(p, t, place):
    minutes = travel_min(p, p.place, place) * p.rand.uniform(0.85, 1.15)
    return ("commute", place, t + max(3, round(minutes)), 0.4, frozenset())
