"""Adapter functions for running Wyrd engines inside the web worker."""

from __future__ import annotations

from dataclasses import asdict
from datetime import date
from typing import Any, Dict, Iterable, Mapping, MutableMapping, Optional

from engines.base import ScheduleInput
from engines.engine_mk1 import EngineMK1
from engines.engine_mk2 import EngineMK2, EngineMK21
from modules.unique_events import UniqueDay
from rigs.simple_rig import SimpleRig
from rigs.workforce_rig import WorkforceRig
from yearly_budget import YearlyBudget

SchemaPayload = Dict[str, Any]

# ---------------------------------------------------------------------------
# MK1 configuration presets -------------------------------------------------
# ---------------------------------------------------------------------------

_MK1_CONFIGS: Dict[str, Mapping[str, Any]] = {
    "office": {
        "name": "Office Routine",
        "sleep": {"bedtime": "23:00", "duration_hours": 8},
        "work": {
            "start": "09:00",
            "duration_hours": 8,
            "days": ["monday", "tuesday", "wednesday", "thursday", "friday"],
        },
        "meals": {"breakfast": "07:30", "lunch": "12:30", "dinner": "18:30"},
        "activities": [
            {
                "name": "commute_in",
                "time": "08:15",
                "duration_minutes": 45,
                "days": ["monday", "tuesday", "wednesday", "thursday", "friday"],
            },
            {
                "name": "commute_out",
                "time": "17:15",
                "duration_minutes": 45,
                "days": ["monday", "tuesday", "wednesday", "thursday", "friday"],
            },
            {
                "name": "gym",
                "time": "19:15",
                "duration_minutes": 60,
                "days": ["tuesday", "thursday"],
            },
            {
                "name": "reading",
                "time": "21:00",
                "duration_minutes": 60,
                "days": ["monday", "wednesday"],
            },
            {
                "name": "friends",
                "time": "20:00",
                "duration_minutes": 120,
                "days": ["friday"],
            },
        ],
    },
    "parent": {
        "name": "Caregiver Schedule",
        "sleep": {"bedtime": "22:30", "duration_hours": 7.5},
        "work": {
            "start": "08:30",
            "duration_hours": 7,
            "days": ["monday", "tuesday", "wednesday", "thursday", "friday"],
        },
        "meals": {"breakfast": "07:00", "lunch": "12:00", "dinner": "18:00"},
        "activities": [
            {
                "name": "school_run_morning",
                "time": "07:30",
                "duration_minutes": 45,
                "days": ["monday", "tuesday", "wednesday", "thursday", "friday"],
            },
            {
                "name": "school_run_afternoon",
                "time": "15:30",
                "duration_minutes": 45,
                "days": ["monday", "tuesday", "wednesday", "thursday", "friday"],
            },
            {
                "name": "chores",
                "time": "17:15",
                "duration_minutes": 60,
                "days": ["wednesday", "saturday"],
            },
            {
                "name": "family_time",
                "time": "19:00",
                "duration_minutes": 120,
                "days": ["saturday"],
            },
            {
                "name": "movie_night",
                "time": "20:00",
                "duration_minutes": 150,
                "days": ["friday"],
            },
        ],
    },
    "freelancer": {
        "name": "Freelance Flow",
        "sleep": {"bedtime": "01:00", "duration_hours": 7.5},
        "work": {
            "start": "10:00",
            "duration_hours": 6,
            "days": ["monday", "tuesday", "wednesday", "thursday", "friday"],
        },
        "meals": {"breakfast": "09:00", "lunch": "16:00", "dinner": "20:00"},
        "activities": [
            {
                "name": "client_calls",
                "time": "16:45",
                "duration_minutes": 60,
                "days": ["tuesday", "thursday"],
            },
            {
                "name": "networking",
                "time": "18:30",
                "duration_minutes": 90,
                "days": ["wednesday"],
            },
            {
                "name": "creative_jam",
                "time": "21:30",
                "duration_minutes": 120,
                "days": ["monday", "friday"],
            },
            {
                "name": "errands",
                "time": "14:30",
                "duration_minutes": 60,
                "days": ["monday"],
            },
        ],
    },
}


