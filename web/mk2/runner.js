// Runs the flock package in the browser through Pyodide.
//
// The page posts {id, fn, args} and gets back {id, ok, value} or {id, ok: false, error}.
// `fn` is the name of a function in bridge.py.

// Where the Pyodide runtime is served from. Defaults to the CDN; override with
// ?pyodide=<base-url> on the page to point at a self-hosted copy.
const DEFAULT_PYODIDE = 'https://cdn.jsdelivr.net/pyodide/v0.24.1/full/';
const override = new URL(self.location.href).searchParams.get('pyodide');
const PYODIDE = override ? (override.endsWith('/') ? override : `${override}/`) : DEFAULT_PYODIDE;

let pyodide = null;
let ready = null;

function progress(stage, detail) {
  self.postMessage({ type: 'progress', stage, detail });
}

async function fetchText(url) {
  const response = await fetch(url, { cache: 'no-cache' });
  if (!response.ok) {
    throw new Error(`${response.status} ${response.statusText} for ${url}`);
  }
  return response.text();
}

// The build step copies the repo's Python next to the page and lists it in
// py/manifest.json. Only the flock package is needed here.
async function loadSources(instance) {
  // Frozen version: its Python lives beside this file, listed here rather than in the shared
  // build manifest, so this copy keeps working unchanged as the live package moves on.
  const files = ["__init__.py", "agent_api.py", "clock.py", "commitments.py", "free_time.py", "people.py", "report.py", "seeds.py", "sleep_and_meals.py", "world.py"];
  progress('sources', `${files.length} files`);
  const sources = await Promise.all(
    files.map(async (path) => ({ path, text: await fetchText(new URL('flock/' + path, self.location.href)) }))
  );
  instance.FS.mkdirTree('/flock_app/flock');
  for (const { path, text } of sources) {
    instance.FS.writeFile(`/flock_app/flock/${path}`, text);
  }
  instance.FS.writeFile('/flock_app/bridge.py', await fetchText(new URL('bridge.py', self.location.href)));
  instance.runPython(`
import sys
if "/flock_app" not in sys.path:
    sys.path.insert(0, "/flock_app")
import bridge
`);
  return { commit: 'mk2' };
}

async function boot() {
  if (pyodide) return pyodide;
  if (!ready) {
    ready = (async () => {
      progress('pyodide', 'loading runtime');
      const loader = await import(`${PYODIDE}pyodide.mjs`);
      const instance = await loader.loadPyodide({ indexURL: PYODIDE });
      progress('pyodide', 'runtime ready');
      const manifest = await loadSources(instance);
      pyodide = instance;
      progress('ready', manifest.commit ? manifest.commit.slice(0, 7) : 'ready');
      return instance;
    })().catch((error) => {
      ready = null;
      throw error;
    });
  }
  return ready;
}

self.onmessage = async (event) => {
  const { id, fn, args } = event.data || {};
  try {
    const instance = await boot();
    // Arguments go over as JSON so nothing is shared between the two runtimes.
    instance.globals.set('_call_args', JSON.stringify(args || []));
    const result = instance.runPython(`
import json
_a = json.loads(_call_args)
json.dumps(getattr(bridge, ${JSON.stringify(fn)})(*_a), allow_nan=False)
`);
    self.postMessage({ id, ok: true, value: JSON.parse(result) });
  } catch (error) {
    self.postMessage({ id, ok: false, error: String(error && error.message ? error.message : error) });
  }
};
