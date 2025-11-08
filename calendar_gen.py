"""Synthetic Calendar Generator MVP.

Generates a 7-day schedule for a single character using a simple
configuration file. The generator prioritises sleep, work, meals, and
optional activities before filling the remaining gaps with free time.

Usage:
    python calendar_gen.py config.json output.json
"""

from __future__ import annotations

import argparse
import json
from pathlib import Path
from typing import Dict, Optional, Sequence

from engines.base import ScheduleInput
from rigs.simple_rig import SimpleRig


def load_config(path: Path) -> Dict[str, object]:
    """Load the configuration JSON as a raw dictionary."""

    return json.loads(path.read_text())


def write_output(events: Sequence[Dict[str, object]], path: Path) -> None:
    """Serialise the generated events to JSON."""

    path.write_text(json.dumps(list(events), indent=2))


def format_totals(totals: Dict[str, float]) -> Sequence[str]:
    return [f"Total {activity}: {hours:.1f} hours" for activity, hours in sorted(totals.items())]


def main(argv: Optional[Sequence[str]] = None) -> None:
    parser = argparse.ArgumentParser(description="Synthetic Calendar Generator")
    parser.add_argument("config", type=Path, help="Path to configuration JSON")
    parser.add_argument("output", type=Path, help="Path to output JSON file")
    args = parser.parse_args(argv)

    raw_config = load_config(args.config)

    rig = SimpleRig()
    schedule_input = ScheduleInput(constraints=raw_config)
    result = rig.generate(schedule_input)

    write_output(result.events, args.output)

    week_start = result.diagnostics.get("week_start")
    week_end = result.diagnostics.get("week_end")
    character_name = result.diagnostics.get("character_name", raw_config.get("name", ""))

    print(f"Generated schedule for {character_name}")
    if week_start is not None and week_end is not None:
        print(f"Week of {week_start.isoformat()} to {week_end.isoformat()}")
    print()
    for line in format_totals(dict(result.totals)):
        print(line)
    print()
    print(f"Schedule saved to {args.output}")


if __name__ == "__main__":
    main()

