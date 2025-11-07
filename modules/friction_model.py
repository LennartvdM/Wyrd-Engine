"""Friction and efficiency helpers for schedule generation."""

from __future__ import annotations

import random
from typing import Final

WEEKDAY_FATIGUE_STEP: Final[float] = 0.03
WEEKEND_RECOVERY: Final[float] = -0.05
_MIN_FRICTION: Final[float] = 0.9
_MAX_FRICTION: Final[float] = 1.8

__all__ = [
    "WEEKDAY_FATIGUE_STEP",
    "WEEKEND_RECOVERY",
    "generate_daily_friction",
    "get_time_of_day_multiplier",
]


def generate_daily_friction(day_of_week: int, base_factor: float, variance: float) -> float:
    """Return a friction multiplier for the supplied day."""

    week_fatigue = 1.0
    if day_of_week < 5:
        week_fatigue += day_of_week * WEEKDAY_FATIGUE_STEP
    else:
        week_fatigue += WEEKEND_RECOVERY

    daily_noise = random.gauss(0, variance)
    friction = base_factor * week_fatigue * (1 + daily_noise)
    return max(_MIN_FRICTION, min(friction, _MAX_FRICTION))


def get_time_of_day_multiplier(hour: int) -> float:
    """Return a simple efficiency modifier for a 24h hour index."""

    if hour < 0 or hour > 23:
        raise ValueError("hour must be in [0, 23]")

    if hour < 12:
        return 0.9
    if hour < 17:
        return 1.0
    return 1.15
