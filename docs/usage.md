# Synthetic Calendar Generator Usage

This repository now contains two complementary Python entry points plus a static browser UI.

## Workforce simulation CLI

```bash
python calendar_gen_v2.py --archetype office --output schedule.json --seed 42
```

Pick an archetype (office, parent, freelancer) to load one of the persona budgets defined in
`archetypes.py`. The generator produces a JSON document that includes the full week of events,
summary hour totals, and any warnings/errors discovered during validation. Adjust the `--seed`
parameter to explore different stochastic variations and the `--start-date` flag to anchor the week
on a specific Monday.

## Configuration-driven CLI

```bash
python calendar_gen.py path/to/config.json output.json
```

The deterministic MVP consumes the JSON configuration described in `calendar_gen.py` and writes a full
week of minute-by-minute events to the specified output file. It also prints summary totals for
sleep, work, meals, activities, and free time to the console.

## Browser UI

A zero-dependency web UI that mirrors the Python logic lives in `web/`. Open `web/index.html`
directly in a browser or deploy the folder to any static host (for example, Netlify). The page
accepts the same configuration JSON, renders a colour-coded weekly timeline, lists the generated
events, and allows downloading the result as JSON.

To preview locally without an external host:

```bash
cd web
python -m http.server 8000
```

Then browse to <http://localhost:8000/>.
