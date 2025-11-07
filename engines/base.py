"""Core scheduling interfaces and data structures."""

from __future__ import annotations

from dataclasses import dataclass, field
from typing import Any, List, Mapping, Optional, Sequence
from abc import ABC, abstractmethod


@dataclass(frozen=True)
class ScheduleInput:
    """Container for engine inputs.

    Parameters
    ----------
    constraints:
        Arbitrary constraint values that describe the schedule to generate.
    seed:
        Optional deterministic seed to make engines reproducible.
    metadata:
        Optional metadata for downstream rigs (e.g., profile identifiers).
    """

    constraints: Mapping[str, Any]
    seed: Optional[int] = None
    metadata: Mapping[str, Any] = field(default_factory=dict)


@dataclass
class ScheduleOutput:
    """Result of an engine execution.

    Parameters
    ----------
    events:
        Chronologically ordered schedule entries.
    totals:
        Summary statistics keyed by activity name.
    diagnostics:
        Optional engine-specific notes (e.g., warnings, execution metrics).
    """

    events: Sequence[Mapping[str, Any]]
    totals: Mapping[str, Any]
    diagnostics: Mapping[str, Any] = field(default_factory=dict)


class ScheduleEngine(ABC):
    """Abstract base class for schedule generation engines."""

    @abstractmethod
    def generate(self, schedule_input: ScheduleInput) -> ScheduleOutput:
        """Generate a complete schedule based on the supplied input."""

    @abstractmethod
    def validate_constraints(self, constraints: Mapping[str, Any]) -> List[str]:
        """Validate *constraints* and return a list of issues."""
