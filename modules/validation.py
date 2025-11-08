"""Centralised validation helpers for generated schedules."""

from __future__ import annotations

from typing import Dict, Iterable, List, Sequence, Tuple

from models import Activity, ScheduleIssue

__all__ = [
    "assert_day_coverage",
    "validate_day",
    "validate_week",
]


EventTuple = Tuple[int, int, str]


def assert_day_coverage(day_name: str, events: Sequence[EventTuple]) -> None:
    """Ensure an ordered list of events covers the full day without gaps."""

    if not events:
        raise ValueError("Day has no events")

    current = 0
    for start, end, _ in events:
        if start != current:
            raise ValueError(f"Gap detected in {day_name}")
        if end <= start:
            raise ValueError(f"Invalid event duration in {day_name}")
        current = end

    if current != 1440:
        raise ValueError(f"Day {day_name} does not cover full 24 hours")


def _detect_overflow(day_name: str, total_minutes: int) -> List[ScheduleIssue]:
    if total_minutes <= 1440:
        return []

    overflow = total_minutes - 1440
    return [
        ScheduleIssue(
            day=day_name,
            issue_type="overflow",
            severity="warning",
            details=f"Day exceeds 24h by {overflow} minutes",
        )
    ]


def _detect_sleep_shortage(day_name: str, activities: Iterable[Activity]) -> List[ScheduleIssue]:
    sleep_blocks = [activity for activity in activities if activity.name == "sleep"]
    if not sleep_blocks:
        return []

    shortest = min(block.actual_duration for block in sleep_blocks)
    if shortest >= 240:
        return []

    return [
        ScheduleIssue(
            day=day_name,
            issue_type="insufficient_sleep",
            severity="error",
            details="Sleep duration fell below 4 hours",
        )
    ]


def validate_day(day_name: str, activities: Iterable[Activity]) -> List[ScheduleIssue]:
    """Validate a single day's activities and return any issues."""

    activities = list(activities)
    total_minutes = sum(activity.actual_duration for activity in activities)

    issues: List[ScheduleIssue] = []
    issues.extend(_detect_overflow(day_name, total_minutes))
    issues.extend(_detect_sleep_shortage(day_name, activities))
    return issues


def validate_week(week_schedule: Dict[str, List[Activity]]) -> List[ScheduleIssue]:
    """Validate the activities for an entire week."""

    issues: List[ScheduleIssue] = []
    for day_name, activities in week_schedule.items():
        issues.extend(validate_day(day_name, activities))
    return issues
