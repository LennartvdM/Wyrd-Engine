"""Core scheduling interfaces and strongly typed data structures."""

from __future__ import annotations

from abc import ABC, abstractmethod
from dataclasses import dataclass, field
from typing import Any, Mapping, MutableMapping, Optional, Sequence

__all__ = [
    "ScheduleEngine",
    "ScheduleInput",
    "ScheduleOutput",
    "SchedulePayload",
    "ScheduleTotals",
]

# -- Type aliases -----------------------------------------------------------------

SchedulePayload = Mapping[str, Any]
"""Type alias representing a read-only mapping for schedule metadata."""

ScheduleTotals = Mapping[str, Any]
"""Aggregated totals or summary metrics produced by a schedule engine."""


@dataclass(frozen=True, slots=True)
class ScheduleInput:
    """Container for data required to generate a schedule."""

    constraints: SchedulePayload
    seed: Optional[int] = None
    metadata: SchedulePayload = field(default_factory=dict)

    def with_metadata(self, **metadata: Any) -> "ScheduleInput":
        """Return a new input with merged metadata without mutating the original."""

        merged: MutableMapping[str, Any] = dict(self.metadata)
        merged.update(metadata)
        return ScheduleInput(
            constraints=self.constraints,
            seed=self.seed,
            metadata=merged,
        )


@dataclass(frozen=True, slots=True)
class ScheduleOutput:
    """Structured response produced by a schedule engine."""

    events: Sequence[SchedulePayload]
    totals: ScheduleTotals
    diagnostics: SchedulePayload = field(default_factory=dict)


class ScheduleEngine(ABC):
    """Abstract interface for schedule generation engines."""

    @abstractmethod
    def generate(self, schedule_input: ScheduleInput) -> ScheduleOutput:
        """Produce a schedule based on the provided input."""

        raise NotImplementedError

