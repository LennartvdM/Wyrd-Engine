"""Yearly budget and unique day management helpers."""

from __future__ import annotations

from dataclasses import dataclass, field
from datetime import date
from typing import List, Optional

from unique_days import UniqueDay


@dataclass
class YearlyBudget:
    """Track annual allocations and bespoke unique days for a person."""

    person_id: str
    year: int
    vacation_days: int = 20
    sick_days_taken: int = 0
    unique_days: List[UniqueDay] = field(default_factory=list)

    def add_unique_day(self, unique_day: UniqueDay) -> None:
        """Register a new unique day for the calendar."""

        self.unique_days.append(unique_day)
        self.unique_days.sort(key=lambda day: (day.date, -day.priority))

    def get_day_type(self, day: date) -> Optional[UniqueDay]:
        """Return the highest-priority unique day configuration for `day`."""

        candidates = [unique for unique in self.unique_days if unique.date == day]
        if not candidates:
            return None
        return max(candidates, key=lambda unique: unique.priority)
