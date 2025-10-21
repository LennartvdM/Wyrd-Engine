"""Data models for the synthetic workforce calendar engine."""

from __future__ import annotations

from dataclasses import dataclass, field
from datetime import date
from typing import Dict, List, Optional

DAY_NAMES: List[str] = [
    "monday",
    "tuesday",
    "wednesday",
    "thursday",
    "friday",
    "saturday",
    "sunday",
]


@dataclass
class Activity:
    """Represents an activity template before it is placed on the calendar."""

    name: str
    base_duration_minutes: int
    waste_multiplier: float = 1.0
    optional: bool = True
    priority: int = 5
    actual_duration: int = field(init=False)

    def __post_init__(self) -> None:
        self.actual_duration = int(self.base_duration_minutes * self.waste_multiplier)


@dataclass
class WeeklyBudget:
    """Weekly time allocations that guide the generator."""

    sleep_hours: float = 49.0
    work_hours: float = 40.0
    meals_hours: float = 10.5
    gym_hours: float = 3.0
    social_hours: float = 5.0
    chores_hours: float = 3.0


@dataclass
class PersonProfile:
    """High-level persona inputs for the generator."""

    name: str
    budget: WeeklyBudget
    base_waste_factor: float = 1.25
    friction_variance: float = 0.15
    country: str = "NL"


@dataclass
class ActivityTemplate:
    """Preferred placement metadata for an activity."""

    name: str
    preferred_start_hour: int
    flexibility_minutes: int = 30
    valid_days: Optional[List[int]] = None


@dataclass
class Event:
    """A scheduled event on a specific day."""

    date: date
    day: str
    start_minutes: int
    end_minutes: int
    activity: Activity

    def to_dict(self) -> Dict[str, object]:
        start_hour, start_minute = divmod(self.start_minutes, 60)
        end_hour, end_minute = divmod(self.end_minutes, 60)
        return {
            "date": self.date.isoformat(),
            "day": self.day,
            "start": f"{start_hour:02d}:{start_minute:02d}",
            "end": f"{end_hour:02d}:{end_minute:02d}",
            "activity": self.activity.name,
            "duration_minutes": self.end_minutes - self.start_minutes,
        }


@dataclass
class ScheduleIssue:
    """Diagnostic information produced during validation."""

    day: str
    issue_type: str
    severity: str
    details: str
