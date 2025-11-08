# Calendar Generator

This page distills how the current workforce calendar generator works, why it evolved beyond the
initial deterministic approach, and where to look when extending it.

## Evolution at a Glance
- **MK1 (Deterministic):** Accepts explicit start/end times for each activity. Ideal for reproducible
  baselines and debugging validation logic. 【F:docs/calendar-generator/architecture-evolution.md†L9-L32】
- **MK2 (Behavioral):** Allocates time using friction curves, fatigue accumulation, and cultural
  context. It handles stochastic variation while respecting persona constraints. 【F:docs/calendar-generator/architecture-evolution.md†L34-L68】
- **Modular rigs:** Engines plug into optional modules (calendar provider, friction, validation) so
you can compare strategies without rewriting boilerplate. 【F:README.md†L41-L51】【F:modules/calendar_provider.py†L1-L120】

## Persona Archetypes
The MK2 engine ships with three archetypes:
- **Office worker:** Balanced weekdays, occasional gym sessions, and standard Dutch holidays.
- **Exhausted parent:** Reduced sleep, higher chore loads, and compressed work blocks.
- **Night-owl freelancer:** Late sleep schedule, flexible work hours, and outdoor preference in
  summer months.

Each archetype is defined by a persona factory plus activity templates. Review `archetypes.py` for
the source data or add your own profiles by mirroring the helper functions. 【F:engines/engine_mk2.py†L12-L66】

## Seasonal and Special Events
- `CalendarProvider.get_seasonal_modifiers` returns daylight hours, outdoor multipliers, and energy
  hints based on the month. Activities tagged as outdoor respond to these values automatically.
- Bridge days (Fridays before or Mondays after holidays) receive reduced work allocations to mimic
  common European scheduling habits.
- Unique events from yearly budgets (vacations, sick leave) replace the default schedule whenever a
  matching date is detected. 【F:modules/calendar_provider.py†L1-L120】【F:modules/unique_events.py†L1-L120】

## Validation Passes
Every generated week runs through `validation.validate_week`, ensuring:
- 1440 minutes of coverage per day with no overlaps or gaps.
- Activity priorities resolve when compression is required.
- Warnings surface for inconsistent persona budgets or missing activities.
Check `validation.py` for the full rule set before adding new activity types. 【F:validation.py†L1-L120】

## Extending the Engine
1. Add or modify archetypes in `archetypes.py`.
2. Create modules in `modules/` and register them with the rig configuration.
3. Update tests under `tests/` to cover new behaviour.
4. Document your change in the wiki and cross-link the relevant design notes in `docs/`.
