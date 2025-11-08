# Contributing Notes

Wyrd Engine is currently solo-maintained, so lightweight, well-scoped contributions are the easiest
way to help. This page outlines how to share feedback, propose changes, and keep the project healthy.

## Communication
- **Issues:** Open an issue to report bugs, request documentation, or pitch new modules. Include
  reproduction steps and affected archetypes if relevant.
- **Discussions:** Use issues for now; if the project grows we can enable GitHub Discussions.
- **Wiki updates:** Edit these Markdown files in your fork and submit a pull request. Mention the
  corresponding `docs/` pages you touched so we can keep sources aligned. 【F:docs/index.md†L1-L22】

## Pull Requests
1. Fork the repository and create a feature branch.
2. Run the test suite: `pytest tests/ -v`.
3. Document behavioural changes in `docs/` and link to them from the wiki.
4. Submit a PR with a concise summary and screenshots if you alter the web UI.
5. Expect fast iteration—the maintainer prefers small, reviewable diffs. 【F:README.md†L57-L66】

## Documentation Style
- Prefer architectural deep dives in `docs/` (kept in version control) and use the wiki as a curated
  index.
- When introducing new terms, add brief definitions in the relevant wiki page or open a PR to expand
  the glossary.
- Cross-link related content to help future readers discover context quickly.

## Ideas Welcome
Not sure where to start? Browse the [Calendar Generator](./Calendar-Generator.md) roadmap notes or
file an issue describing the simulation problem you are trying to solve. We can collaborate on a
sensible scope together.
