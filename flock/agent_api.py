"""What agents see and send: observations, pings, replies, slots; reply latency and the
verdict on an invite.  World.observe/ping/request_slot/replies wrap these."""
from dataclasses import dataclass
from typing import NamedTuple

from .clock import DAY, day_start, weekday
from .commitments import Commitment, travel_min, add_commitment


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


class Reply(NamedTuple):
    ping_id: int
    person: int
    delivered_at: int
    decision: str            # answered | accept | decline | counter
    counter: Slot | None


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
    deferred: bool = False   # waiting for the running activity to end


def latency_multiplier(nag):
    return 1 + 0.25 * nag


def accept_probability(base, nag):
    return max(0.0, base - 0.08 * nag)


LATENCY_MEAN = {"sleep": 8, "meeting": 4, "appointment": 4, "commute": 3, "phone": 3, "cook": 3, "wash": 3,
                "work:focused": 25, "work:routine": 10, "tv": 4, "read": 4, "personal": 4, "walk": 4, "idle": 4}
WAITS_FOR_END = {"sleep", "meeting", "appointment", "commute", "phone", "cook", "wash"}


def reply_latency(p, t, r, nag):
    """Minutes until the reply, given what the person is doing now."""
    kind = p.activity.partition(":")[0]
    wait = p.ends_at - t + (p.traits.prep_min if kind == "sleep" else 0) if kind in WAITS_FOR_END else 0
    mean = LATENCY_MEAN.get(p.activity, LATENCY_MEAN.get(kind, 14))
    return wait + r.expovariate(1 / mean) * latency_multiplier(nag) / p.traits.responsiveness


def sleep_windows(p, t0, t1, tonight=None):
    """Predicted nights from the trait bedtime; `tonight` (p.bed_tonight) replaces its own night."""
    a = day_start(t0 - 300) - DAY
    while a < t1:
        b = a + p.traits.bedtime_minute + (25 if weekday(a) in (4, 5) else 0)
        if tonight is not None and a == day_start(tonight - 300):
            b = tonight
        yield b - 60, b + p.traits.sleep_need_min + 75      # margins cover the night-to-night jitter
        a += DAY


def free_windows(p, t, horizon):
    """Gaps between commitments (travel included) and predicted sleep, from t on."""
    busy = sorted([(c.start - travel_min(p, "home", c.place), c.end + travel_min(p, "home", c.place))
                   for c in p.commitments if c.end > t] + list(sleep_windows(p, t, t + horizon, p.bed_tonight)))
    cursor, gaps = t, []
    for s, e in busy:
        if s > cursor:
            gaps.append((cursor, s))
        cursor = max(cursor, e)
    if cursor < t + horizon:
        gaps.append((cursor, t + horizon))
    return gaps


def request_slot(p, t, duration, window, place="out"):
    lo, hi = window
    slots = []
    for s, e in free_windows(p, t, hi - t):
        s, e = max(s, lo) + 15, min(e, hi) - 15
        if e - s >= duration:
            slots.append(Slot(s, s + duration, place))
        if len(slots) == 3:
            break
    return slots


def verdict(world, p, ping, t):
    """Decision at delivery time.  Sleep, meetings, dinners and appointments are firm;
    work is nearly so; the rest is sociability minus nagging."""
    if ping.kind == "question":
        return "answered", None
    slot = ping.payload
    counter = next(iter(request_slot(p, t, slot.end - slot.start, (t, t + 2 * DAY), slot.place)), None)

    def overlaps(c):
        travel = travel_min(p, c.place, slot.place)
        return c.start < slot.end + travel and slot.start - travel < c.end

    busy = [c.activity for c in p.commitments if overlaps(c)]
    asleep = any(s < slot.end and slot.start < e for s, e in sleep_windows(p, slot.start, slot.end, p.bed_tonight))
    if slot.start <= t or asleep or {"meeting", "dinner", "appointment"} & set(busy):
        return "decline", counter
    base = 0.15 if "work" in busy else 0.4 + 0.4 * p.traits.sociability
    if ping.rand.random() < accept_probability(base, ping.nag):
        add_commitment(p, Commitment(world.new_id(), slot.start, slot.end, slot.place, "appointment", ping.agent_id))
        world.push(slot.start - 20, f"person:{p.id}", "commitment_start", 0)
        return "accept", None
    return ("counter", counter) if counter else ("decline", None)
