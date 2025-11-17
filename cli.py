"""Unified command-line interface for the Wyrd scheduling engines."""

from __future__ import annotations

import argparse
import json
from datetime import date
from pathlib import Path
from typing import Optional, Sequence

from calendar_gen import format_totals as _format_simple_totals
from calendar_gen import load_config as _load_simple_config
from calendar_gen import write_output as _write_simple_output
from calendar_gen_v2 import _load_yearly_budget
from engines.base import ScheduleInput
from engines.engine_mk1 import EngineMK1
from engines.engine_mk2 import EngineMK2, EngineMK21
from rigs.simple_rig import SimpleRig
from rigs.workforce_rig import WorkforceRig


def _build_engine(engine_name: str) -> object:
    if engine_name == "mk1":
        return EngineMK1()
    if engine_name == "mk2":
        return EngineMK2()
    if engine_name == "mk2_1":
        return EngineMK21()
    raise ValueError(f"Unknown engine '{engine_name}'")


def _run_simple(args: argparse.Namespace) -> None:
    if args.config is None:
        raise SystemExit("--config is required when using the simple rig")

    engine = _build_engine(args.engine)
    rig = SimpleRig(engine=engine)
    raw_config = _load_simple_config(args.config)
    schedule_input = ScheduleInput(constraints=raw_config)
    result = rig.generate(schedule_input)

    _write_simple_output(result.events, args.output)

    week_start = result.diagnostics.get("week_start")
    week_end = result.diagnostics.get("week_end")
    character_name = result.diagnostics.get(
        "character_name", raw_config.get("name", "")
    )

    print(f"Generated schedule for {character_name}")
    if week_start is not None and week_end is not None:
        print(f"Week of {week_start.isoformat()} to {week_end.isoformat()}")
    print()
    for line in _format_simple_totals(dict(result.totals)):
        print(line)
    print()
    print(f"Schedule saved to {args.output}")


def _run_workforce(args: argparse.Namespace) -> None:
    engine = _build_engine(args.engine)
    rig = WorkforceRig(engine=engine)

    start = date.fromisoformat(args.start_date) if args.start_date else date.today()
    profile, templates = rig.select_profile(args.archetype)

    yearly_budget = _load_yearly_budget(args.yearly_budget)
    result = rig.generate_complete_week(
        profile,
        start,
        args.seed,
        templates,
        yearly_budget,
    )

    args.output.write_text(json.dumps(result, indent=2))

    print(f"Generated week for {profile.name}")
    print(f"Week starting: {result['week_start']}")
    print(f"Events: {result['metadata']['total_events']}")
    if result["issues"]:
        print(f"⚠️  {result['metadata']['issue_count']} issues detected")
        for issue in result["issues"]:
            print(
                f"  - {issue['day']}: {issue['details']} ({issue['severity']})"
            )
    else:
        print("No major issues detected")

    print("Summary (hours):")
    for activity, hours in sorted(result["metadata"]["summary_hours"].items()):
        print(f"  {activity}: {hours:.2f}")

    print(f"Schedule saved to {args.output}")


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(description="Unified Wyrd Engine CLI")
    parser.add_argument(
        "--engine",
        choices=["mk1", "mk2", "mk2_1"],
        required=True,
        help="Select which engine implementation to use",
    )
    parser.add_argument(
        "--rig",
        choices=["simple", "calendar", "workforce"],
        required=True,
        help="Choose the rig that wires dependencies for the engine",
    )
    parser.add_argument(
        "--config",
        type=Path,
        help="Configuration file for deterministic (mk1) generation",
    )
    parser.add_argument(
        "--archetype",
        choices=["office", "parent", "freelancer"],
        default="office",
        help="Person profile archetype for workforce rigs",
    )
    parser.add_argument(
        "--seed",
        type=int,
        default=42,
        help="Random seed controlling stochastic variation",
    )
    parser.add_argument(
        "--start-date",
        dest="start_date",
        type=str,
        default=None,
        help="Optional ISO start date for workforce schedules",
    )
    parser.add_argument(
        "--yearly-budget",
        dest="yearly_budget",
        type=Path,
        default=None,
        help="Optional path to a yearly budget JSON file",
    )
    parser.add_argument(
        "--output",
        type=Path,
        required=True,
        help="Where to write the generated JSON output",
    )
    return parser


def main(argv: Optional[Sequence[str]] = None) -> None:
    parser = build_parser()
    args = parser.parse_args(argv)

    if args.rig == "simple":
        if args.engine != "mk1":
            parser.error("The simple rig requires the mk1 engine")
        _run_simple(args)
        return

    if args.rig in {"calendar", "workforce"}:
        if args.engine not in {"mk2", "mk2_1"}:
            parser.error(
                f"The {args.rig} rig requires an MK2-series engine (mk2 or mk2_1)"
            )
        _run_workforce(args)
        return

    parser.error(f"Unsupported rig: {args.rig}")


if __name__ == "__main__":
    main()
