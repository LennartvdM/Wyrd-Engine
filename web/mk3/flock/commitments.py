"""Shared blocks of time planned a week ahead: work days, meetings, household dinners
and cooking, weekend outings and errands, habits.  Each is written into every member's
sorted commitment list; the decision loop only reads them."""
import bisect
import math
from dataclasses import dataclass, replace

from .clock import DAY, clamp, minutes

INF = 10 ** 9
ROSTER = ((5, 6), (2, 3), (0, 1), (3, 4))   # seven-day workplaces: the two days off, a four-week cycle with one full weekend


@dataclass(frozen=True)
class Commitment:
    id: int
    start: int
    end: int
    place: str          # home, work, out
    activity: str       # work, meeting, dinner, cook, dishes, outing, errands, appointment; the habits (gym, club, laundry, class, coffee, volunteer, shop)
    owner: str          # "workplace:3", "household:12", "self" or an agent id
    with_ids: frozenset = frozenset()
    lunch_cut: int = 0  # work only: when lunch starts; 0 = no lunch at work
    break_at: int = 0   # work only: a 10-15 minute break 2-4 h into the day; 0 = none


def travel_min(p, a, b):
    if a == b:
        return 0
    if a != "out" and b != "out":
        return p.traits.commute_min          # home <-> work
    return 20                                # to or from out (NHTS average trip about 20 min; outside the reference file)


def trip_lead(p, a, b):
    """Minutes to allow for getting from a to b: the trip plus 5, nothing at the same place."""
    travel = travel_min(p, a, b)
    return travel + 5 if travel else 0


def lead_min(p, c):
    """Minutes before a commitment's start to set off from where the person is."""
    return trip_lead(p, p.place, c.place)


def add_commitment(p, c):
    bisect.insort(p.commitments, c, key=lambda x: x.start)


def next_commitment(p, t):
    """Earliest start whose end is still ahead; of several already due, the latest start.
    A commitment with under 5 minutes left counts as over."""
    cs = p.commitments
    while cs and cs[0].end < t + 5:
        cs.pop(0)
    due = None
    for c in cs:
        if c.start > t:
            return due or c
        if c.end >= t + 5:
            due = c
    return due


def following_commitment(p, t):
    return next((c for c in p.commitments if c.start > t), None)


def fits(p, start, end, place):
    return all(c.end + trip_lead(p, c.place, place) <= start or end + trip_lead(p, place, c.place) <= c.start
               for c in p.commitments)


