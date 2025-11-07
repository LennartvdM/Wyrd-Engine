"""Backward compatible exports for unique day scheduling utilities."""

from modules.unique_events import (
    UniqueDay,
    generate_birthday_day,
    generate_custom_day,
    generate_sick_day,
    generate_tax_day,
    generate_unique_day_schedule,
    generate_vacation_day,
    generate_wedding_day,
)

__all__ = [
    "UniqueDay",
    "generate_unique_day_schedule",
    "generate_vacation_day",
    "generate_sick_day",
    "generate_wedding_day",
    "generate_birthday_day",
    "generate_tax_day",
    "generate_custom_day",
]
