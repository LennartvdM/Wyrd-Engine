"""Core scheduling interfaces and data structures."""

from __future__ import annotations

from dataclasses import dataclass, field
from typing import Any, Mapping, Optional, Sequence
from abc import ABC, abstractmethod

__all__ = [
    "ScheduleInput",
    "ScheduleOutput",
    "ScheduleEngine",
]


@dataclass(frozen=True)
class ScheduleInput:
    """Container for data required to generate a schedule."""

    constraints: Mapping[str, Any]
    seed: Optional[int] = None
    metadata: Mapping[str, Any] = field(default_factory=dict)


@dataclass(frozen=True)
class ScheduleOutput:
    """Structured response produced by a schedule engine."""

    events: Sequence[Mapping[str, Any]]
    totals: Mapping[str, Any]
    diagnostics: Mapping[str, Any] = field(default_factory=dict)


class ScheduleEngine(ABC):
    """Abstract interface for schedule generation engines."""

    @abstractmethod
    def generate(self, schedule_input: ScheduleInput) -> ScheduleOutput:
        """Produce a schedule based on the provided input."""

