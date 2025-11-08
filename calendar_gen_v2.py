"""Synthetic workforce calendar engine."""

from __future__ import annotations

import argparse
import json
from datetime import date
from pathlib import Path
from typing import Dict, Optional

from engines.engine_mk2 import (
    DayPlan,
    EngineMK2,
    apply_micro_jitter,
    apply_seasonal_modifiers,
    apply_special_period_effects,
)
from rigs.workforce_rig import WorkforceRig
from models import ActivityTemplate, PersonProfile
from modules.unique_events import UniqueDay
from yearly_budget import YearlyBudget

_rig = WorkforceRig()

__all__ = [
    "DayPlan",
    "EngineMK2",
    "apply_micro_jitter",
    "apply_seasonal_modifiers",
    "apply_special_period_effects",
    "generate_complete_week",
]


def generate_complete_week(
    profile: PersonProfile,
    start_date: date,
    week_seed: int,
    templates: Optional[Dict[str, ActivityTemplate]] = None,
    yearly_budget: Optional[YearlyBudget] = None,
) -> Dict[str, object]:
    """Generate a complete timed schedule for a week."""

    return _rig.generate_complete_week(profile, start_date, week_seed, templates, yearly_budget)


def _select_profile(archetype: str):
    return _rig.select_profile(archetype)


def _load_yearly_budget(path: Optional[Path]) -> Optional[YearlyBudget]:
    if not path:
        return None

    budget_data = json.loads(path.read_text())
    yearly_budget = YearlyBudget(
        person_id=budget_data["person_id"],
        year=int(budget_data["year"]),
        vacation_days=int(budget_data.get("vacation_days", 20)),
        sick_days_taken=int(budget_data.get("sick_days_taken", 0)),
    )
    for entry in budget_data.get("unique_days", []):
        yearly_budget.add_unique_day(
            UniqueDay(
                date=date.fromisoformat(entry["date"]),
                day_type=entry["day_type"],
                rules=entry.get("rules", {}),
                priority=int(entry.get("priority", 5)),
            )
        )
    return yearly_budget


def main() -> None:
    parser = argparse.ArgumentParser(description="Synthetic workforce calendar engine")
    parser.add_argument("--archetype", choices=["office", "parent", "freelancer"], default="office")
    parser.add_argument("--output", type=Path, required=True, help="Where to write the generated JSON")
    parser.add_argument("--seed", type=int, default=42, help="Random seed controlling stochastic variation")
    parser.add_argument("--start-date", type=str, default=None, help="ISO start date for the schedule")
    parser.add_argument(
        "--yearly-budget",
        type=Path,
        default=None,
        help="Optional path to a yearly budget JSON file",
    )
    args = parser.parse_args()

    start = date.fromisoformat(args.start_date) if args.start_date else date.today()
    profile, templates = _select_profile(args.archetype)

    yearly_budget = _load_yearly_budget(args.yearly_budget)
    result = generate_complete_week(profile, start, args.seed, templates, yearly_budget)

    args.output.write_text(json.dumps(result, indent=2))

    print(f"Generated week for {profile.name}")
    print(f"Week starting: {result['week_start']}")
    print(f"Events: {result['metadata']['total_events']}")
    if result["issues"]:
        print(f"⚠️  {result['metadata']['issue_count']} issues detected")
        for issue in result["issues"]:
            print(f"  - {issue['day']}: {issue['details']} ({issue['severity']})")
    else:
        print("No major issues detected")

    print("Summary (hours):")
    for activity, hours in sorted(result["metadata"]["summary_hours"].items()):
        print(f"  {activity}: {hours:.2f}")

    print(f"Schedule saved to {args.output}")


if __name__ == "__main__":
    main()
