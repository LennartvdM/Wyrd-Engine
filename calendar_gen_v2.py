"""Synthetic workforce calendar engine."""

from __future__ import annotations

import argparse
import json
import random
from dataclasses import asdict, dataclass
from datetime import date, timedelta
from pathlib import Path
from typing import Dict, Iterable, List, Optional, Set, Tuple

from archetypes import (
    DEFAULT_TEMPLATES,
    NIGHT_OWL_TEMPLATES,
    create_exhausted_parent,
    create_night_owl_freelancer,
    create_office_worker,
)
from calendar_layers import (
    classify_day,
    generate_holiday_schedule,
    get_seasonal_modifiers,
    get_special_period_effects,
)
from friction import generate_daily_friction
from models import Activity, ActivityTemplate, Event, PersonProfile, ScheduleIssue
from unique_days import UniqueDay, generate_unique_day_schedule
from yearly_budget import YearlyBudget
from validation import validate_week


def _apply_friction(activity: Activity, friction: float) -> None:
    activity.actual_duration = max(1, int(activity.base_duration_minutes * activity.waste_multiplier * friction))


def _allocate_minutes(hours: float, days: int) -> int:
    return int(hours * 60 / days) if hours > 0 else 0


@dataclass
class DayPlan:
    """Holds generated activities and context for a single calendar day."""

    date: date
    day_name: str
    day_type: str
    activities: List[Activity]


OUTDOOR_ACTIVITIES = {"outdoor_run", "bike_ride", "park_visit", "hiking", "outdoor_walk"}


def _generate_standard_day_schedule(
    weekday_index: int,
    day_type: str,
    sleep_minutes: int,
    work_minutes: int,
    social_minutes: int,
    chores_minutes: int,
    gym_minutes: int,
) -> List[Activity]:
    activities: List[Activity] = []

    def add_activity(
        name: str,
        base_minutes: int,
        waste_multiplier: float,
        optional: bool,
        priority: int,
    ) -> None:
        if base_minutes <= 0:
            return
        activities.append(Activity(name, base_minutes, waste_multiplier, optional, priority))

    add_activity("sleep", sleep_minutes, 1.0, optional=False, priority=1)
    for meal_name in ("breakfast", "lunch", "dinner"):
        add_activity(meal_name, 30, 1.2, optional=False, priority=2)

    effective_work_minutes = work_minutes if weekday_index < 5 else 0
    if day_type == "bridge_day":
        effective_work_minutes = int(effective_work_minutes * 0.6)
    if effective_work_minutes > 0 and weekday_index < 5:
        add_activity("work", effective_work_minutes, 1.1, optional=False, priority=2)

    if gym_minutes > 0 and weekday_index in (0, 2, 4) and random.random() < 0.85:
        add_activity("gym", gym_minutes, 1.4, optional=True, priority=4)

    if social_minutes > 0 and weekday_index >= 5 and random.random() < 0.7:
        add_activity("social", social_minutes, 1.3, optional=True, priority=4)

    if chores_minutes > 0 and weekday_index in (5, 6) and random.random() < 0.6:
        add_activity("chores", chores_minutes, 1.2, optional=True, priority=3)

    return activities


def apply_seasonal_modifiers(activities: List[Activity], seasonal: Dict[str, object]) -> None:
    if not seasonal:
        return

    multiplier = seasonal.get("outdoor_activity_multiplier")
    if multiplier and isinstance(multiplier, (int, float)):
        for activity in activities:
            if activity.name in OUTDOOR_ACTIVITIES:
                activity.base_duration_minutes = int(activity.base_duration_minutes * multiplier)
                activity.actual_duration = int(activity.base_duration_minutes * activity.waste_multiplier)

    energy_level = seasonal.get("energy_level")
    if isinstance(energy_level, (int, float)):
        if energy_level < 1.0:
            for activity in activities:
                if activity.name == "gym":
                    activity.base_duration_minutes = int(activity.base_duration_minutes * energy_level)
                    activity.actual_duration = int(activity.base_duration_minutes * activity.waste_multiplier)
        elif energy_level > 1.05:
            for activity in activities:
                if activity.name == "social":
                    activity.base_duration_minutes = int(activity.base_duration_minutes * min(1.5, energy_level))
                    activity.actual_duration = int(activity.base_duration_minutes * activity.waste_multiplier)


def apply_special_period_effects(
    activities: List[Activity],
    special: Optional[Dict[str, object]],
) -> List[Activity]:
    if not special:
        return activities

    updated: List[Activity] = list(activities)

    if special.get("work_minimal"):
        updated = [activity for activity in updated if activity.name != "work"]
    elif special.get("work_reduced"):
        for activity in updated:
            if activity.name == "work":
                activity.base_duration_minutes = int(activity.base_duration_minutes * 0.6)
                activity.actual_duration = int(activity.base_duration_minutes * activity.waste_multiplier)

    if special.get("shops_closed"):
        updated = [activity for activity in updated if activity.name != "chores"]

    if special.get("social_family_focused"):
        updated.append(Activity("family_time", 180, 1.2, optional=False, priority=2))

    if special.get("energy_low"):
        for activity in updated:
            if activity.name in {"gym", "social"}:
                activity.base_duration_minutes = int(activity.base_duration_minutes * 0.75)
                activity.actual_duration = int(activity.base_duration_minutes * activity.waste_multiplier)

    if special.get("study_hours_increased"):
        extra_minutes = int(special.get("extra_study_minutes", 240))
        updated.append(Activity("exam_study", extra_minutes, 1.2, optional=False, priority=2))

    return updated


