"""Simple rig that wraps deterministic scheduling engine setup."""

from __future__ import annotations

from typing import Optional

from engines.base import ScheduleInput, ScheduleOutput
from engines.engine_mk1 import EngineMK1

__all__ = ["SimpleRig"]


class SimpleRig:
    """Glue layer for the deterministic MK1 engine."""

    def __init__(self, engine: Optional[EngineMK1] = None) -> None:
        self._engine = engine or EngineMK1()

    @property
    def engine(self) -> EngineMK1:
        """Return the wrapped engine instance."""

        return self._engine

    def generate(self, schedule_input: ScheduleInput) -> ScheduleOutput:
        """Delegate generation to the underlying engine."""

        return self._engine.generate(schedule_input)
