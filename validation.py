"""Validation helpers for generated schedules."""

from __future__ import annotations

from typing import Dict, Iterable, List

from models import Activity, ScheduleIssue


def validate_day(day_name: str, activities: Iterable[Activity]) -> List[ScheduleIssue]:
    """Validate a single day's activities and return any issues."""

    total_minutes = sum(activity.actual_duration for activity in activities)
    issues: List[ScheduleIssue] = []

    if total_minutes > 1440:
        overflow = total_minutes - 1440
        issues.append(
            ScheduleIssue(
                day=day_name,
                issue_type="overflow",
                severity="warning",
                details=f"Day exceeds 24h by {overflow} minutes",
            )
        )

    sleep_blocks = [activity for activity in activities if activity.name == "sleep"]
    if sleep_blocks and min(block.actual_duration for block in sleep_blocks) < 240:
        issues.append(
            ScheduleIssue(
                day=day_name,
                issue_type="insufficient_sleep",
                severity="error",
                details="Sleep duration fell below 4 hours",
            )
        )

    return issues


def validate_week(week_schedule: Dict[str, List[Activity]]) -> List[ScheduleIssue]:
    """Validate the activities for an entire week."""

    issues: List[ScheduleIssue] = []
    for day_name, activities in week_schedule.items():
        issues.extend(validate_day(day_name, activities))
    return issues