def generate_week_activities(
    profile: PersonProfile,
    start_date: date,
    yearly_budget: Optional[YearlyBudget] = None,
) -> List[DayPlan]:
    """Generate unplaced activities for each calendar day of the week."""

    sleep_minutes = _allocate_minutes(profile.budget.sleep_hours, 7)
    work_minutes = _allocate_minutes(profile.budget.work_hours, 5)
    social_minutes = _allocate_minutes(profile.budget.social_hours, 2)
    chores_minutes = _allocate_minutes(profile.budget.chores_hours, 2)
    gym_minutes = _allocate_minutes(profile.budget.gym_hours, 3)

    week_schedule: List[DayPlan] = []

    for day_offset in range(7):
        current_date = start_date + timedelta(days=day_offset)
        day_name = current_date.strftime("%A").lower()
        weekday_index = current_date.weekday()
        daily_friction = generate_daily_friction(
            weekday_index, profile.base_waste_factor, profile.friction_variance
        )

        unique_day: Optional[UniqueDay] = None
        if yearly_budget:
            unique_day = yearly_budget.get_day_type(current_date)

        activities: List[Activity]
        day_type: str

        if unique_day:
            unique_schedule = generate_unique_day_schedule(profile, current_date, unique_day)
            if unique_schedule is not None:
                activities = unique_schedule
                day_type = unique_day.day_type
            else:
                day_type = classify_day(current_date, profile.country)
                activities = _generate_standard_day_schedule(
                    weekday_index,
                    day_type,
                    sleep_minutes,
                    work_minutes,
                    social_minutes,
                    chores_minutes,
                    gym_minutes,
                )
        else:
            day_type = classify_day(current_date, profile.country)
            if day_type == "public_holiday":
                activities = generate_holiday_schedule(profile, current_date)
            else:
                activities = _generate_standard_day_schedule(
                    weekday_index,
                    day_type,
                    sleep_minutes,
                    work_minutes,
                    social_minutes,
                    chores_minutes,
                    gym_minutes,
                )

        seasonal = get_seasonal_modifiers(current_date)
        apply_seasonal_modifiers(activities, seasonal)

        special = get_special_period_effects(current_date)
        activities = apply_special_period_effects(activities, special)

        for activity in activities:
            _apply_friction(activity, daily_friction)

        week_schedule.append(DayPlan(current_date, day_name, day_type, activities))

    return week_schedule


def compress_day_if_needed(activities: List[Activity], max_minutes: int = 1440) -> Tuple[List[Activity], Dict[str, object]]:
    """Compress activities to fit in the day, dropping optional items if required."""

    total = sum(activity.actual_duration for activity in activities)
    metadata: Dict[str, object] = {"original_total": total, "compressions": []}

    if total <= max_minutes:
        return activities, metadata

    overflow = total - max_minutes

    adjustable = [activity for activity in activities if activity.waste_multiplier > 1.0]
    adjustable.sort(key=lambda act: act.priority, reverse=True)
    for activity in adjustable:
        if overflow <= 0:
            break
        reduction = min(int(activity.actual_duration * 0.1), overflow)
        if reduction <= 0:
            continue
        activity.actual_duration -= reduction
        overflow -= reduction
        metadata["compressions"].append(f"Compressed {activity.name} by {reduction}m")

    if overflow > 0:
        optional = [activity for activity in activities if activity.optional]
        optional.sort(key=lambda act: act.priority, reverse=True)
        for activity in optional:
            if overflow <= 0:
                break
            activities.remove(activity)
            overflow -= activity.actual_duration
            metadata["compressions"].append(f"Skipped {activity.name}")

    if overflow > 0:
        metadata["final_overflow"] = overflow

    return activities, metadata


def place_activities_in_day(
    day_index: int,
    day_name: str,
    activities: List[Activity],
    templates: Dict[str, ActivityTemplate],
) -> List[Event]:
    """Assign start/end times to activities for the day."""

    events: List[Event] = []
    current_time = 0
    fallback_template = ActivityTemplate("fallback", 12, 0)

    sorted_activities = sorted(
        activities,
        key=lambda act: templates.get(act.name, fallback_template).preferred_start_hour,
    )

    for activity in sorted_activities:
        template = templates.get(activity.name)
        if template and (template.valid_days is None or day_index in template.valid_days):
            jitter = random.randint(-template.flexibility_minutes, template.flexibility_minutes)
            start = max(0, template.preferred_start_hour * 60 + jitter)
        else:
            start = current_time

        start = max(start, current_time)
        end = start + activity.actual_duration
        events.append(Event(date=date.min, day=day_name, start_minutes=start, end_minutes=end, activity=activity))
        current_time = end

    return events


