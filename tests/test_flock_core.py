"""Unit tests for the clock, seeds, population, sleep rules and free-time picks."""
import random
from collections import Counter

from flock.clock import DAY, WEEK, fmt, day_start, weekday
from flock.seeds import stream
from flock.people import make_population
from flock.sleep_and_meals import bedtime_at, sleep_end, wake_up
from flock.free_time import pick_free_activity, ROWS
from flock.commitments import Commitment, add_commitment
from flock.world import World


def test_fmt_and_day_helpers():
    assert fmt(1875) == "Tue 07:15"
    assert fmt(-60) == "Sun 23:00"
    assert day_start(3 * DAY + 999) == 3 * DAY and weekday(-1) == 6


def test_stream_is_a_function_of_seed_and_labels():
    a, b, c = stream(1, "person", 7), stream(1, "person", 7), stream(1, "person", 8)
    assert [a.random() for _ in range(5)] == [b.random() for _ in range(5)]
    assert a.random() != c.random()
    assert isinstance(a, random.Random)


def test_population_is_reproducible_and_shaped():
    p1, h1, w1 = make_population(1, 50)
    p2, h2, w2 = make_population(1, 50)
    assert [p.traits for p in p1] == [p.traits for p in p2]
    assert [h.members for h in h1] == [h.members for h in h2]
    assert all(h.members == sorted(h.members) for h in h1)
    people, households, workplaces = make_population(1, 400)
    employed = sum(p.workplace_id is not None for p in people)
    assert 200 <= employed <= 280
    assert all(1290 <= p.traits.bedtime_minute <= 1500 for p in people)
    assert all(6 <= len(w.members) <= 40 for w in workplaces[:-1])


def test_bedtime_at_across_midnight_and_on_friday():
    person = make_population(1, 1)[0][0]
    bed = person.traits.bedtime_minute
    monday_night = bedtime_at(person, 1 * DAY + 20)        # 00:20 Tuesday belongs to Monday night
    assert monday_night == 0 * DAY + bed
    assert bedtime_at(person, 1 * DAY + 600) == 1 * DAY + bed
    assert bedtime_at(person, 4 * DAY + 600) == 4 * DAY + bed + 20      # Friday
    assert bedtime_at(person, 6 * DAY + 600) == 6 * DAY + bed           # Sunday


def test_sleep_end_with_and_without_alarm_and_debt_builds():
    people, households, _ = make_population(1, 3)
    person = people[2]
    person.commitments = []
    t = 1380
    natural = sleep_end(person, t)
    assert t + 240 <= natural and natural - t >= person.traits.sleep_need_min - 120
    early = Commitment(1, t + 420, t + 900, "work", "work", "workplace:0")
    add_commitment(person, early)
    with_alarm = sleep_end(person, t)
    latest_alarm = early.start - person.traits.commute_min - person.traits.prep_min - 5 + 10 + 25
    assert with_alarm <= latest_alarm
    person.sleep_debt = 0
    for night in range(5):                                 # five short nights build debt
        person.started_at = night * DAY
        wake_up(person, night * DAY + person.traits.sleep_need_min - 30, households[person.household_id])
    assert person.sleep_debt == 150


def test_free_time_pick_is_plausible_on_tuesday_evening():
    person = make_population(1, 1)[0][0]
    person.activity, person.place = "meal:dinner", "home"
    t = DAY + 21 * 60
    picks = Counter()
    for _ in range(200):
        person.planned = None
        got = pick_free_activity(person, t, t + 150)
        name = got[0] if got else person.planned[0]
        picks[name] += 1
        if got:
            assert t + 5 <= got[2] <= t + 150
    assert set(picks) <= {row[0] for row in ROWS}
    assert picks["tv"] > picks["errands"]
    short = pick_free_activity(person, t, t + 20)                       # a 10-29 minute gap at home: something short, to the limit
    assert short[0] in ("tv", "read", "personal") and short[2] == t + 20
    assert pick_free_activity(person, t, t + 7)[0] == "idle"


def test_week_reads_right_and_log_is_contiguous():
    world = World(1, 60)
    world.run_until(WEEK)
    for p in world.people:
        log = world.segments(p)
        assert log[0].start == 0 and log[-1].end == WEEK
        assert all(a.end == b.start for a, b in zip(log, log[1:]))
        assert all(s.end - s.start >= 5 or s.activity in ("commute", "snack", "phone") for s in log[:-1])
        kinds = {s.activity.partition(":")[0] for s in log}
        assert {"sleep", "wash", "meal"} <= kinds
    crossing = sum(any(s.activity == "sleep" and s.start // DAY != (s.end - 1) // DAY for s in world.segments(p))
                   for p in world.people)
    assert crossing >= 0.7 * len(world.people)               # night shifts may never cross midnight


def test_meetings_start_on_the_minute_and_nobody_idles_out_or_phones_from_a_walk_at_home():
    world = World(1, 200)
    walkers = []
    while world.now < 2 * DAY:                                    # ping a few people mid-walk
        world.run_until(world.now + 10)
        for p in world.people:
            if p.activity == "walk" and p.started_at < world.now < p.ends_at - 20 and len(walkers) < 5 and p.id not in walkers:
                world.ping(p.id + 1, world.now, "a", "question")
                walkers.append(p.id)
    world.run_until(WEEK)
    logs = {p.id: world.segments(p) for p in world.people}
    for w in world.workplaces:
        for start, end, ids in w.meetings:
            if end <= WEEK:
                for pid in ids:
                    assert not any(s.activity == "meeting" and s.start < start < s.end for s in logs[pid])
    assert not any(s.activity == "idle" and s.place == "out" and s.end - s.start >= 30 for log in logs.values() for s in log)
    assert walkers
    calls = [s for r in world.replies("a", 0) for s in logs[r.person - 1] if s.activity == "phone" and s.start == r.delivered_at]
    assert calls and all(s.place == "out" for s in calls)
