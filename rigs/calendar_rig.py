"""Base rig for calendar-aware engines."""

from __future__ import annotations

from typing import Optional

from modules.calendar_provider import CalendarProvider, default_calendar_provider

__all__ = ["CalendarRig"]


class CalendarRig:
    """Manage calendar provider dependencies for engines."""

    def __init__(self, calendar_provider: Optional[CalendarProvider] = None) -> None:
        self._calendar_provider = calendar_provider or default_calendar_provider

    @property
    def calendar_provider(self) -> CalendarProvider:
        """Return the active calendar provider."""

        return self._calendar_provider

    def set_calendar_provider(self, provider: CalendarProvider) -> None:
        """Update the provider and notify subclasses."""

        self._calendar_provider = provider
        self._on_calendar_provider_updated(provider)

    def _on_calendar_provider_updated(self, provider: CalendarProvider) -> None:  # pragma: no cover - hook
        """Hook for subclasses to react to provider changes."""

        del provider  # avoid unused variable in default implementation
