"""Agent API: observe, ping, request_slot, replies; latency and nag rules."""
from flock.clock import DAY
from flock.agent_api import Slot, latency_multiplier, accept_probability
from flock.world import World


def test_functions_of_nag_are_monotone():
    assert all(latency_multiplier(k) <= latency_multiplier(k + 1) for k in range(12))
    assert all(accept_probability(0.7, k) >= accept_probability(0.7, k + 1) for k in range(12))
    assert accept_probability(0.7, 20) == 0


def test_observe_ping_and_reply_round_trip():
    world = World(1, 100)
    t = DAY + 9 * 60
    world.run_until(t)
    o = world.observe(17, t)
    assert o.since <= t <= o.expected_end and o.place in ("home", "work", "out", "transit")
    handle = world.ping(17, t, "agent-a", "question")
    assert handle.sent_at == t and world.replies("agent-a", t) == []
    world.run_until(t + DAY)
    replies = world.replies("agent-a", t)
    assert len(replies) == 1 and replies[0].decision == "answered" and replies[0].person == 17
    assert replies[0].delivered_at > t
    assert world.replies("agent-b", t) == []


def test_request_slot_avoids_work_and_sleep():
    world = World(1, 100)
    t = DAY + 10 * 60
    world.run_until(t)
    worker = next(p for p in world.people if p.workplace_id is not None)
    slots = world.request_slot(worker.id + 1, t, 60, (t, t + DAY))      # ids are 1-based in the agent calls
    assert len(slots) <= 3
    for s in slots:
        assert isinstance(s, Slot) and s.end - s.start == 60
        assert not any(c.activity == "work" and c.start < s.end and s.start < c.end for c in worker.commitments)
        assert not (1290 <= s.start % DAY or s.start % DAY < 300)      # never 21:30-05:00


def test_ninth_ping_in_a_day_is_ignored():
    world = World(1, 100)
    t = DAY + 10 * 60
    world.run_until(t)
    for i in range(40):
        world.run_until(t + 3 * i)
        world.ping(5, t + 3 * i, "nagger", "question")
    world.run_until(t + 2 * DAY)
    assert len(world.replies("nagger", 0)) == 8


def test_sleep_time_invite_is_declined_with_counter_and_accepts_become_appointments():
    world = World(1, 200)
    t = DAY + 10 * 60
    world.run_until(t)
    at_home = [p for p in world.people if p.place == "home" and p.activity not in ("sleep", "commute")][:40]
    invites = {}
    for p in at_home:
        night = 2 * DAY + 180
        world.ping(p.id + 1, t, "booker", "invite", Slot(night, night + 60, "out"))
        slots = world.request_slot(p.id + 1, t, 60, (t + 120, t + DAY))
        if slots:                                           # a full day may offer nothing
            invites[world.ping(p.id + 1, t, "booker", "invite", slots[0]).ping_id] = slots[0]
    world.run_until(t + 2 * DAY)
    replies = world.replies("booker", t)
    night_replies = [r for r in replies if r.ping_id not in invites]
    # Every night invite is refused for being at sleep time.  A counter comes with it when the
    # person still has an hour free — not always, since the second invite below may just have
    # booked their only one.
    assert night_replies and all(r.decision == "decline" and r.reason == "asleep" for r in night_replies)
    countered = [r for r in night_replies if r.counter is not None]
    assert len(countered) >= 0.8 * len(night_replies)
    for r in countered:
        assert not any(s.activity == "sleep" and s.start < r.counter.end and r.counter.start < s.end
                       for s in world.segments(world.person(r.person)))
    accepted = [r for r in replies if r.ping_id in invites and r.decision == "accept"]
    assert accepted
    for r in accepted:
        slot = invites[r.ping_id]
        log = world.segments(world.person(r.person))
        # The appointment has to happen at the slot; the person may set off with the day's slack
        # and arrive a few minutes into it, so this does not demand it cover the slot exactly.
        assert any(s.activity == "appointment" and s.start < slot.end and slot.start < s.end for s in log)
