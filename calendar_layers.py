"""Calendar classification and seasonal context utilities."""

from __future__ import annotations

from datetime import date
from typing import Dict, List, Optional

import modules.calendar_provider as _calendar_provider
from modules.calendar_provider import CalendarProvider, FALLBACK_HOLIDAY_DATA
from models import Activity, PersonProfile

__all__ = [
    "CalendarProvider",
    "FALLBACK_HOLIDAY_DATA",
    "default_calendar_provider",
    "classify_day",
    "generate_holiday_schedule",
    "get_seasonal_modifiers",
    "get_special_period_effects",
    "get_calendar_provider",
    "is_bridge_day",
    "set_calendar_provider",
]


default_calendar_provider = _calendar_provider.default_calendar_provider


def classify_day(day: date, country: str = "NL") -> str:
    """Classify a day into weekday/weekend/holiday/bridge buckets."""

    return _calendar_provider.default_calendar_provider.classify_day(day, country)


def is_bridge_day(
    day: date,
    country: str,
    holidays_map: Optional[Dict[date, str]] = None,
) -> bool:
    """Return True if the day is typically taken off to bridge a holiday."""

    return _calendar_provider.default_calendar_provider.is_bridge_day(
        day, country, holidays_map
    )


def get_seasonal_modifiers(day: date) -> Dict[str, object]:
    """Return modifiers that describe seasonal behaviour patterns."""

    return _calendar_provider.default_calendar_provider.get_seasonal_modifiers(day)


def get_special_period_effects(day: date) -> Optional[Dict[str, object]]:
    """Return modifiers for notable calendar periods (e.g. Christmas week)."""

    return _calendar_provider.default_calendar_provider.get_special_period_effects(day)


def generate_holiday_schedule(profile: PersonProfile, day: date) -> List[Activity]:
    """Return a list of holiday-themed activities for the supplied day."""

    return _calendar_provider.default_calendar_provider.generate_holiday_schedule(
        profile, day
    )


def set_calendar_provider(provider: CalendarProvider) -> None:
    """Replace the default calendar provider implementation."""

    global default_calendar_provider
    _calendar_provider.default_calendar_provider = provider
    default_calendar_provider = provider


def get_calendar_provider() -> CalendarProvider:
    """Return the active calendar provider instance."""

    return _calendar_provider.default_calendar_provider