# ---------------------------------------------------------------------------
# Helpers -------------------------------------------------------------------
# ---------------------------------------------------------------------------

def _coerce_seed(value: Any) -> int:
    if isinstance(value, bool):
        return int(value)
    if isinstance(value, (int, float)):
        return int(value)
    if isinstance(value, str):
        text = value.strip()
        if not text:
            return 0
        try:
            return int(text, 10)
        except ValueError:
            return abs(hash(text)) % (2**32)
    return 0


def _coerce_start_date(value: Any) -> Optional[date]:
    if isinstance(value, date):
        return value
    if isinstance(value, str) and value:
        try:
            return date.fromisoformat(value)
        except ValueError:
            return None
    return None


def _ensure_schema(
    payload: MutableMapping[str, Any], *, rig: str, seed: int, archetype: str, engine_version: Optional[str] = None
) -> SchemaPayload:
    metadata = dict(payload.get("metadata", {}))
    metadata.setdefault("summary_hours", {})
    resolved_engine = engine_version or ("mk2" if rig in {"calendar", "workforce"} else "mk1")
    metadata.update(
        {
            "engine": resolved_engine,
            "engine_version": resolved_engine,
            "rig": rig,
            "seed": seed,
            "archetype": archetype,
            "total_events": len(payload.get("events", [])),
            "issue_count": len(payload.get("issues", [])),
        }
    )

    payload = dict(payload)
    payload["metadata"] = metadata
    payload.setdefault("schema_version", "web_v1_calendar")
    payload.setdefault("person", archetype)
    return payload


def _build_yearly_budget(data: Optional[Mapping[str, Any]]) -> Optional[YearlyBudget]:
    if not isinstance(data, Mapping):
        return None

    try:
        person_id = str(data["person_id"])
        year = int(data["year"])
    except (KeyError, TypeError, ValueError):
        return None

    budget = YearlyBudget(
        person_id=person_id,
        year=year,
        vacation_days=int(data.get("vacation_days", 20) or 20),
        sick_days_taken=int(data.get("sick_days_taken", 0) or 0),
    )

    for entry in data.get("unique_days", []):
        if not isinstance(entry, Mapping):
            continue
        try:
            day = UniqueDay(
                date=date.fromisoformat(str(entry["date"])),
                day_type=str(entry.get("day_type", "custom")),
                rules=dict(entry.get("rules", {})),
                priority=int(entry.get("priority", 5) or 5),
            )
        except (KeyError, TypeError, ValueError):
            continue
        budget.add_unique_day(day)

    return budget


def _convert_events(events: Iterable[Mapping[str, Any]]) -> Iterable[Dict[str, Any]]:
    return [dict(event) for event in events]


# ---------------------------------------------------------------------------
# Public adapter functions ---------------------------------------------------
# ---------------------------------------------------------------------------

_MK1_ENGINE = EngineMK1()
_MK1_RIG = SimpleRig(engine=_MK1_ENGINE)

_MK2_ENGINE = EngineMK2()
_MK2_RIG = WorkforceRig(engine=_MK2_ENGINE)
_MK2_1_ENGINE = EngineMK21()
_MK2_1_RIG = WorkforceRig(engine=_MK2_1_ENGINE)


def mk1_run_web(archetype: str, week_start: Optional[str], seed: Any) -> SchemaPayload:
    archetype_key = str(archetype or "office").strip().lower()
    config = _MK1_CONFIGS.get(archetype_key, _MK1_CONFIGS["office"])
    start_date = _coerce_start_date(week_start)
    seed_value = _coerce_seed(seed)

    schedule_input = ScheduleInput(constraints=config, seed=seed_value)
    if start_date is not None:
        schedule_input = schedule_input.with_metadata(start_date=start_date)

    result = _MK1_RIG.generate(schedule_input)
    events = _convert_events(result.events)
    totals = {key: float(value) for key, value in result.totals.items()}

    diagnostics = dict(result.diagnostics)
    week_start_value = diagnostics.get("week_start")
    if isinstance(week_start_value, date):
        week_start_iso = week_start_value.isoformat()
    elif isinstance(week_start_value, str):
        week_start_iso = week_start_value
    else:
        week_start_iso = start_date.isoformat() if start_date else ""

    payload: MutableMapping[str, Any] = {
        "person": diagnostics.get("character_name", config.get("name", "")),
        "week_start": week_start_iso,
        "events": events,
        "issues": [],
        "metadata": {
            "summary_hours": {key: round(value, 2) for key, value in totals.items()},
        },
    }

    return _ensure_schema(
        payload,
        rig="default",
        seed=seed_value,
        archetype=archetype_key or "office",
        engine_version="mk1",
    )