def work_on(p, day):
    return next((c for c in p.commitments if c.activity == "work" and c.start // DAY == day), None)


def home_by(p, day, t):
    """Predicted to be home at t: no work that day, or the work day plus the trip home ends by t."""
    c = work_on(p, day)
    return c is None or c.end + trip_lead(p, c.place, "home") <= t


def poisson(r, mean):
    k, q, floor = 0, r.random(), math.exp(-mean)
    while q > floor:
        k += 1
        q *= r.random()
    return k


def plan_week(world, w0):
    """w0 is the Monday 00:00 the week starts at.  Workplaces first, then households
    (they read work ends), then each person's habits into what is left."""
    for w in world.workplaces:
        plan_work(world, w, w0)
    for h in world.households:
        plan_household(world, h, w0)
    for p in world.people:
        plan_habits(world, p, w0)


def plan_work(world, w, w0):
    r, day0, present = w.rand, w0 // DAY, {d: [] for d in range(7)}
    for pid in w.members:
        p, tr = world.people[pid], world.people[pid].traits
        if w.seven_day:                                                    # a roster: two days off in a row, a full weekend every fourth week
            k = w.roster.get(pid, r.randrange(4))
            w.roster[pid] = (k + 1) % 4
            days = [d for d in range(7) if d not in ROSTER[k]]
        else:
            days = [d for d in range(7) if r.random() < (0.88 if d < 5 else 0.04)]   # 0.80 of the employed work on a weekday, 0.30 on a weekend day
        weekdays = [d for d in days if d < 5]
        at_home = set(r.sample(weekdays, min(tr.home_days, len(weekdays))))
        shift = 300 if tr.afternoon_shift else 0
        for d in days:
            # The schedule itself moves from day to day.  Without this a person's work day began
            # and ended within about 5 minutes of the same clock time every weekday of the year:
            # nobody was ever called in early, stayed late or got away at four.
            start = w0 + d * DAY + w.start_minute + tr.start_offset_min + shift + round(r.gauss(0, 8))
            stretch = clamp(r.gauss(1.0, 0.10), 0.7, 1.35)              # ~50 min sd on a full day
            if r.random() < 0.04:                                          # a half day, or a long one
                stretch *= r.choice((0.6, 1.25))
            length = round(tr.day_len_min * (0.72 if d >= 5 else 1) * stretch)
            cut = w0 + d * DAY + w.lunch_minute + shift + round(r.gauss(0, 10)) if tr.day_len_min >= 360 else 0
            pause = start + r.randint(120, 240) if length >= 300 else 0    # 0.724 of workers on a day worked are working at 11:00
            if pause and cut and cut - 60 < pause < cut + 120:             # an hour clear of lunch: the afternoon instead
                pause = cut + r.randint(120, 180)
            add_commitment(p, Commitment(world.new_id(), start, start + length, "home" if d in at_home else "work",
                                         "work", f"workplace:{w.id}", frozenset(), cut, pause))
            present[d].append(pid)
    def clear(s, e):                                                       # meetings keep out of the lunch hour: noon and the workplace's own cut
        return (e <= 705 or s >= 780) and (e <= w.lunch_minute - 30 or s >= w.lunch_minute + 45)
    for d in range(7 if w.seven_day else 5):
        for _ in range(poisson(r, len(present[d]) * 2.5 / 27.5)):      # ~2.5 meetings per member-week
            length = r.choices((30, 45, 60), (5, 2, 3))[0]
            start = w0 + d * DAY + r.choice([s for k in range(6, 31) if clear(s := w.start_minute + 15 * k, s + length)])
            end = start + length
            able = [pid for pid in present[d] if covers_work(world.people[pid], day0 + d, start, end)]
            if len(able) < 3:
                continue
            ids = frozenset(r.sample(able, r.randint(3, min(8, len(able)))))
            w.meetings.append((start, end, ids))
            for pid in ids:
                p, work = world.people[pid], work_on(world.people[pid], day0 + d)
                add_commitment(p, Commitment(world.new_id(), start, end, work.place, "meeting", f"workplace:{w.id}", ids - {pid}))
                cut = work.lunch_cut                                       # a meeting within 45 min after the cut moves lunch past it
                for m in sorted((x for x in p.commitments if x.activity == "meeting" and x.start // DAY == day0 + d), key=lambda x: x.start):
                    if cut and m.start - 45 < cut < m.end:
                        cut = m.end
                if cut != work.lunch_cut:
                    p.commitments[p.commitments.index(work)] = replace(work, lunch_cut=cut)


def covers_work(p, day, start, end):
    """At work (or working from home) 15 min either side, and nothing else booked over it."""
    c = work_on(p, day)
    return (c is not None and c.start <= start - 15 and end + 15 <= c.end
            and all(x is c or x.end <= start or x.start >= end for x in p.commitments))


def plan_household(world, h, w0):
    """A household of two or more eats together every evening its members are home; a single
    person's dinner is posted on 85 % of weekdays and 70 % of weekend days.  Lunch has a minute
    a day for everyone at home.  The cook is the next member of the rota home in time; the
    dishes go to an eater who did not cook."""
    r, day0 = h.rand, w0 // DAY
    people = [world.people[i] for i in h.members]
    dinner_days = {d for d in range(7) if len(people) > 1 or r.random() < (0.85 if d < 5 else 0.7)}
    for d in range(7):
        h.lunch_at[day0 + d] = w0 + d * DAY + round(r.gauss(740, 20))          # 12:20; lunch peak 12:00-13:00
    for d in sorted(dinner_days):
        dinner = w0 + d * DAY + h.dinner_minute + round(r.gauss(0, 15))
        end = dinner + minutes(r, 25, 0.3, 20, 60)
        eaters = [p for p in people if home_by(p, day0 + d, dinner + 30)]
        ids = frozenset(p.id for p in eaters)
        for p in eaters:
            add_commitment(p, Commitment(world.new_id(), dinner, end, "home", "dinner", f"household:{h.id}", ids - {p.id}))
        prep, cook = minutes(r, 55, 0.25, 30, 80), None
        for i in range(len(people)):                       # cook rota: next member home in time
            p = people[(h.cook_index + i) % len(people)]
            if home_by(p, day0 + d, dinner - prep) and fits(p, dinner - prep, dinner, "home"):
                add_commitment(p, Commitment(world.new_id(), dinner - prep, dinner, "home", "cook", f"household:{h.id}"))
                h.cook_index, cook = (h.cook_index + i + 1) % len(people), p
                break
        tidy = minutes(r, 22, 0.3, 10, 35)                         # dishes: the next eater on the rota after the cook, else the cook
        washer = next((q for i in range(len(people)) if (q := people[(h.cook_index + i) % len(people)]) in eaters and q is not cook), cook)
        if washer is not None and fits(washer, end, end + tidy, "home"):
            add_commitment(washer, Commitment(world.new_id(), end, end + tidy, "home", "dishes", f"household:{h.id}"))
        h.dinners.append(dinner)
    if r.random() < 0.5:                                   # one weekend outing, everyone free: the first day two can go (all, alone)
        minute, length = 15 * r.randint(40, 60), 15 * r.randint(8, 16)     # 10:00-15:00, 2-4 h
        for d in r.sample((5, 6), 2):
            start = w0 + d * DAY + minute
            going = [p for p in people if fits(p, start, start + length, "out")]
            if len(going) >= min(2, len(people)):
                ids = frozenset(p.id for p in going)
                for p in going:
                    add_commitment(p, Commitment(world.new_id(), start, start + length, "out", "outing", f"household:{h.id}", ids - {p.id}))
                break
    if r.random() < 0.6:                                   # one errands block, one member
        p = r.choice(people)
        start = w0 + r.choice((5, 6)) * DAY + 15 * r.randint(36, 68)    # 09:00-17:00
        end = start + 15 * r.randint(3, 8)                               # 45-120 min
        if fits(p, start, end, "out"):
            add_commitment(p, Commitment(world.new_id(), start, end, "out", "errands", f"household:{h.id}"))


def plan_habits(world, p, w0):
    for hb in p.traits.habits:
        for d in hb.days:
            if p.rand.random() >= 0.85:
                continue
            for late in (0, 60, 120):                      # usual minute, or an hour or two later
                start = w0 + d * DAY + hb.minute + late
                end = start + round(hb.duration * p.rand.uniform(0.8, 1.2))
                if fits(p, start, end, hb.place) and end + travel_min(p, hb.place, "home") <= w0 + d * DAY + p.traits.bedtime_minute:
                    add_commitment(p, Commitment(world.new_id(), start, end, hb.place, hb.name, "self"))
                    break
