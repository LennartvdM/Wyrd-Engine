"""Baseline fixtures capturing current CLI behaviour."""

from __future__ import annotations

import json
from pathlib import Path

import pytest

FIXTURE_DIR = Path(__file__).parent / "fixtures"

# Captured outputs from the deterministic MVP and two workforce archetype runs.
FIXTURE_FILES = [
    "deterministic_sample_output.json",
    "workforce_office_seed7.json",
    "workforce_parent_seed42.json",
]


@pytest.mark.parametrize("filename", FIXTURE_FILES)
def test_fixture_exists_and_parses(filename: str) -> None:
    """Ensure each captured fixture exists and contains valid JSON."""

    path = FIXTURE_DIR / filename
    assert path.is_file(), f"Missing fixture: {path}"

    with path.open("r", encoding="utf-8") as handle:
        data = json.load(handle)

    # The deterministic CLI produces a list of events; the workforce CLI emits a dict.
    assert isinstance(data, (list, dict)), f"Unexpected JSON structure in {filename}"
    if isinstance(data, list):
        assert data, f"Fixture list for {filename} is unexpectedly empty"
    else:
        assert data.keys(), f"Fixture dict for {filename} is unexpectedly empty"
