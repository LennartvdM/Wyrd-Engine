"""Unit tests for the friction helpers."""

from __future__ import annotations

import random
import unittest

from modules.friction_model import (
    WEEKDAY_FATIGUE_STEP,
    generate_daily_friction,
    get_time_of_day_multiplier,
)


class TestFriction(unittest.TestCase):
    def test_generate_daily_friction_is_reasonable(self) -> None:
        random.seed(42)
        values = [generate_daily_friction(i, 1.25, 0.15) for i in range(7)]
        self.assertTrue(all(0.9 <= value <= 1.8 for value in values))
        self.assertGreater(values[4], values[0])

    def test_generate_daily_friction_clamps_extremes(self) -> None:
        random.seed(7)
        self.assertAlmostEqual(generate_daily_friction(0, 0.1, 0), 0.9)
        self.assertAlmostEqual(generate_daily_friction(1, 3.0, 0), 1.8)

    def test_weekday_fatigue_curve(self) -> None:
        random.seed(0)
        base_factor = 1.2
        variance = 0
        monday = generate_daily_friction(0, base_factor, variance)
        friday = generate_daily_friction(4, base_factor, variance)
        self.assertAlmostEqual(friday, base_factor * (1 + 4 * WEEKDAY_FATIGUE_STEP))
        self.assertGreater(friday, monday)

    def test_time_of_day_multiplier(self) -> None:
        self.assertAlmostEqual(get_time_of_day_multiplier(8), 0.9)
        self.assertAlmostEqual(get_time_of_day_multiplier(15), 1.0)
        self.assertAlmostEqual(get_time_of_day_multiplier(20), 1.15)
        with self.assertRaises(ValueError):
            get_time_of_day_multiplier(24)


if __name__ == "__main__":
    unittest.main()
