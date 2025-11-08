"""Parity tests between the unified CLI and legacy entry points."""

from __future__ import annotations

import io
import json
import random
import sys
from contextlib import redirect_stdout
from pathlib import Path
from unittest import mock

import pytest

import calendar_gen
import calendar_gen_v2
import cli

ROOT = Path(__file__).resolve().parents[1]


@pytest.mark.parametrize(
    "cli_args, legacy_runner",
    [
        (
            [
                "--engine",
                "mk1",
                "--rig",
                "simple",
                "--config",
                str(ROOT / "tests/fixtures/deterministic_sample_config.json"),
            ],
            "run_calendar_gen",
        ),
        (
            [
                "--engine",
                "mk2",
                "--rig",
                "workforce",
                "--archetype",
                "office",
                "--seed",
                "7",
                "--start-date",
                "2025-01-06",
            ],
            "run_calendar_gen_v2",
        ),
    ],
)
def test_cli_matches_legacy(tmp_path: Path, cli_args, legacy_runner) -> None:
    cli_output = tmp_path / "cli_output.json"
    legacy_output = tmp_path / "legacy_output.json"

    def run_cli() -> str:
        buffer = io.StringIO()
        with redirect_stdout(buffer):
            cli.main([*cli_args, "--output", str(cli_output)])
        return buffer.getvalue()

    def run_calendar_gen_legacy() -> str:
        buffer = io.StringIO()
        with redirect_stdout(buffer):
            calendar_gen.main([
                str(ROOT / "tests/fixtures/deterministic_sample_config.json"),
                str(legacy_output),
            ])
        return buffer.getvalue()

    def run_calendar_gen_v2_legacy() -> str:
        buffer = io.StringIO()
        with redirect_stdout(buffer):
            argv = [
                "calendar_gen_v2.py",
                "--archetype",
                "office",
                "--seed",
                "7",
                "--start-date",
                "2025-01-06",
                "--output",
                str(legacy_output),
            ]
            with mock.patch.object(sys, "argv", argv):
                calendar_gen_v2.main()
        return buffer.getvalue()

    random.seed(12345)
    cli_stdout = run_cli()

    random.seed(12345)
    if legacy_runner == "run_calendar_gen":
        legacy_stdout = run_calendar_gen_legacy()
    else:
        legacy_stdout = run_calendar_gen_v2_legacy()

    cli_data = json.loads(cli_output.read_text())
    legacy_data = json.loads(legacy_output.read_text())
    assert cli_data == legacy_data

    def normalise_output(text: str, output_path: Path) -> str:
        return text.replace(str(output_path), "<OUTPUT>")

    assert normalise_output(cli_stdout.strip(), cli_output) == normalise_output(
        legacy_stdout.strip(), legacy_output
    )
