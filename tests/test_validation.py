"""Tests for schedule validation."""

from __future__ import annotations

import unittest

from models import Activity
from modules.validation import validate_day, validate_week


class TestValidation(unittest.TestCase):
    def test_detects_overflow(self) -> None:
        activities = [
            Activity("sleep", 600, 1.0, optional=False, priority=1),
            Activity("work", 900, 1.0, optional=False, priority=2),
        ]
        for activity in activities:
            activity.actual_duration = activity.base_duration_minutes

        issues = validate_day("monday", activities)
        self.assertTrue(any(issue.issue_type == "overflow" for issue in issues))

    def test_sleep_shortage(self) -> None:
        sleep = Activity("sleep", 200, 1.0, optional=False, priority=1)
        sleep.actual_duration = 200
        issues = validate_day("monday", [sleep])
        self.assertTrue(any(issue.issue_type == "insufficient_sleep" for issue in issues))

    def test_weekly_sleep_warning(self) -> None:
        short_sleep = Activity("sleep", 100, 1.0, optional=False, priority=1)
        short_sleep.actual_duration = 100
        week_schedule = {
            "monday": [short_sleep],
            "tuesday": [short_sleep],
            "wednesday": [short_sleep],
            "thursday": [short_sleep],
            "friday": [short_sleep],
            "saturday": [short_sleep],
            "sunday": [short_sleep],
        }
        issues = validate_week(week_schedule)
        self.assertTrue(
            any(issue.issue_type == "insufficient_sleep_week" for issue in issues)
        )


if __name__ == "__main__":
    unittest.main()
