"""Synthetic workforce calendar engine."""

from __future__ import annotations

import argparse
import json
import random
from dataclasses import asdict
from datetime import date, timedelta
from pathlib import Path
from typing import Dict, Iterable, List, Optional, Tuple

from archetypes import (
    DEFAULT_TEMPLATES,
    NIGHT_OWL_TEMPLATES,
    create_exhausted_parent,
    create_night_owl_freelancer,
    create_office_worker,
)
from friction import generate_daily_friction
from models import Activity, ActivityTemplate, Event, PersonProfile, ScheduleIssue, DAY_NAMES
from validation import validate_week


def _apply_friction(activity: Activity, friction: float) -> None:
    activity.actual_duration = max(1, int(activity.base_duration_minutes * activity.waste_multiplier * friction))


def _allocate_minutes(hours: float, days: int) -> int:
    return int(hours * 60 / days) if hours > 0 else 0


def generate_week_activities(profile: PersonProfile) -> Dict[str, List[Activity]]:
    """Generate unplaced activities for the entire week."""

    week_schedule: Dict[str, List[Activity]] = {}

    sleep_minutes = _allocate_minutes(profile.budget.sleep_hours, 7)
    work_minutes = _allocate_minutes(profile.budget.work_hours, 5)
    social_minutes = _allocate_minutes(profile.budget.social_hours, 2)
    chores_minutes = _allocate_minutes(profile.budget.chores_hours, 2)
    gym_minutes = _allocate_minutes(profile.budget.gym_hours, 3)

    for day_index, day_name in enumerate(DAY_NAMES):
        daily_friction = generate_daily_friction(day_index, profile.base_waste_factor, profile.friction_variance)
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
            activity = Activity(name, base_minutes, waste_multiplier, optional, priority)
            _apply_friction(activity, daily_friction)
            activities.append(activity)

        add_activity("sleep", sleep_minutes, 1.0, optional=False, priority=1)
        for meal_name in ("breakfast", "lunch", "dinner"):
            add_activity(meal_name, 30, 1.2, optional=False, priority=2)

        if day_index < 5:
            add_activity("work", work_minutes, 1.1, optional=False, priority=2)

        if gym_minutes > 0 and day_index in (0, 2, 4) and random.random() < 0.85:
            add_activity("gym", gym_minutes, 1.4, optional=True, priority=4)

        if social_minutes > 0 and day_index >= 5 and random.random() < 0.7:
            add_activity("social", social_minutes, 1.3, optional=True, priority=4)

        if chores_minutes > 0 and day_index in (5, 6) and random.random() < 0.6:
            add_activity("chores", chores_minutes, 1.2, optional=True, priority=3)

        week_schedule[day_name] = activities

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
) -> Dict[str, object]:
    """Generate a complete timed schedule for a week."""

    random.seed(week_seed)
    templates = templates or DEFAULT_TEMPLATES

    week_activities = generate_week_activities(profile)
    issues = validate_week(week_activities)

    compression_metadata: Dict[str, Dict[str, object]] = {}
    for day_name, activities in week_activities.items():
        compressed, metadata = compress_day_if_needed(activities)
        week_activities[day_name] = compressed
        compression_metadata[day_name] = metadata

    all_events: List[Event] = []
    for day_index, day_name in enumerate(DAY_NAMES):
        day_date = start_date + timedelta(days=day_index)
        activities = week_activities[day_name]
        events = place_activities_in_day(day_index, day_name, activities, templates)
        for event in events:
            event.date = day_date
        events = fill_free_time(events)
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
    args = parser.parse_args()

    start = date.fromisoformat(args.start_date) if args.start_date else date.today()
    profile, templates = _select_profile(args.archetype)

    result = generate_complete_week(profile, start, args.seed, templates)
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