def _run_mk2_variant(
    rig_instance: WorkforceRig,
    archetype: str,
    week_start: Optional[str],
    seed: Any,
    *,
    engine_version: str,
    rig_label: str,
    yearly_budget: Optional[Mapping[str, Any]] = None,
    debug: bool = False,
) -> SchemaPayload:
    archetype_key = str(archetype or "office").strip().lower()
    seed_value = _coerce_seed(seed)
    start_date = _coerce_start_date(week_start) or date.today()

    profile, templates = rig_instance.select_profile(archetype_key)
    budget = _build_yearly_budget(yearly_budget) if yearly_budget is not None else None

    result = rig_instance.generate_complete_week(
        profile, start_date, seed_value, templates, budget, debug=debug
    )

    payload: MutableMapping[str, Any] = dict(result)
    payload.setdefault("issues", [])
    payload.setdefault("events", [])
    payload.setdefault("week_start", start_date.isoformat())
    payload["person"] = profile.name
    metadata = dict(payload.get("metadata", {}))
    metadata["profile"] = profile.name
    metadata["engine_version"] = engine_version
    if budget is not None:
        metadata["yearly_budget"] = {
            "person_id": budget.person_id,
            "year": budget.year,
            "vacation_days": budget.vacation_days,
            "sick_days_taken": budget.sick_days_taken,
            "unique_days": [asdict(day) for day in budget.unique_days],
        }
    payload["metadata"] = metadata

    return _ensure_schema(
        payload,
        rig=rig_label,
        seed=seed_value,
        archetype=archetype_key,
        engine_version=engine_version,
    )


def mk2_run_calendar_web(
    archetype: str, week_start: Optional[str], seed: Any, debug: bool = False
) -> SchemaPayload:
    return _run_mk2_variant(
        _MK2_RIG,
        archetype,
        week_start,
        seed,
        engine_version="mk2",
        rig_label="calendar",
        yearly_budget=None,
        debug=debug,
    )


def mk2_run_workforce_web(
    archetype: str,
    week_start: Optional[str],
    seed: Any,
    yearly_budget: Optional[Mapping[str, Any]],
    debug: bool = False,
) -> SchemaPayload:
    return _run_mk2_variant(
        _MK2_RIG,
        archetype,
        week_start,
        seed,
        engine_version="mk2",
        rig_label="workforce",
        yearly_budget=yearly_budget,
        debug=debug,
    )


def mk2_1_run_calendar_web(
    archetype: str, week_start: Optional[str], seed: Any, debug: bool = False
) -> SchemaPayload:
    return _run_mk2_variant(
        _MK2_1_RIG,
        archetype,
        week_start,
        seed,
        engine_version="mk2_1",
        rig_label="calendar",
        yearly_budget=None,
        debug=debug,
    )


def mk2_1_run_workforce_web(
    archetype: str,
    week_start: Optional[str],
    seed: Any,
    yearly_budget: Optional[Mapping[str, Any]],
    debug: bool = False,
) -> SchemaPayload:
    return _run_mk2_variant(
        _MK2_1_RIG,
        archetype,
        week_start,
        seed,
        engine_version="mk2_1",
        rig_label="workforce",
        yearly_budget=yearly_budget,
        debug=debug,
    )


__all__ = [
    "mk1_run_web",
    "mk2_run_calendar_web",
    "mk2_run_workforce_web",
    "mk2_1_run_calendar_web",
    "mk2_1_run_workforce_web",
]
