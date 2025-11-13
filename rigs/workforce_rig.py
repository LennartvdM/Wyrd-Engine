"""Rig that wires the workforce engine with its supporting modules."""

from __future__ import annotations

from datetime import date
from typing import Callable, Dict, List, Optional, Tuple

from engines.engine_mk2 import EngineMK2
from models import Activity, ActivityTemplate, PersonProfile, ScheduleIssue
from modules.calendar_provider import CalendarProvider
from modules.friction_model import generate_daily_friction
from modules.unique_events import UniqueDay, generate_unique_day_schedule
from modules.validation import validate_week
from yearly_budget import YearlyBudget

from .calendar_rig import CalendarRig

__all__ = ["WorkforceRig"]


class WorkforceRig(CalendarRig):
    """Composition layer for MK2 that injects calendar and validation modules."""

    def __init__(
        self,
        engine: Optional[EngineMK2] = None,
        *,
        calendar_provider: Optional[CalendarProvider] = None,
        friction_generator: Optional[Callable[[int, float, float], float]] = None,
        unique_schedule_generator: Optional[
            Callable[[PersonProfile, date, UniqueDay], Optional[List[Activity]]]
        ] = None,
        validator: Optional[
            Callable[[Dict[str, List[Activity]]], List[ScheduleIssue]]
        ] = None,
    ) -> None:
        super().__init__(calendar_provider=calendar_provider)

        self._friction_generator = friction_generator or generate_daily_friction
        self._unique_schedule_generator = (
            unique_schedule_generator or generate_unique_day_schedule
        )
        self._validator = validator or validate_week

        if engine is None:
            self._engine = EngineMK2(
                calendar_provider=self.calendar_provider,
                friction_generator=self._friction_generator,
                unique_schedule_generator=self._unique_schedule_generator,
                validator=self._validator,
            )
        else:
            self._engine = engine
            self._engine.set_calendar_provider(self.calendar_provider)
            self._engine.set_friction_generator(self._friction_generator)
            self._engine.set_unique_schedule_generator(self._unique_schedule_generator)
            self._engine.set_validator(self._validator)

    @property
    def engine(self) -> EngineMK2:
        """Expose the configured engine for advanced integrations."""

        return self._engine

    def _on_calendar_provider_updated(self, provider: CalendarProvider) -> None:  # pragma: no cover - trivial
        self._engine.set_calendar_provider(provider)

    def set_friction_generator(
        self, generator: Optional[Callable[[int, float, float], float]]
    ) -> None:
        self._friction_generator = generator or generate_daily_friction
        self._engine.set_friction_generator(self._friction_generator)

    def set_unique_schedule_generator(
        self,
        generator: Optional[
            Callable[[PersonProfile, date, UniqueDay], Optional[List[Activity]]]
        ],
    ) -> None:
        self._unique_schedule_generator = (
            generator or generate_unique_day_schedule
        )
        self._engine.set_unique_schedule_generator(self._unique_schedule_generator)

    def set_validator(
        self,
        validator: Optional[Callable[[Dict[str, List[Activity]]], List[ScheduleIssue]]],
    ) -> None:
        self._validator = validator or validate_week
        self._engine.set_validator(self._validator)

    def select_profile(self, archetype: str) -> Tuple[PersonProfile, Dict[str, ActivityTemplate]]:
        """Proxy to the underlying engine for archetype lookup."""

        return self._engine.select_profile(archetype)

    def generate_complete_week(
        self,
        profile: PersonProfile,
        start_date: date,
        week_seed: int,
        templates: Optional[Dict[str, ActivityTemplate]] = None,
        yearly_budget: Optional[YearlyBudget] = None,
        debug: bool = False,
    ) -> Dict[str, object]:
        """Delegate generation to the configured engine."""

        return self._engine.generate_complete_week(
            profile, start_date, week_seed, templates, yearly_budget, debug=debug
        )
