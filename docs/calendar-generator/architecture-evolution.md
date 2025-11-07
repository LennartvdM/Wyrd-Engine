# Calendar Generator Architecture Evolution

The calendar generator began as a deterministic prototype designed to validate the idea of synthetic daily routines. Version one accepted explicit JSON configurations, applied rigorous validation so every day totaled exactly 1,440 minutes, and produced reliable outputs that game designers could plug into non-player character behaviours. It demonstrated feasibility but required significant manual authoring effort for each persona.

Version two reframed the tool as part of the broader Wyrd Engine "workforce" simulation. Instead of hand-crafted schedules, it composes routines dynamically from archetype definitions, layered behavioural rules, and stochastic sampling. This architectural pivot introduced resilient error handling, probabilistic budget reconciliation, and an extensible pipeline for experimenting with diverse worker profiles.

The current iteration treats both approaches as complementary engines. The deterministic path remains available for regression tests and explicit control, while the stochastic workflow encourages rapid prototyping and discovery. Each version lives behind a consistent interface, making it easy to swap between them or to script both for comparison studies.

Key lessons carried forward through each iteration include: isolating validation from generation, surfacing human-readable diagnostics, and structuring archetypes so that domain experts can extend them without touching core code. These practices now influence how other Wyrd Engine components are designed, underscoring the team's commitment to iterative refinement and portfolio-ready engineering.

## Next Steps

Planned documentation additions include a comparative study of the two generation strategies and a technical reference for the archetype schema. Contributions and feedback are welcome—open an issue to suggest topics that would help you evaluate the engine for your own world-building projects.
