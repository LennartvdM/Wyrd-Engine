# Web Interface

The static web interface mirrors the Python generators so designers can experiment without installing
Python. The bundle lives in [`web/`](../../web) and can be opened directly from disk or deployed to a
static host such as Netlify.

## Features
- Loads the same JSON configuration accepted by `calendar_gen.py` and `calendar_gen_v2.py`.
- Renders a colour-coded weekly timeline plus a tabular event list.
- Calculates summary totals and exposes them alongside validation warnings.
- Offers a "Download JSON" button so you can capture the generated schedule.
These behaviours track the workflow described in the usage guide. 【F:docs/usage.md†L39-L55】

## Local Preview
```bash
cd web
python -m http.server 8000
```
Open <http://localhost:8000/> in your browser. No build step is required; the interface relies on
plain HTML, CSS, and JavaScript bundled in the repository. 【F:docs/usage.md†L43-L55】

## Deployment Tips
- Commit the `web/` folder to any static hosting platform (Netlify, GitHub Pages, Vercel).
- Update the `netlify.toml` included in the repo if you need custom headers or redirects.
- When you release a new engine feature, regenerate example configs and link them from the wiki for
  quick access. 【F:netlify.toml†L1-L3】

## Roadmap Ideas
- Add an "Import yearly budget" option to mirror the MK2 CLI.
- Surface persona presets so you can toggle between office/parent/freelancer templates without JSON
  edits.
- Embed a shareable permalink that encodes the configuration in the URL.
Contributions are welcome—coordinate changes through issues or pull requests.
