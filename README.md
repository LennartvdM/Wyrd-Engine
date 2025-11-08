(mal)functioning prototype:
https://wyrrdmaek.netlify.app/

# Wyrd Engine

Procedural generation tools for believable synthetic schedules and environments.

## Overview

Wyrd Engine provides deterministic and probabilistic generators that create minute-by-minute schedules across a full week. The modular design separates core algorithms (engines), reusable capabilities (modules), and integration layers (rigs) so teams can mix and match features without rewriting pipelines.

## Evolution

- **MK1 deterministic core.** A reproducible placement engine that fills schedules from explicit constraints.
- **MK2 behavioural engine.** Introduced friction, fatigue, and cultural context to generate varied yet realistic days.
- **Modular rigs.** Engines now plug into calendar, validation, and workforce rigs, letting applications swap features or extend the system with custom modules.

## Quickstarts

### 1. MK1 engine + Simple rig
1. Prepare a deterministic config (see `tests/fixtures/deterministic_sample_config.json`).
2. Run:
   ```bash
   python cli.py --engine mk1 --rig simple --config tests/fixtures/deterministic_sample_config.json --output mk1_simple.json
   ```
3. Review the JSON schedule and printed activity totals.

### 2. MK2 engine + Calendar rig
1. Choose an archetype (office, parent, freelancer).
2. Run:
   ```bash
   python cli.py --engine mk2 --rig calendar --archetype office --output mk2_calendar.json --seed 7
   ```
3. Inspect the generated week; the calendar rig injects holidays and seasonal adjustments.

### 3. MK2 engine + Workforce rig
1. Optionally customise the yearly budget (see `examples/yearly_budget_alice.json`).
2. Run:
   ```bash
   python cli.py --engine mk2 --rig workforce --archetype parent --yearly-budget examples/yearly_budget_alice.json --output mk2_workforce.json
   ```
3. Check the diagnostics for friction effects, unique days, and validation results.

## Project Structure

```
engines/          Core scheduling algorithms (MK1, MK2)
modules/          Optional capabilities (calendar, friction, validation)
rigs/             Composition layer combining engines + modules
web/              Static browser implementation
docs/             Extended documentation and design history
tests/            Unit and integration tests
```

## Documentation

- [Architecture overview](ARCHITECTURE.md) – High-level map of engines, modules, and rigs.
- [Calendar generator history](docs/calendar-generator/) – Evolution notes and prototypes.
- [Release notes](docs/releases/v3.0-modular.md) – Highlights for the v3.0-modular release.

## Development

Run the test suite:

```bash
pytest tests/ -v
```

All generators produce validated schedules: exactly 1440 minutes per day with no overlaps.

## License

MIT
