"""Predefined personas and activity templates."""

from __future__ import annotations

from typing import Dict

from models import ActivityTemplate, PersonProfile, WeeklyBudget

DEFAULT_TEMPLATES: Dict[str, ActivityTemplate] = {
    "sleep": ActivityTemplate("sleep", 23, 15),
    "breakfast": ActivityTemplate("breakfast", 7, 30),
    "lunch": ActivityTemplate("lunch", 12, 30),
    "dinner": ActivityTemplate("dinner", 18, 30),
    "work": ActivityTemplate("work", 9, 15, [0, 1, 2, 3, 4]),
    "gym": ActivityTemplate("gym", 17, 60, [0, 2, 4]),
    "social": ActivityTemplate("social", 19, 90, [5, 6]),
    "chores": ActivityTemplate("chores", 16, 45),
}


def create_office_worker() -> PersonProfile:
    return PersonProfile(
        name="Office Worker",
        budget=WeeklyBudget(sleep_hours=49, work_hours=40, gym_hours=3),
        base_waste_factor=1.25,
        friction_variance=0.15,
    )


def create_exhausted_parent() -> PersonProfile:
    return PersonProfile(
        name="Exhausted Parent",
        budget=WeeklyBudget(sleep_hours=42, work_hours=30, gym_hours=1, social_hours=3, chores_hours=6),
        base_waste_factor=1.4,
        friction_variance=0.25,
    )


def create_night_owl_freelancer() -> PersonProfile:
    return PersonProfile(
        name="Night Owl Freelancer",
        budget=WeeklyBudget(sleep_hours=49, work_hours=35, social_hours=8, chores_hours=2),
        base_waste_factor=1.3,
        friction_variance=0.2,
    )


NIGHT_OWL_TEMPLATES: Dict[str, ActivityTemplate] = {**DEFAULT_TEMPLATES}
NIGHT_OWL_TEMPLATES["sleep"] = ActivityTemplate("sleep", 3, 30)
NIGHT_OWL_TEMPLATES["work"] = ActivityTemplate("work", 14, 60)
