# Getting Started

This guide walks you through installing dependencies, generating your first schedules, and browsing
the static UI. It complements the high-level overview in the [README](../index.md) and the detailed
[usage notes](../usage.md).

## Prerequisites
- Python 3.10+
- Optional: the [`holidays`](https://pypi.org/project/holidays/) package for live national holiday
  data. The engine ships with a Dutch fallback so you can experiment without external downloads.
- Recommended: a virtual environment to isolate dependencies.

## Installation
```bash
python -m venv .venv
source .venv/bin/activate  # Windows: .venv\\Scripts\\activate
pip install -r requirements.txt
```
The requirements file includes `holidays` and testing utilities. If you only want the generator,
you can skip the installation step—the fallback data keeps everything functional. 【F:modules/calendar_provider.py†L1-L84】

## Generate a Deterministic Schedule (MK1)
```bash
python calendar_gen.py path/to/config.json output.json
```
This entry point consumes a JSON configuration that specifies exact activity windows. The script
prints a summary of activity totals and writes a full week of minute-by-minute events to the output
file. 【F:README.md†L21-L43】【F:docs/usage.md†L23-L37】

## Generate a Behavioral Schedule (MK2)
```bash
python calendar_gen_v2.py --archetype office --output schedule.json --seed 42 \
  --start-date 2025-12-22 --yearly-budget examples/yearly_budget_alice.json
```
MK2 models fatigue, inefficiency, and cultural context. Archetypes (office, parent, freelancer)
select persona templates with tuned friction curves and activity preferences. Optional yearly budget
files layer in vacations or unique days. Adjust the `--seed` to explore stochastic variations.
【F:README.md†L21-L31】【F:docs/usage.md†L5-L21】

## Explore the Modular CLI
```bash
python cli.py --engine mk2 --rig workforce --archetype parent --output week.json
```
The modular interface wires engines and optional modules together so you can benchmark approaches or
swap persona rigs. Start here when testing new modules or comparing MK1 vs MK2 behaviour. 【F:README.md†L33-L35】

## Browse the Web Demo
```bash
cd web
python -m http.server 8000
```
Visit <http://localhost:8000/> and load a configuration JSON. The zero-dependency UI mirrors the
Python logic, colour-codes the timeline, and lets you download the generated schedule. Deploy the
same folder to any static host when you are ready to share results. 【F:docs/usage.md†L39-L55】

## Next Steps
- Continue to the [Calendar Generator](./Calendar-Generator.md) page for architecture insights.
- Open the [`examples/`](../../examples) folder to see ready-made budgets and configs.
- Run `pytest tests/ -v` to verify changes before sharing them. 【F:README.md†L61-L66】
