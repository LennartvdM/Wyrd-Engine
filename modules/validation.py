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


def _detect_weekly_sleep_shortage(
    week_schedule: Dict[str, List[Activity]]
) -> List[ScheduleIssue]:
    if not week_schedule:
        return []

    per_day_minutes: Dict[str, int] = {}
    for day_name, activities in week_schedule.items():
        per_day_minutes[day_name] = sum(
            activity.actual_duration for activity in activities if activity.name == "sleep"
        )

    total_sleep = sum(per_day_minutes.values())
    issues: List[ScheduleIssue] = []

    if total_sleep < 14 * 60:
        hours = round(total_sleep / 60.0, 1)
        issues.append(
            ScheduleIssue(
                day="week",
                issue_type="insufficient_sleep_week",
                severity="warning",
                details=f"Weekly sleep dropped to {hours} hours",
            )
        )

    short_days = {
        day: minutes
        for day, minutes in per_day_minutes.items()
        if minutes > 0 and minutes < 180
    }
    if short_days:
        formatted = ", ".join(f"{day} ({minutes}m)" for day, minutes in sorted(short_days.items()))
        issues.append(
            ScheduleIssue(
                day="week",
                issue_type="insufficient_sleep_day",
                severity="warning",
                details=f"Sleep below 3h on: {formatted}",
            )
        )

    return issues


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
    issues.extend(_detect_weekly_sleep_shortage(week_schedule))
    return issues
