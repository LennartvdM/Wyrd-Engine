"""What agents see and send: observations, pings, replies, slots; reply latency and the
verdict on an invite.  World.observe/ping/request_slot/replies wrap these."""
from dataclasses import dataclass
from typing import NamedTuple

from .clock import DAY, day_start, weekday
from .commitments import Commitment, travel_min, trip_lead, add_commitment


class Slot(NamedTuple):
    start: int
    end: int
    place: str


class Observation(NamedTuple):
    activity: str
    place: str
    since: int
    expected_end: int
    interruptible: float
    with_ids: frozenset
    next_commitment_start: int | None
    next_free_window: Slot | None


class PingHandle(NamedTuple):
    ping_id: int
    sent_at: int
    ignored: bool = False    # the person has had enough of this agent for now: no reply will come


class Reply(NamedTuple):
    ping_id: int
    person: int
    delivered_at: int
    decision: str            # answered | accept | decline | counter
    counter: Slot | None
    agent_id: str = ""
    reason: str = ""         # a decline's: asleep | busy | too_late | too_far | declined (the sociability draw)


@dataclass
class Ping:
    id: int
    person: int
    agent_id: str
    kind: str                # question | invite
    payload: object
    sent_at: int
    nag: float
    rand: object             # stream(seed, "reply", person, ping_id)


def latency_multiplier(nag):
    return 1 + 0.25 * nag


def accept_probability(base, nag):
    return max(0.0, base - 0.08 * nag)


LATENCY_MEAN = {"sleep": 8, "meeting": 4, "appointment": 4, "commute": 3, "phone": 3, "cook": 3, "wash": 3,
                "class": 4, "work:focused": 25, "work:routine": 10, "break": 4, "tv": 4, "read": 4, "personal": 4, "walk": 4, "idle": 4}
WAITS_FOR_END = {"sleep", "meeting", "appointment", "class", "commute", "phone", "cook", "wash"}


def latency_parts(p, t):
    """(wait, mean): the fixed wait for what the person is doing now (a call: until it ends), and
    the mean of the random part after it."""
    kind = p.activity.partition(":")[0]
    end = p.resume[3] if kind == "phone" else p.ends_at
    wait = end - t + (round(0.6 * p.traits.prep_min) if kind == "sleep" else 0) if kind in WAITS_FOR_END else 0   # asleep: after the wash
    return wait, LATENCY_MEAN.get(p.activity, LATENCY_MEAN.get(kind, 14)) / p.traits.responsiveness


def reply_latency(p, t, r, nag):
    wait, mean = latency_parts(p, t)
    return wait + r.expovariate(1 / mean) * latency_multiplier(nag)


def sleep_windows(p, t0, t1):
    """Nights overlapping [t0, t1).  The night being slept runs from bedtime to the expected wake
    plus the morning routine and half an hour; a night already slept is over; tonight starts at
    the bedtime drawn at wake, later nights an hour before the trait bedtime; the wake side
    carries margins for the per-night draw, the sleep debt and the weekend lie-in."""
    a, last, tr = day_start(t0 - 300) - DAY, day_start(p.bed_at - 300), p.traits
    while a < t1:
        if a == last:
            if p.activity == "sleep":
                yield p.bed_at, p.ends_at + tr.prep_min + 30
        else:
            drawn = p.activity != "sleep" and a == day_start(p.bed_tonight - 300)
            b = p.bed_tonight if drawn else a + tr.bedtime_minute + (20 if weekday(a) in (4, 5) else 0)
            yield b - (0 if drawn else 60), b + tr.sleep_need_min + 90 + p.sleep_debt // 2 + (35 if weekday(a) in (4, 5) else 0)
        a += DAY


def free_windows(p, t, horizon):
    """Gaps between commitments (the trip from home included) and sleep inside [t, t + horizon).
    A gap open now while the person is away ends when they must leave where they are."""
    end = t + horizon
    busy = sorted([(c.start - trip_lead(p, "home", c.place), c.end + trip_lead(p, "home", c.place))
                   for c in p.commitments if t < c.end and c.start < end] + list(sleep_windows(p, t, end)))
    cursor, gaps = t, []
    for s, e in busy:
        if cursor < end and s > cursor:
            gaps.append((cursor, min(s, end)))
        cursor = max(cursor, e)
    if cursor < end:
        gaps.append((cursor, end))
    if gaps and gaps[0][0] == t and p.place != "home" and p.activity != "sleep":
        leave = min([c.start - trip_lead(p, p.place, c.place) for c in p.commitments if c.start >= t]
                    + [p.bed_tonight - travel_min(p, p.place, "home") - p.wind_down, gaps[0][1]])
        gaps = ([(t, leave)] if leave > t else []) + gaps[1:]
    return gaps


