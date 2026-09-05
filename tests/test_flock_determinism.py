"""Determinism: same seed, same logs; a new person changes nothing; pings touch one person.
Plus the performance budget (marked slow)."""
import hashlib
import time

import pytest

from flock.clock import DAY, WEEK
from flock.people import make_population
from flock.world import World


def log_hash(world, person):
    return hashlib.sha256(repr(world.segments(person)).encode()).hexdigest()


def test_same_seed_gives_identical_logs():
    a, b = World(3, 120), World(3, 120)
    a.run_until(WEEK)
    b.run_until(WEEK)
    assert [log_hash(a, p) for p in a.people] == [log_hash(b, p) for p in b.people]
    c = World(4, 120)
    c.run_until(WEEK)
    assert log_hash(a, a.people[0]) != log_hash(c, c.people[0])


def test_extra_person_in_new_household_and_workplace_changes_nobody():
    n = next(n for n in range(30, 400)
             if make_population(1, n + 1)[1][-1].members == [n]
             and (make_population(1, n + 1)[0][n].workplace_id is None or make_population(1, n + 1)[2][-1].members == [n]))
    small, big = World(1, n), World(1, n + 1)
    small.run_until(WEEK)
    big.run_until(WEEK)
    assert [log_hash(small, p) for p in small.people] == [log_hash(big, p) for p in big.people[:n]]


def without_phone_splits(segments):
    """Drop phone calls and rejoin the activity each one interrupted."""
    merged, after_phone = [], False
    for s in segments:
        if s.activity == "phone":
            after_phone = True
            continue
        if after_phone and merged and merged[-1].activity == s.activity:
            merged[-1] = merged[-1]._replace(end=s.end)
        else:
            merged.append(s)
        after_phone = False
    return merged


def test_two_hundred_question_pings_touch_only_person_17():
    quiet, pinged = World(1, 150), World(1, 150)
    quiet.run_until(WEEK)
    t = 8 * 60
    for sent in range(200):                                # 25 agents, so the nag limit spares most pings
        pinged.run_until(t)
        pinged.ping(17, t, f"asker{sent // 8}", "question")
        t += 30                                            # done by Friday, no phone call at the run end
    pinged.run_until(WEEK)
    assert sum(len(pinged.replies(f"asker{k}", 0)) for k in range(25)) > 100
    for p in quiet.people:
        if p.id != 17:
            assert log_hash(quiet, p) == log_hash(pinged, p)
    assert any(s.activity == "phone" for s in pinged.segments(pinged.people[17]))
    assert without_phone_splits(pinged.segments(pinged.people[17])) == quiet.segments(quiet.people[17])


@pytest.mark.slow
def test_thousand_people_four_weeks_under_thirty_seconds():
    start = time.perf_counter()
    world = World(1, 1000)
    world.run_until(4 * WEEK)
    assert time.perf_counter() - start < 30
    assert world.seq < 800_000
