"""Calendar provider module encapsulating calendar-related logic."""

from __future__ import annotations

import logging
from datetime import date, timedelta
from functools import lru_cache
from typing import Dict, List, Optional

try:  # pragma: no cover - optional dependency
    from holidays import country_holidays as _country_holidays
except ModuleNotFoundError:  # pragma: no cover - exercised in tests
    _country_holidays = None

from models import Activity, PersonProfile

logger = logging.getLogger(__name__)

FALLBACK_HOLIDAY_DATA: Dict[str, Dict[int, Dict[date, str]]] = {
    "NL": {
        2024: {
            date(2024, 1, 1): "New Year's Day",
            date(2024, 3, 29): "Good Friday",
            date(2024, 3, 31): "Easter Sunday",
            date(2024, 4, 1): "Easter Monday",
            date(2024, 4, 27): "King's Day",
            date(2024, 5, 9): "Ascension Day",
            date(2024, 5, 19): "Whit Sunday",
            date(2024, 5, 20): "Whit Monday",
            date(2024, 12, 25): "Christmas Day",
            date(2024, 12, 26): "Second Christmas Day",
        },
        2025: {
            date(2025, 1, 1): "New Year's Day",
            date(2025, 4, 18): "Good Friday",
            date(2025, 4, 20): "Easter Sunday",
            date(2025, 4, 21): "Easter Monday",
            date(2025, 4, 27): "King's Day",
            date(2025, 5, 5): "Liberation Day",
            date(2025, 5, 29): "Ascension Day",
            date(2025, 6, 8): "Whit Sunday",
            date(2025, 6, 9): "Whit Monday",
            date(2025, 12, 25): "Christmas Day",
            date(2025, 12, 26): "Second Christmas Day",
        },
        2026: {
            date(2026, 1, 1): "New Year's Day",
            date(2026, 4, 3): "Good Friday",
            date(2026, 4, 5): "Easter Sunday",
            date(2026, 4, 6): "Easter Monday",
            date(2026, 4, 27): "King's Day",
            date(2026, 5, 5): "Liberation Day",
            date(2026, 5, 14): "Ascension Day",
            date(2026, 5, 24): "Whit Sunday",
            date(2026, 5, 25): "Whit Monday",
            date(2026, 12, 25): "Christmas Day",
            date(2026, 12, 26): "Second Christmas Day",
        },
    }
}


def _fallback_holidays(country: str, year: int) -> Dict[date, str]:
    data: Dict[date, str] = {}
    yearly_data = FALLBACK_HOLIDAY_DATA.get(country.upper(), {})
    for year_key in {year - 1, year, year + 1}:
        data.update(yearly_data.get(year_key, {}))
    return data


@lru_cache(maxsize=64)
def _holiday_cache(country: str, year: int) -> Dict[date, str]:
    """Return a cached mapping of holidays for a country and nearby years."""

    years = sorted({year - 1, year, year + 1})
    if _country_holidays is None:
        return _fallback_holidays(country, year)

    data = dict(_country_holidays(country, years=years))
    fallback = _fallback_holidays(country, year)
    for day, name in fallback.items():
        data.setdefault(day, name)
    return data


def _normalize_holiday_name(name: object) -> str:
    if isinstance(name, (list, tuple, set)):
        return str(next(iter(name)))
    return str(name)


