"""Generators for unique day overrides in the synthetic calendar."""

from __future__ import annotations

import logging
from dataclasses import dataclass, field
from datetime import date
from typing import Dict, List, Optional

from models import Activity, PersonProfile

logger = logging.getLogger(__name__)


@dataclass
class UniqueDay:
    """A special day that overrides normal schedule generation."""

    date: date
    day_type: str
    rules: Dict[str, object] = field(default_factory=dict)
    priority: int = 5


def generate_unique_day_schedule(
    profile: PersonProfile,
    day: date,
    unique_day: UniqueDay,
) -> Optional[List[Activity]]:
    """Dispatch to the correct generator for the supplied unique day."""

    day_type = unique_day.day_type.lower()

    if day_type == "vacation":
        return generate_vacation_day(profile, unique_day.rules)
    if day_type == "sick":
        return generate_sick_day(profile, unique_day.rules)
    if day_type == "wedding":
        return generate_wedding_day(profile, unique_day.rules)
    if day_type == "birthday":
        return generate_birthday_day(profile, unique_day.rules)
    if day_type == "tax_deadline":
        return generate_tax_day(profile, unique_day.rules)
    if day_type == "custom":
        return generate_custom_day(profile, unique_day.rules)

    logger.warning("Unknown unique day type: %s on %s", unique_day.day_type, day)
    return None


def _append_meals(activities: List[Activity], relaxed: bool = False) -> None:
    if relaxed:
        activities.append(Activity("breakfast", 45, 1.1, optional=False, priority=2))
        activities.append(Activity("lunch", 60, 1.1, optional=False, priority=2))
        activities.append(Activity("dinner", 75, 1.1, optional=False, priority=2))
    else:
        activities.append(Activity("breakfast", 30, 1.2, optional=False, priority=2))
        activities.append(Activity("lunch", 30, 1.2, optional=False, priority=2))
        activities.append(Activity("dinner", 30, 1.2, optional=False, priority=2))


def generate_vacation_day(profile: PersonProfile, rules: Dict[str, object]) -> List[Activity]:
    """Vacation days prioritise rest and leisure."""

    activities: List[Activity] = [Activity("sleep", int(rules.get("sleep_duration", 540)), 1.0, optional=False, priority=1)]
    _append_meals(activities, relaxed=True)

    vacation_activity = str(rules.get("activity", "relaxing"))
    duration = int(rules.get("activity_duration", 180))
    activities.append(Activity(vacation_activity, duration, 1.2, optional=True, priority=4))
    activities.append(Activity("evening_leisure", 150, 1.1, optional=True, priority=4))
    return activities


def generate_sick_day(profile: PersonProfile, rules: Dict[str, object]) -> List[Activity]:
    """Sick days focus on recuperation with severity-aware pacing."""

    severity = str(rules.get("severity", "mild")).lower()
    activities: List[Activity] = []

    if severity == "severe":
        activities.append(Activity("sleep", 600, 1.0, optional=False, priority=1))
        activities.append(Activity("rest_in_bed", 480, 1.0, optional=False, priority=1))
        activities.append(Activity("light_meal", 20, 1.4, optional=False, priority=2))
        activities.append(Activity("light_meal", 20, 1.4, optional=False, priority=2))
    elif severity == "moderate":
        activities.append(Activity("sleep", 540, 1.0, optional=False, priority=1))
        activities.append(Activity("rest", 300, 1.0, optional=False, priority=2))
        activities.append(Activity("light_meal", 30, 1.3, optional=False, priority=2))
        activities.append(Activity("light_meal", 30, 1.3, optional=False, priority=2))
        activities.append(Activity("watch_tv", 180, 1.1, optional=True, priority=4))
    else:
        activities.append(Activity("sleep", 480, 1.0, optional=False, priority=1))
        _append_meals(activities)
        activities.append(Activity("rest", 180, 1.0, optional=True, priority=3))
        activities.append(Activity("light_activity", 120, 1.1, optional=True, priority=4))
        activities.append(Activity("evening_rest", 120, 1.0, optional=True, priority=4))

    return activities


def generate_wedding_day(profile: PersonProfile, rules: Dict[str, object]) -> List[Activity]:
    """Generate a structured wedding-day schedule."""

    role = str(rules.get("role", "guest")).lower()
    activities: List[Activity] = [Activity("sleep", 420, 1.0, optional=False, priority=1)]
    activities.append(Activity("breakfast", 30, 1.2, optional=False, priority=2))

    if role in {"bride", "groom"}:
        activities.append(Activity("wedding_preparation", 210, 1.4, optional=False, priority=1))
    elif role == "wedding_party":
        activities.append(Activity("wedding_preparation", 150, 1.3, optional=False, priority=2))
    else:
        activities.append(Activity("getting_ready", 90, 1.3, optional=False, priority=3))

    activities.append(Activity("ceremony", 75, 1.2, optional=False, priority=1))
    activities.append(Activity("photos", 90, 1.3, optional=True, priority=3))
    activities.append(Activity("reception", 240, 1.3, optional=False, priority=2))
    activities.append(Activity("travel_home", 45, 1.1, optional=False, priority=3))
    return activities


def generate_birthday_day(profile: PersonProfile, rules: Dict[str, object]) -> List[Activity]:
    """Generate a celebratory birthday schedule."""

    activities: List[Activity] = [Activity("sleep", 480, 1.0, optional=False, priority=1)]
    _append_meals(activities, relaxed=True)

    if rules.get("party"):
        duration = int(rules.get("party_duration", 240))
        activities.append(Activity("birthday_party", duration, 1.3, optional=True, priority=3))

    guest_count = int(rules.get("guests", 0))
    if guest_count:
        activities.append(Activity("hosting", max(120, guest_count * 10), 1.2, optional=True, priority=3))

    activities.append(Activity("celebration_dinner", 120, 1.2, optional=False, priority=2))
    return activities


def generate_tax_day(profile: PersonProfile, rules: Dict[str, object]) -> List[Activity]:
    """Generate a day dominated by administrative duties."""

    stress_multiplier = float(rules.get("stress_multiplier", 1.4))
    admin_minutes = int(rules.get("extra_admin_time", 180))

    activities: List[Activity] = [Activity("sleep", 450, 1.0, optional=False, priority=1)]
    _append_meals(activities)
    activities.append(Activity("tax_filing", admin_minutes, stress_multiplier, optional=False, priority=1))
    activities.append(Activity("recovery_time", 120, 1.1, optional=True, priority=4))
    return activities


def generate_custom_day(profile: PersonProfile, rules: Dict[str, object]) -> List[Activity]:
    """Allow arbitrary activity definitions for one-off scenarios."""

    activities: List[Activity] = []

    for activity_spec in rules.get("activities", []):
        activities.append(
            Activity(
                name=str(activity_spec["name"]),
                base_duration_minutes=int(activity_spec["duration"]),
                waste_multiplier=float(activity_spec.get("waste", 1.0)),
                optional=bool(activity_spec.get("optional", True)),
                priority=int(activity_spec.get("priority", 3)),
            )
        )

    if not activities and not rules.get("no_sleep", False):
        activities.append(Activity("sleep", 420, 1.0, optional=False, priority=1))

    return activities
