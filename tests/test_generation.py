"""Integration tests for the complete generator."""

from __future__ import annotations

import unittest
from datetime import date

from archetypes import create_office_worker
from calendar_gen_v2 import generate_complete_week
from models import PersonProfile, WeeklyBudget


class TestGeneration(unittest.TestCase):
    def test_week_generation_covers_full_week(self) -> None:
        profile = create_office_worker()
        start = date(2025, 1, 6)
        result = generate_complete_week(profile, start, week_seed=7)

        self.assertEqual(result["week_start"], "2025-01-06")
        self.assertGreater(result["metadata"]["total_events"], 0)
        event_dates = {event["date"] for event in result["events"]}
        self.assertEqual(len(event_dates), 7)

        totals = result["metadata"]["summary_hours"]
        self.assertIn("sleep", totals)
        self.assertIn("free time", totals)
        self.assertGreater(sum(totals.values()), 150.0)

        minutes_per_day = {}
        for event in result["events"]:
            minutes_per_day.setdefault(event["date"], 0)
            minutes_per_day[event["date"]] += event["duration_minutes"]
        self.assertTrue(all(total >= 1400 for total in minutes_per_day.values()))

    def test_high_waste_profile_triggers_warnings(self) -> None:
        profile = PersonProfile(
            name="Overworked",
            budget=WeeklyBudget(sleep_hours=40, work_hours=80, gym_hours=0, social_hours=0, chores_hours=0),
            base_waste_factor=1.6,
            friction_variance=0.05,
        )
        start = date(2025, 1, 6)
        result = generate_complete_week(profile, start, week_seed=3)
        overflow_issues = [issue for issue in result["issues"] if issue["issue_type"] == "overflow"]
        self.assertTrue(overflow_issues)


if __name__ == "__main__":
    unittest.main()
