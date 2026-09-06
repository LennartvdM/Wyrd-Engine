"""Adapter between the flock package and the browser interface.

Everything here is presentation: it builds a world, keeps it, and turns segments,
observations and checks into plain dicts the page can draw.  The package itself
knows nothing about the browser.
"""

from flock.agent_api import Slot
from flock.clock import DAY, hm
from flock.report import letter_of, run_checks, demo_swarm
from flock.world import World

import io
from contextlib import redirect_stdout

# Stack order, bottom to top, and the name shown in the legend.  The letters are
# the ones flock.report.letter_of returns, so the page and the terminal agree on
# what counts as what.
CATEGORIES = [
    ("S", "sleep"),
    ("W", "work"),
    ("C", "commute"),
    ("E", "eating"),
    ("K", "chores"),
    ("H", "home"),
    ("O", "out"),
]

DAY_NAMES = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"]

_world = None
_built = None
_agent_world = None
_agent_key = None


def build(seed, people, weeks):
    """Build a world and run it to the end of the last week.  Cached by argument."""

    global _world, _built
    key = (seed, people, weeks)
    if _built != key:
        _world = World(seed=seed, n=people)
        _world.run_until(weeks * 7 * DAY)
        _built = key
    return {
        "seed": seed,
        "people": people,
        "weeks": weeks,
        "days": weeks * 7,
        "employed": sum(1 for p in _world.people if p.workplace_id is not None),
        "households": len(_world.households),
        "workplaces": len(_world.workplaces),
    }


def _segment(s, day_index):
    kind, _, label = s.activity.partition(":")
    start = s.start - day_index * DAY
    end = s.end - day_index * DAY
    return {
        "start": max(0, start),
        "end": min(DAY, end),
        "clipped_start": start < 0,
        "clipped_end": end > DAY,
        "activity": kind,
        "label": label,
        "place": s.place,
        "category": letter_of(s.activity, s.place),
        "with_ids": sorted(i + 1 for i in s.with_ids),
        "text": f"{hm(s.start)}-{hm(s.end)}",
    }


def day(person, day_index):
    """One person's day as segments clipped to that day, plus a one-line summary."""

    p = _world.person(person)
    lo, hi = day_index * DAY, (day_index + 1) * DAY
    segments = [_segment(s, day_index) for s in _world.segments(p) if s.end > lo and s.start < hi]
    minutes = {}
    for s in segments:
        minutes[s["category"]] = minutes.get(s["category"], 0) + s["end"] - s["start"]
    return {
        "person": person,
        "day_index": day_index,
        "day_name": DAY_NAMES[day_index % 7],
        "week": day_index // 7 + 1,
        "segments": segments,
        "minutes": minutes,
        "traits": traits(person),
    }


def week(person, week_index):
    """Seven days of segments for the small-multiple strip."""

    return [day(person, week_index * 7 + d) for d in range(7)]


def traits(person):
    p = _world.person(person)
    t = p.traits
    return {
        "employed": p.workplace_id is not None,
        "workplace": None if p.workplace_id is None else p.workplace_id + 1,
        "household": p.household_id + 1,
        "housemates": sorted(i + 1 for i in _world.households[p.household_id].members if i + 1 != person),
        "sleep_need_min": t.sleep_need_min,
        "bedtime": hm(t.bedtime_minute % DAY),
        "commute_min": t.commute_min,
        "habits": sorted({c.activity for c in p.commitments if c.owner == "self"}),
    }


def roster(limit=400):
    """A short description of each person, for the picker."""

    out = []
    for p in _world.people[:limit]:
        h = _world.households[p.household_id]
        out.append({
            "id": p.id + 1,
            "employed": p.workplace_id is not None,
            "household_size": len(h.members),
            "commute_min": p.traits.commute_min,
        })
    return out


BIN = 5   # minutes; the page sums these up to whatever bin width it draws


