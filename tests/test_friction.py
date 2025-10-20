"""Unit tests for the friction helpers."""

from __future__ import annotations

import random
import unittest

from friction import generate_daily_friction, get_time_of_day_multiplier


class TestFriction(unittest.TestCase):
    def test_generate_daily_friction_is_reasonable(self) -> None:
        random.seed(42)
        values = [generate_daily_friction(i, 1.25, 0.15) for i in range(7)]
        self.assertTrue(all(0.9 <= value <= 1.8 for value in values))
        self.assertGreater(values[4], values[0])

    def test_time_of_day_multiplier(self) -> None:
        self.assertAlmostEqual(get_time_of_day_multiplier(8), 0.9)
        self.assertAlmostEqual(get_time_of_day_multiplier(15), 1.0)
        self.assertAlmostEqual(get_time_of_day_multiplier(20), 1.15)
        with self.assertRaises(ValueError):
            get_time_of_day_multiplier(24)


if __name__ == "__main__":
    unittest.main()