def fill_free_time(events: List[Event]) -> List[Event]:
    """Insert free-time events to cover gaps."""

    if not events:
        return [
            Event(
                date=date.min,
                day="",
                start_minutes=0,
                end_minutes=1440,
                activity=Activity("free time", 1440, 1.0, optional=False, priority=5),
            )
        ]

    filled: List[Event] = []
    current = 0
    for event in sorted(events, key=lambda evt: evt.start_minutes):
        if current < event.start_minutes:
            gap_activity = Activity("free time", event.start_minutes - current, 1.0, optional=False, priority=5)
            filled.append(Event(event.date, event.day, current, event.start_minutes, gap_activity))
        filled.append(event)
        current = event.end_minutes

    if current < 1440:
        gap_activity = Activity("free time", 1440 - current, 1.0, optional=False, priority=5)
        filled.append(Event(events[-1].date, events[-1].day, current, 1440, gap_activity))

    return filled


def apply_micro_jitter(
    events: List[Event],
    max_shift: int = 5,
    locked_activities: Optional[Set[str]] = None,
) -> List[Event]:
    """Adjust adjacent event boundaries to introduce minute-level variation."""

    if max_shift <= 0 or len(events) < 2:
        return events

    locked = set(locked_activities or {"sleep", "work", "commute_in", "commute_out"})
    sorted_events = sorted(events, key=lambda evt: evt.start_minutes)

    for index in range(len(sorted_events) - 1):
        current = sorted_events[index]
        following = sorted_events[index + 1]

        if current.activity.name in locked or following.activity.name in locked:
            continue

        min_boundary = current.start_minutes + 1
        max_boundary = following.end_minutes - 1
        if max_boundary <= min_boundary:
            continue

        shift = int(round(random.gauss(0.0, max_shift / 2)))
        shift = max(-max_shift, min(max_shift, shift))
        new_boundary = current.end_minutes + shift
        new_boundary = max(min_boundary, min(max_boundary, new_boundary))

        if new_boundary == current.end_minutes:
            continue

        current.end_minutes = new_boundary
        following.start_minutes = new_boundary

    return events


def generate_summary(event_dicts: Iterable[Dict[str, object]]) -> Dict[str, float]:
    totals: Dict[str, int] = {}
    for event in event_dicts:
        activity_name = str(event["activity"])
        duration = int(event["duration_minutes"])
        totals[activity_name] = totals.get(activity_name, 0) + duration
    return {name: round(minutes / 60, 2) for name, minutes in totals.items()}


def generate_complete_week(
    profile: PersonProfile,
    start_date: date,
    week_seed: int,
    templates: Optional[Dict[str, ActivityTemplate]] = None,
    yearly_budget: Optional[YearlyBudget] = None,
) -> Dict[str, object]:
    """Generate a complete timed schedule for a week."""

    random.seed(week_seed)
    templates = templates or DEFAULT_TEMPLATES

    week_plans = generate_week_activities(profile, start_date, yearly_budget)
    issues = validate_week({f"{plan.day_name} ({plan.date.isoformat()})": plan.activities for plan in week_plans})

    compression_metadata: Dict[str, Dict[str, object]] = {}
    for plan in week_plans:
        compressed, metadata = compress_day_if_needed(plan.activities)
        plan.activities = compressed
        compression_metadata[plan.date.isoformat()] = metadata

    all_events: List[Event] = []
    for plan in week_plans:
        events = place_activities_in_day(plan.date.weekday(), plan.day_name, plan.activities, templates)
        for event in events:
            event.date = plan.date
            event.day = plan.day_name
        events = fill_free_time(events)
        events = apply_micro_jitter(events)
        all_events.extend(events)

    events_payload = [event.to_dict() for event in all_events]
    summary_hours = generate_summary(events_payload)

    return {
        "person": profile.name,
        "week_start": start_date.isoformat(),
        "events": events_payload,
        "issues": [asdict(issue) for issue in issues],
        "metadata": {
            "total_events": len(events_payload),
            "issue_count": len(issues),
            "summary_hours": summary_hours,
            "compression": compression_metadata,
            "day_types": {plan.date.isoformat(): plan.day_type for plan in week_plans},
        },
    }


def _select_profile(archetype: str) -> Tuple[PersonProfile, Dict[str, ActivityTemplate]]:
    archetype = archetype.lower()
    if archetype == "office":
        return create_office_worker(), DEFAULT_TEMPLATES
    if archetype == "parent":
        return create_exhausted_parent(), DEFAULT_TEMPLATES
    if archetype == "freelancer":
        return create_night_owl_freelancer(), NIGHT_OWL_TEMPLATES
    raise ValueError(f"Unknown archetype: {archetype}")


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

    yearly_budget = None
    if args.yearly_budget:
        budget_data = json.loads(args.yearly_budget.read_text())
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