def histogram(day_key):
    """Share of person-minutes per category, in 5-minute bins.

    `day_key` is a weekday name (mon .. sun) — every day of the run that falls on it — so what is
    being pooled is always stated rather than left to the reader.  Five-minute bins rather than an
    hour because the shape inside the hour is the point: an hourly bin cannot show whether a
    morning ramp is a smooth rise or everybody arriving at once.
    """

    index = DAY_NAMES.index(day_key[:3].capitalize())
    days = [d for d in range(_world.now // DAY) if d % 7 == index]
    letters = [c[0] for c in CATEGORIES]
    nbins = DAY // BIN
    minutes = [{k: 0 for k in letters} for _ in range(nbins)]
    for p in _world.people:
        for s in _world.segments(p):
            letter = letter_of(s.activity, s.place)
            for d in days:
                lo, hi = max(s.start, d * DAY), min(s.end, (d + 1) * DAY)
                if lo >= hi:
                    continue
                base = d * DAY
                for b in range((lo - base) // BIN, (hi - 1 - base) // BIN + 1):
                    minutes[b][letter] += min(hi, base + BIN * b + BIN) - max(lo, base + BIN * b)
    rows = []
    for b in range(nbins):
        total = sum(minutes[b].values()) or 1
        rows.append({
            "minute": b * BIN,
            "shares": {k: minutes[b][k] / total for k in letters},
            "minutes": dict(minutes[b]),
        })
    return {
        "day_name": DAY_NAMES[index],
        "days": len(days),
        "people": len(_world.people),
        "person_days": len(days) * len(_world.people),
        "bin_minutes": BIN,
        "rows": rows,
    }


def carpet(day_key, limit=400):
    """One row per person-day: the day's segments as (start, end, category).

    The stacked view shows the population's totals, which is an average and hides how the
    transitions are spread.  This shows the days themselves, laid on top of each other, so a
    synchronised population reads as a straight edge and a spread one as a frayed one.
    """

    index = DAY_NAMES.index(day_key[:3].capitalize())
    days = [d for d in range(_world.now // DAY) if d % 7 == index]
    rows, wake = [], []
    for d in days:
        lo, hi = d * DAY, (d + 1) * DAY
        for p in _world.people:
            if len(rows) >= limit:
                break
            segs, woke = [], None
            for s in _world.segments(p):
                if s.end <= lo or s.start >= hi:
                    continue
                segs.append([max(0, s.start - lo), min(DAY, s.end - lo), letter_of(s.activity, s.place)])
                if woke is None and s.activity == "sleep" and s.end < hi:
                    woke = s.end - lo
            if segs:
                rows.append(segs)
                wake.append(woke if woke is not None else DAY)
    order = sorted(range(len(rows)), key=lambda i: wake[i])
    return {
        "day_name": DAY_NAMES[index],
        "rows": rows,
        "by_wake": order,
        "shown": len(rows),
        "available": len(days) * len(_world.people),
    }


def _agents_at(minute):
    """The world the agent panel talks to.

    Kept apart from the one the day and population views read, because a ping splits the activity
    it interrupts: agents must not edit the logs being displayed.  Time only moves forward, so
    asking about an earlier minute starts a fresh world.
    """

    global _agent_world, _agent_key
    seed, people, _ = _built
    if _agent_world is None or _agent_key != (seed, people) or _agent_world.now > minute:
        _agent_world = World(seed=seed, n=people)
        _agent_key = (seed, people)
    _agent_world.run_until(minute)
    return _agent_world


def observe(person, minute):
    """What an agent sees, and what it could book."""

    w = _agents_at(minute)
    o = w.observe(person, minute)
    slots = w.request_slot(person, minute, 45, (minute + 60, minute + DAY), place="out")
    return {
        "at": _stamp(minute),
        "activity": o.activity,
        "place": o.place,
        "since": _stamp(o.since),
        "expected_end": _stamp(o.expected_end),
        "interruptible": o.interruptible,
        "with_ids": sorted(i + 1 for i in o.with_ids),
        "next_commitment": None if o.next_commitment_start is None else _stamp(o.next_commitment_start),
        "offers": [{"start": _stamp(s.start), "end": _stamp(s.end), "place": s.place} for s in slots],
    }


def ask(person, minute, agent_id="page"):
    """Send a question and run forward until the reply lands."""

    w = _agents_at(minute)
    before = w.observe(person, minute)
    handle = w.ping(person, minute, agent_id, "question")
    if handle.ignored:
        return {"ignored": True, "asked_at": _stamp(minute), "was_doing": before.activity}
    for step in range(1, 25):
        w.run_until(minute + step * 60)
        found = [r for r in w.replies(agent_id, minute) if r.ping_id == handle.ping_id]
        if found:
            r = found[0]
            return {
                "ignored": False,
                "asked_at": _stamp(minute),
                "was_doing": before.activity,
                "interruptible": before.interruptible,
                "replied_at": _stamp(r.delivered_at),
                "waited_min": r.delivered_at - minute,
                "decision": r.decision,
            }
    return {"ignored": False, "asked_at": _stamp(minute), "was_doing": before.activity, "no_reply": True}


def invite(person, minute, start, end, place="out", agent_id="page"):
    """Send an invite for a slot and run forward until the verdict lands."""

    w = _agents_at(minute)
    handle = w.ping(person, minute, agent_id, "invite", Slot(start, end, place))
    if handle.ignored:
        return {"ignored": True, "asked_at": _stamp(minute)}
    for step in range(1, 25):
        w.run_until(minute + step * 60)
        found = [r for r in w.replies(agent_id, minute) if r.ping_id == handle.ping_id]
        if found:
            r = found[0]
            return {
                "ignored": False,
                "asked_at": _stamp(minute),
                "replied_at": _stamp(r.delivered_at),
                "waited_min": r.delivered_at - minute,
                "decision": r.decision,
                "reason": r.reason,
                "counter": None if r.counter is None else {
                    "start": _stamp(r.counter.start), "end": _stamp(r.counter.end), "place": r.counter.place,
                },
            }
    return {"ignored": False, "asked_at": _stamp(minute), "no_reply": True}


def swarm():
    """The demo-swarm command's output, as lines.  On its own world, for the same
    reason observe and ask are: it pings people."""

    seed, people, _ = _built
    buf = io.StringIO()
    with redirect_stdout(buf):
        demo_swarm(World(seed=seed, n=people))
    return buf.getvalue().splitlines()


def _finite(x):
    """JSON has no infinity, and several checks are open-ended on one side."""

    return None if x != x or x in (float("inf"), float("-inf")) else x


def checks(seed, people, weeks):
    """Run the realism checks and return one row per check."""

    rows = []
    for name, value, lo, hi in run_checks(seed, people, weeks):
        rows.append({
            "name": name,
            "value": _finite(value),
            "lo": _finite(lo),
            "hi": _finite(hi),
            "ok": lo <= value <= hi,
            "value_text": f"{value:.3f}" if _finite(value) is not None else "n/a",
            "lo_text": "-inf" if lo == float("-inf") else f"{lo:g}",
            "hi_text": "inf" if hi == float("inf") else f"{hi:g}",
        })
    return rows


def _stamp(minute):
    return {"minute": minute, "day": DAY_NAMES[minute // DAY % 7], "time": hm(minute), "day_index": minute // DAY}
