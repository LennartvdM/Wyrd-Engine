"""Shared blocks of time planned a week ahead: work days, meetings, household dinners
and cooking, weekend outings and errands, habits.  Each is written into every member's
sorted commitment list; the decision loop only reads them."""
import bisect
import math
from dataclasses import dataclass

from .clock import DAY, clamp

INF = 10 ** 9


@dataclass(frozen=True)
class Commitment:
    id: int
    start: int
    end: int
    place: str          # home, work, out
    activity: str       # work, meeting, dinner, cook, gym, club, laundry, outing, errands, appointment
    owner: str          # "workplace:3", "household:12", "self" or an agent id
    with_ids: frozenset = frozenset()
    lunch_cut: int = 0  # work only: when lunch starts; 0 = no lunch at work


def travel_min(p, a, b):
    if a == b:
        return 0
    if a != "out" and b != "out":
        return p.traits.commute_min          # home <-> work
    return 15


def add_commitment(p, c):
    bisect.insort(p.commitments, c, key=lambda x: x.start)


def next_commitment(p, t):
    """Earliest start whose end is still ahead; of several already due, the latest start.
    A commitment with under 5 minutes left counts as over."""
    cs = p.commitments
    while cs and cs[0].end <= t + 5:
        cs.pop(0)
    due = None
    for c in cs:
        if c.start > t:
            return due or c
        if c.end > t + 5:
            due = c
    return due


def following_commitment(p, t):
    return next((c for c in p.commitments if c.start > t), None)


def fits(p, start, end, place):
    return all(c.end + travel_min(p, c.place, place) <= start or end + travel_min(p, place, c.place) <= c.start
               for c in p.commitments)


def work_on(p, day):
    return next((c for c in p.commitments if c.activity == "work" and c.start // DAY == day), None)


def home_by(p, day, t):
    """Predicted to be home at t: no work that day, or the work day plus commute ends by t."""
    c = work_on(p, day)
    return c is None or c.end + (p.traits.commute_min if c.place == "work" else 0) <= t


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
        if w.seven_day:
            days = sorted(r.sample(range(7), 5))
        else:
            days = [d for d in range(7) if r.random() < (0.88 if d < 5 else 0.04)]
        weekdays = [d for d in days if d < 5]
        at_home = set(r.sample(weekdays, min(tr.home_days, len(weekdays))))
        shift = 300 if tr.afternoon_shift else 0
        for d in days:
            start = w0 + d * DAY + w.start_minute + tr.start_offset_min + shift
            length = round(tr.day_len_min * (0.72 if d >= 5 else 1))
            cut = w0 + d * DAY + w.lunch_minute + shift + round(r.gauss(0, 10)) if tr.day_len_min >= 360 else 0
            add_commitment(p, Commitment(world.new_id(), start, start + length, "home" if d in at_home else "work",
                                         "work", f"workplace:{w.id}", frozenset(), cut))
            present[d].append(pid)
    for d in range(7 if w.seven_day else 5):
        for _ in range(poisson(r, len(present[d]) * 2.5 / 27.5)):      # ~2.5 meetings per member-week
            start = w0 + d * DAY + w.start_minute + 15 * r.randint(6, 30)
            end = start + r.choices((30, 45, 60), (5, 2, 3))[0]
            able = [pid for pid in present[d] if covers_work(world.people[pid], day0 + d, start, end)]
            if len(able) < 3:
                continue
            ids = frozenset(r.sample(able, r.randint(3, min(8, len(able)))))
            w.meetings.append((start, end, ids))
            for pid in ids:
                p = world.people[pid]
                add_commitment(p, Commitment(world.new_id(), start, end, work_on(p, day0 + d).place,
                                             "meeting", f"workplace:{w.id}", ids - {pid}))


def covers_work(p, day, start, end):
    """At work (or working from home) 15 min either side, and nothing else booked over it."""
    c = work_on(p, day)
    return (c is not None and c.start <= start - 15 and end + 15 <= c.end
            and all(x is c or x.end <= start or x.start >= end for x in p.commitments))


def plan_household(world, h, w0):
    r, day0 = h.rand, w0 // DAY
    people = [world.people[i] for i in h.members]
    h.dinner_days = {d for d in range(7) if r.random() < (0.85 if d < 5 else 0.7)}
    for d in sorted(h.dinner_days):
        dinner = w0 + d * DAY + h.dinner_minute + round(r.gauss(0, 10))
        end = dinner + clamp(round(r.gauss(28, 10)), 15, 60)
        eaters = [p for p in people if home_by(p, day0 + d, dinner + 30)]
        ids = frozenset(p.id for p in eaters)
        for p in eaters:
            add_commitment(p, Commitment(world.new_id(), dinner, end, "home", "dinner", f"household:{h.id}", ids - {p.id}))
        for i in range(len(people)):                       # cook rota: next member home in time
            p = people[(h.cook_index + i) % len(people)]
            if home_by(p, day0 + d, dinner - 45) and fits(p, dinner - 45, dinner, "home"):
                add_commitment(p, Commitment(world.new_id(), dinner - 45, dinner, "home", "cook", f"household:{h.id}"))
                h.cook_index = (h.cook_index + i + 1) % len(people)
                break
        h.dinner_ends[dinner] = end
        h.dinners.append(dinner)
        world.push(dinner, f"household:{h.id}", "dinner_call", 0)
    if r.random() < 0.5:                                   # one weekend outing, everyone free
        start = w0 + r.choice((5, 6)) * DAY + 15 * r.randint(40, 60)   # 10:00-15:00
        end = start + 15 * r.randint(8, 16)                              # 2-4 h
        going = [p for p in people if fits(p, start, end, "out")]
        ids = frozenset(p.id for p in going)
        for p in going:
            add_commitment(p, Commitment(world.new_id(), start, end, "out", "outing", f"household:{h.id}", ids - {p.id}))
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
                end = start + hb.duration
                if fits(p, start, end, hb.place) and end + travel_min(p, hb.place, "home") <= w0 + d * DAY + p.traits.bedtime_minute:
                    add_commitment(p, Commitment(world.new_id(), start, end, hb.place, hb.name, "self"))
                    break