class CalendarProvider:
    """Encapsulates calendar-based classification and modifiers."""

    def classify_day(self, day: date, country: str = "NL") -> str:
        """Classify a day into weekday/weekend/holiday/bridge buckets."""

        holidays_map = _holiday_cache(country, day.year)
        if day in holidays_map:
            return "public_holiday"

        if day.weekday() >= 5:
            return "weekend"

        if self.is_bridge_day(day, country, holidays_map):
            return "bridge_day"

        return "weekday"

    def is_bridge_day(
        self,
        day: date,
        country: str,
        holidays_map: Optional[Dict[date, str]] = None,
    ) -> bool:
        """Return True if the day is typically taken off to bridge a holiday."""

        holidays_map = holidays_map or _holiday_cache(country, day.year)
        weekday = day.weekday()

        if weekday == 4 and (day + timedelta(days=1)) in holidays_map:
            return True

        if weekday == 0 and (day - timedelta(days=1)) in holidays_map:
            return True

        return False

    def get_seasonal_modifiers(self, day: date) -> Dict[str, object]:
        """Return modifiers that describe seasonal behaviour patterns."""

        month = day.month

        if month in (12, 1, 2):
            return {
                "season": "winter",
                "daylight_hours": 8,
                "outdoor_activity_multiplier": 0.6,
                "energy_level": 0.9,
                "gym_preference": "indoor",
                "social_location": "indoor",
            }

        if month in (3, 4, 5):
            return {
                "season": "spring",
                "daylight_hours": 14,
                "outdoor_activity_multiplier": 1.2,
                "energy_level": 1.1,
                "gym_preference": "outdoor_run",
                "social_location": "terrace",
            }

        if month in (6, 7, 8):
            return {
                "season": "summer",
                "daylight_hours": 16,
                "outdoor_activity_multiplier": 1.5,
                "energy_level": 1.0,
                "gym_preference": "outdoor_run",
                "social_location": "park",
                "vacation_probability": 0.3,
            }

        return {
            "season": "autumn",
            "daylight_hours": 10,
            "outdoor_activity_multiplier": 0.8,
            "energy_level": 0.95,
            "gym_preference": "indoor",
            "social_location": "cafe",
        }

    def get_special_period_effects(self, day: date) -> Optional[Dict[str, object]]:
        """Return modifiers for notable calendar periods (e.g. Christmas week)."""

        if day.month in (7, 8):
            return {
                "type": "summer_vacation_season",
                "work_reduced": True,
                "traffic_lighter": True,
                "city_quieter": True,
            }

        if day.month == 12 and day.day >= 24:
            return {
                "type": "christmas_period",
                "work_minimal": True,
                "social_family_focused": True,
                "shops_closed": True,
            }

        if day.month == 1 and day.day <= 2:
            return {
                "type": "new_year_recovery",
                "work_minimal": True,
                "energy_low": True,
            }

        if day.month in (5, 6):
            return {
                "type": "exam_season",
                "applies_to": "students",
                "stress_high": True,
                "study_hours_increased": True,
            }

        return None

    def generate_holiday_schedule(self, profile: PersonProfile, day: date) -> List[Activity]:
        """Return a list of holiday-themed activities for the supplied day."""

        holidays_map = _holiday_cache(profile.country, day.year)
        holiday_name = _normalize_holiday_name(holidays_map.get(day, "Holiday"))

        activities = [Activity("sleep", 420, 1.0, optional=False, priority=1)]

        if "Christmas" in holiday_name:
            activities.extend(
                [
                    Activity("special_breakfast", 60, 1.2, optional=False, priority=2),
                    Activity("holiday_dinner", 150, 1.3, optional=False, priority=2),
                    Activity("family_visit", 240, 1.2, optional=False, priority=2),
                    Activity("gift_exchange", 90, 1.1, optional=True, priority=3),
                ]
            )
        elif "Easter" in holiday_name:
            activities.extend(
                [
                    Activity("special_breakfast", 45, 1.2, optional=False, priority=2),
                    Activity("family_brunch", 120, 1.2, optional=False, priority=2),
                    Activity("outdoor_walk", 90, 1.1, optional=True, priority=3),
                ]
            )
        elif "King" in holiday_name:
            activities.extend(
                [
                    Activity("kings_day_celebration", 180, 1.4, optional=True, priority=3),
                    Activity("outdoor_market", 120, 1.5, optional=True, priority=4),
                ]
            )
        elif "Liberation" in holiday_name:
            activities.extend(
                [
                    Activity("festival", 180, 1.4, optional=True, priority=4),
                    Activity("memorial_visit", 90, 1.2, optional=True, priority=3),
                ]
            )
        elif "New Year" in holiday_name:
            activities.extend(
                [
                    Activity("late_breakfast", 60, 1.2, optional=False, priority=2),
                    Activity("recovering_from_nye", 180, 1.0, optional=True, priority=3),
                    Activity("family_visit", 180, 1.1, optional=True, priority=3),
                ]
            )
        else:
            activities.extend(
                [
                    Activity("breakfast", 30, 1.2, optional=False, priority=2),
                    Activity("lunch", 30, 1.2, optional=False, priority=2),
                    Activity("dinner", 45, 1.2, optional=False, priority=2),
                ]
            )

        activities.append(Activity("free_time", 240, 1.0, optional=True, priority=5))

        logger.debug("Generated holiday schedule for %s: %s", day, holiday_name)
        return activities


default_calendar_provider = CalendarProvider()

__all__ = [
    "CalendarProvider",
    "default_calendar_provider",
    "FALLBACK_HOLIDAY_DATA",
]

