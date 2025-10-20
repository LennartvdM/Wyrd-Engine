# Synthetic Calendar Generator Usage

This repository contains two ways to build a weekly schedule for a single NPC-style character.

## Command-line tool

```
python calendar_gen.py path/to/config.json output.json
```

The CLI consumes the JSON configuration described in `calendar_gen.py` and writes a full week of
minute-by-minute events to the specified output file. It also prints summary totals for sleep, work,
meals, activities, and free time to the console.

## Browser UI

A zero-dependency web UI that mirrors the Python logic lives in `web/`. Open `web/index.html`
directly in a browser or deploy the folder to any static host (for example, Netlify). The page
accepts the same configuration JSON, renders a colour-coded weekly timeline, lists the generated
events, and allows downloading the result as JSON.

To preview locally without an external host:

```
cd web
python -m http.server 8000
```

Then browse to <http://localhost:8000/>.
