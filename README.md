# Wyrd Engine

Procedural generation tools for creating believable synthetic schedules and environments.

## Overview

The Synthetic Calendar Generator creates minute-by-minute schedules for fictional characters. It evolved from deterministic placement (specify exact times) to probabilistic modeling that accounts for human behavior patterns like fatigue, inefficiency, and cultural context.

**Key features:**
- Deterministic scheduling (MK1) for reproducible results
- Behavioral modeling (MK2) with friction and fatigue curves
- Calendar-aware generation (holidays, bridge days, seasonal variations)
- Graceful overflow handling through compression and priority drops
- Modular architecture enabling algorithm comparison

## Quick Start

**Generate a deterministic schedule:**
```python
python calendar_gen.py config.json output.json
```

**Generate a behavioral schedule:**
```python
python calendar_gen_v2.py --archetype office --output schedule.json --seed 42
```

**Use the modular interface:**
```python
python cli.py --engine mk2 --rig workforce --archetype parent --output week.json
```

## Live Demo

Try the browser-based generator: [wyrrdmaek.netlify.app](https://wyrrdmaek.netlify.app)

## How It Works

The first version used deterministic placement—activities appear exactly when specified. This works for rigid schedules but fails to capture realistic behavior. Nobody's gym session takes exactly 60 minutes every time.

The second version introduced probabilistic modeling. Provide weekly constraints (40 hours work, 3 hours fitness) and the system distributes activities while modeling inefficiency. A 60-minute workout becomes 75 minutes on Monday, 115 on Friday as fatigue accumulates. It handles weekends, holidays, and seasonal variations.

The current architecture separates core algorithms (engines) from optional features (modules). This enables direct comparison between approaches and makes future extensions straightforward.

## Project Structure

```
engines/          Core scheduling algorithms (MK1, MK2)
modules/          Optional features (calendar, friction, validation)
rigs/             Composition layer combining engines + modules
web/              Static browser implementation
docs/             Architecture details and design decisions
tests/            Unit and integration tests
```

## Documentation

- [Architecture Evolution](docs/calendar-generator/) - Design progression from prototype to modular system
- [Algorithm Comparison](docs/calendar-generator/comparison.md) - MK1 vs MK2 analysis *(coming soon)*
- [Technical Reference](docs/) - Component specifications

## Development

Run tests:
```python
pytest tests/ -v
```

All generators produce validated schedules: exactly 1440 minutes per day, no gaps or overlaps.

## License

MIT
