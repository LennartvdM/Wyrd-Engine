"""Minimal harness to run MK2 once and emit sleep debug logs."""

from __future__ import annotations

import logging
import sys
from datetime import date
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from engines.engine_mk2 import EngineMK2


def main() -> None:
    logging.basicConfig(level=logging.DEBUG, format="%(message)s")
    engine = EngineMK2()
    profile, templates = engine.select_profile("office")
    week_start = date(2024, 1, 1)
    seed = 42
    engine.generate_complete_week(profile, week_start, seed, templates=templates)


if __name__ == "__main__":
    main()
