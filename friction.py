"""Backward compatibility wrapper for friction helpers."""

from modules.friction_model import (  # noqa: F401
    WEEKDAY_FATIGUE_STEP,
    WEEKEND_RECOVERY,
    generate_daily_friction,
    get_time_of_day_multiplier,
)

__all__ = [
    "WEEKDAY_FATIGUE_STEP",
    "WEEKEND_RECOVERY",
    "generate_daily_friction",
    "get_time_of_day_multiplier",
]
