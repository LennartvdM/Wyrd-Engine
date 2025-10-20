from __future__ import annotations

from datetime import date

from archetypes import create_office_worker
from calendar_gen_v2 import generate_complete_week
from calendar_layers import classify_day
from unique_days import UniqueDay, generate_unique_day_schedule
from yearly_budget import YearlyBudget


def test_unique_day_schedule_overrides_work() -> None:
    profile = create_office_worker()
    start = date(2025, 8, 4)
    yearly_budget = YearlyBudget(person_id="alice", year=2025)
    yearly_budget.add_unique_day(
        UniqueDay(
            date=start,
            day_type="vacation",
            rules={"activity": "beach", "activity_duration": 240},
        )
    )

    result = generate_complete_week(profile, start, week_seed=11, yearly_budget=yearly_budget)
    monday_events = [event for event in result["events"] if event["date"] == "2025-08-04"]

    assert any(event["activity"] == "beach" for event in monday_events)
    assert not any(event["activity"] == "work" for event in monday_events)


def test_unique_day_dispatch_returns_none_for_unknown_type() -> None:
    profile = create_office_worker()
    day = date(2025, 5, 1)
    unknown = UniqueDay(date=day, day_type="mystery", rules={})

    assert generate_unique_day_schedule(profile, day, unknown) is None


def test_classify_day_detects_dutch_holidays() -> None:
    kings_day = date(2025, 4, 27)
    assert classify_day(kings_day, "NL") == "public_holiday"
