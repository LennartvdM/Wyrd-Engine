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
    fresh = [n for n in range(30, 400)                                # person n+1 opens a household and a workplace (or has none)
             if make_population(1, n + 1)[1][-1].members == [n]
             and (make_population(1, n + 1)[0][n].workplace_id is None or make_population(1, n + 1)[2][-1].members == [n])]
    for n in fresh[:3]:
        small, big = World(1, n), World(1, n + 1)
        small.run_until(WEEK)
        big.run_until(WEEK)
        assert [log_hash(small, p) for p in small.people] == [log_hash(big, p) for p in big.people[:n]], n


def without_phone_splits(segments):
    """Drop phone calls and rejoin the activity each one interrupted."""
    merged, after_phone = [], False
    for s in segments:
        if s.activity == "phone":
            after_phone = True
            continue
        if after_phone and merged and merged[-1].activity == s.activity:
            merged[-1] = merged[-1]._replace(end=s.end, with_ids=merged[-1].with_ids | s.with_ids)   # a housemate may have joined during the call
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
    assert any(s.activity == "phone" for s in pinged.segments(pinged.person(17)))
    assert without_phone_splits(pinged.segments(pinged.person(17))) == quiet.segments(quiet.person(17))


def test_questions_during_household_dinners_change_nobody_else():
    """A call taken at the table hides nothing.  Everyone pinged mid-dinner keeps a symmetric
    guest list with the housemates they are eating with, including across the phone split, and
    no unpinged person's log moves.  The scenario is found rather than hard-coded, so a timing
    change elsewhere cannot quietly stop this from testing anything."""
    quiet, pinged = World(3, 120), World(3, 120)
    t = 18 * 60 + 30
    quiet.run_until(WEEK)
    pinged.run_until(t)
    asked = [p.id + 1 for p in pinged.people if p.activity == "meal:dinner" and p.with_ids]
    assert asked, "no household dinner in progress at 18:30 to ping"
    for pid in asked:
        pinged.ping(pid, t, "asker", "question")
    pinged.run_until(WEEK)

    dinners = {}
    for p in pinged.people:
        dinners[p.id] = [s for s in pinged.segments(p) if s.activity == "meal:dinner"]
    for p in pinged.people:
        for s in dinners[p.id]:
            for other in s.with_ids:
                assert any(o.start < s.end and s.start < o.end and p.id in o.with_ids
                           for o in dinners[other]), f"{p.id + 1} lists {other + 1}, not mutual"

    asked_ids = {pid - 1 for pid in asked}
    for p in quiet.people:
        if p.id not in asked_ids:
            assert log_hash(quiet, p) == log_hash(pinged, p), p.id + 1
    for pid in asked:
        assert without_phone_splits(pinged.segments(pinged.person(pid))) == quiet.segments(quiet.person(pid))


@pytest.mark.slow
def test_thousand_people_four_weeks_under_thirty_seconds():
    start = time.perf_counter()
    world = World(1, 1000)
    world.run_until(4 * WEEK)
    assert time.perf_counter() - start < 30
    assert world.seq < 800_000
