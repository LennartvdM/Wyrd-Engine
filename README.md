(mal)functioning prototype:
https://wyrrdmaek.netlify.app/

# Wyrd Engine

## flock — the current simulator

`flock/` is a population simulator for synthetic people, written to be tested against by AI agent
swarms. It is algorithmic: plain Python, standard library only, no model and no learning at runtime.
People have commitments, a bedtime and an alarm, minutes since their last meal, and a weighted
choice of free activities by hour band. Households and workplaces own the shared times, so commute
waves and the lunch peak come out of the population rather than being written down. Agents observe
people, ping them, request slots and send invites, and get replies delayed by what the person is
doing.

    python -m flock day --person 17 --day tue
    python -m flock histogram --day weekday
    python -m flock checks --seed 1 --people 400 --weeks 4
    python -m flock demo-swarm

There is a browser interface too, and it is kept as a version log rather than a single app: every
version stays up and runnable so the reasoning behind each step is visible. All of them run their
Python in the browser under Pyodide.

| Page | What it is |
| --- | --- |
| `/` | the version log, oldest first |
| `/workbench.html` | the original prototype, unchanged |
| `/mk1/` | first flock release: people keep the same minutes daily, population counted by the hour |
| `/mk2/` | departure slack and commute hold-ups; five-minute bins |
| `/flock/` | mk3, the current one: the working day itself varies from day to day |

**Adding a version.** Freeze the current one by copying `web/flock/` and the package into
`web/mk<n>/flock/` (its `runner.js` reads that copy rather than the shared build manifest, so it
keeps working as the live package moves on), then carry on in `flock/` and `web/flock/` and add an
entry to `web/index.html`. Old versions are never edited.

See [flock/README.md](flock/README.md) for the commands and the agent API, and
[flock/NOTES.md](flock/NOTES.md) for every decision taken, the numbers behind each claim, and the
seeds and population sizes on which the realism checks fail.

`checks` runs 53 realism tests against published time-use figures. All 53 pass at 400 people over 4
weeks on seeds 1 and 4-8; seeds 2 and 3 fail one (`18a`, which scores a sharper commute rush higher
and so penalises the day-to-day variation added in mk3 — documented in the notes). 1000 people over
4 weeks takes about 14 seconds.

## Earlier prototype (superseded)

Everything below, and the code in `engines/`, `modules/`, `rigs/`, `tes/` and `web/`, is the earlier
attempt. It generates a week of schedules per isolated person and is kept for reference. Its known
limits: durations were inflated by a multiplier applied to every activity including sleep, activities
were placed end to end so an overrun pushed later ones into the night, days were boxed at midnight so
sleep was truncated, and people were simulated independently of each other.

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

## MK2 Visualisation (Forensic Replay)

- **Live site:** https://wyrrdmaek.netlify.app/
- **Browser UI supports MK2 directly.** Run a script in the **Test Console** and switch back to the **Calendar** tab to regenerate the MK2 schedule with the engine dropdown.

1. **Generate a run in the Test Console.** Switch to the **Test Console** tab, click **Load Runtime**, and pick **Run MK2 quick test** (or your own script). Update the **Runner config JSON** and execution inputs as needed, then hit **Run**. The Stdout/Stderr/Result panels capture the MK2 engine output.
2. **Load it in Visualisation.** Return to the **Calendar** tab. Paste the same config you used in the Test Console into **Configuration JSON**, optionally set the start date, and press **Generate schedule**. The calendar, weekly totals, and MK2 replay wheel unlock once the run is recreated in the browser.
3. **Play the 5s recap.** With a schedule loaded, press **Replay GIF** or **Replay MP4**. The radial visualisation animates a five second MK2 recap while the export renders.
4. **Inspect JSON ↔ arcs.** Hover or tap arcs in the minute picker to highlight matching entries in the **Event JSON** list (and vice versa). The label above the wheel reports the current minute span, day, and activity.
5. **Export/share.** Use **Download JSON** for the schedule, **Frame PNG/SVG** for stills, and the replay exports (GIF/MP4) to share the animated forensic view. Status messages confirm when each export is ready.

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
