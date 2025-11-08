# Wyrd Engine Architecture

The Wyrd Engine is organised around three cooperating layers: engines, modules, and rigs. Engines hold the core scheduling algorithms, modules provide optional services, and rigs assemble the pieces into production-ready pipelines. This document summarises how those pieces interact in the modular 3.0 release.

## Engines

- **Engine MK1 – deterministic placement.** Consumes structured constraints (sleep, meals, activities) and lays them out with fixed durations. It is side-effect free and best suited for reproducible prototypes.
- **Engine MK2 – behavioural synthesis.** Builds stochastic schedules by sampling fatigue curves, friction, and cultural context. MK2 exposes hooks for calendars, unique events, and validators so features can be swapped without changing the engine core.

Both engines implement the shared `ScheduleInput` / `ScheduleResult` contract from `engines.base`, ensuring rigs can switch implementations without changing callers.

## Modules

Modules are light-weight capabilities that can be reused across rigs:

- **Calendar provider** (`modules.calendar_provider`). Supplies holiday and bridge-day metadata. Engines request calendar lookups through this interface instead of hard-coded tables.
- **Friction model** (`modules.friction_model`). Generates daily efficiency multipliers that MK2 applies when stretching or compressing activities.
- **Unique events** (`modules.unique_events`). Injects rare days (vacations, outages) while respecting yearly budgets and priority rules.
- **Validation** (`modules.validation`). Performs invariant checks on generated weeks and reports structured issues.

Modules expose simple functions or classes so that downstream applications can replace them with custom implementations.

## Rigs

Rigs compose an engine with the modules it needs and expose a high-level API tailored to a scenario:

- **SimpleRig** wires MK1 with no additional modules. It loads deterministic constraints and returns final events with summary totals.
- **CalendarRig** shares a calendar provider across dependent components. Other rigs inherit from it to stay calendar-aware.
- **WorkforceRig** extends `CalendarRig` and attaches MK2 to the friction, unique event, and validation modules. It also exposes `select_profile` and `generate_complete_week` helpers for workforce simulations.

Rigs double as the integration surface for the command line scripts (`calendar_gen.py`, `calendar_gen_v2.py`, `cli.py`). They guarantee that engines stay isolated from IO concerns while applications gain ergonomic entry points.

## Data Flow Overview

1. **Input** – A rig reads configuration (deterministic constraints, archetypes, yearly budgets) and converts it into a `ScheduleInput`.
2. **Engine execution** – The selected engine produces a candidate week, calling modules as needed for calendars, friction, or unique events.
3. **Validation & diagnostics** – Modules validate output and enrich diagnostics (totals, summaries, issues).
4. **Output** – Rigs format the result for their caller: JSON schedules for CLIs or structured dictionaries for downstream integrations.

This layering keeps the system extensible: new engines can reuse existing modules, modules can be swapped at runtime, and rigs can tailor the pipeline to new domains without duplicating logic.