def request_slot(p, t, duration, window, place="out", horizon=10 ** 9):
    """Up to three offers, one per free window inside the planned horizon, each padded by the trip
    there (from where the person is if the window is open now, else from home) and back, with 30
    minutes' notice after the reply the person would give now (its fixed wait plus three times
    the mean of its random part, so an invite sent straight back arrives in time on 95 % of
    replies).  Offers are not held: a later invite is judged at delivery."""
    if type(duration) is not int or duration < 1:
        raise ValueError(f"duration {duration!r} is not a whole number of minutes, at least 1")
    if not (isinstance(window, tuple) and len(window) == 2 and all(type(x) is int for x in window)):
        raise ValueError(f"window {window!r} is not a (start, end) pair of whole minutes")
    if not window[0] <= window[1]:
        raise ValueError(f"window {window!r} ends before it starts")
    if window[1] <= t:
        raise ValueError(f"window {window!r} is over at t = {t}")
    if place not in ("home", "out", "work"):
        raise ValueError(f"place {place!r} is not home, out or work")
    wait, mean = latency_parts(p, t)
    lo, hi = max(window[0], t + 30 + round(wait + 3 * mean)), min(window[1], horizon)
    pad = travel_min(p, "home", place) + 5
    slots = []
    for s, e in free_windows(p, t, max(0, hi - t)):
        s = max(s + (travel_min(p, p.place, place) + 5 if s == t else pad), lo)
        e = min(e, hi) - pad
        if e - s >= duration:
            slots.append(Slot(s, s + duration, place))
        if len(slots) == 3:
            break
    return slots


def checked_slot(payload, t):
    """A Slot, or a (start, end, place) tuple, checked when the invite is sent."""
    try:
        slot = Slot(*payload)
    except TypeError:
        raise ValueError(f"an invite needs a Slot or a (start, end, place) tuple, not {payload!r}") from None
    if not (type(slot.start) is int and type(slot.end) is int):
        raise ValueError(f"slot {slot} needs whole minutes for start and end")
    if not t < slot.start < slot.end:
        raise ValueError(f"slot {slot} needs now ({t}) < start < end")
    if slot.place not in ("home", "out", "work"):
        raise ValueError(f"slot place {slot.place!r} is not home, out or work")
    return slot


def verdict(world, p, ping, t):
    """(decision, counter, reason) at delivery time.  Sleep, a slot beyond the planned weeks and
    any commitment the person does not own (work, meetings, everything the household posts, other
    appointments) are firm; the person's own habits give way; the rest is sociability minus
    nagging.  Counters are not held either."""
    if ping.kind == "question":
        return "answered", None, ""
    slot = ping.payload

    def overlaps(c):
        return c.start < slot.end + trip_lead(p, slot.place, c.place) and slot.start - trip_lead(p, c.place, slot.place) < c.end

    busy = [c for c in p.commitments if overlaps(c)]
    home = travel_min(p, slot.place, "home")
    asleep = any(s < slot.end + home and slot.start - home < e for s, e in sleep_windows(p, slot.start, slot.end))
    counter = next((s for place in (slot.place, "out") for s in request_slot(p, t, slot.end - slot.start, (t, t + 2 * DAY), place, world.planned_until)
                    if s.end <= slot.start or slot.end <= s.start), None)      # never the refused slot again; at out when the place has no fit
    leave = slot.start - trip_lead(p, p.place, slot.place)               # when the person would have to set off
    free = p.ends_at if p.resume[0] == "commute" else t                  # after this call (2-5 min), or the arrival when it is taken on the road
    reason = ("too_late" if leave < free + 5 else "asleep" if asleep else "too_far" if slot.end > world.planned_until
              else "busy" if any(c.owner != "self" for c in busy) else "")
    if reason:
        return "decline", counter, reason
    if ping.rand.random() < accept_probability(0.4 + 0.4 * p.traits.sociability, ping.nag):
        for c in busy:
            p.commitments.remove(c)
        add_commitment(p, Commitment(world.new_id(), slot.start, slot.end, slot.place, "appointment", ping.agent_id))
        world.push(leave, f"person:{p.id}", "commitment_start", 0)
        return "accept", None, ""
    return ("counter", counter, "") if counter else ("decline", None, "declined")
