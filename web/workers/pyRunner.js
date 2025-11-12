import { loadPyodide } from 'https://cdn.jsdelivr.net/pyodide/v0.24.1/full/pyodide.mjs';

const ALLOWED_FUNCTIONS = new Set(['mk1_run', 'mk2_run_calendar', 'mk2_run_workforce']);

let pyodide = null;
let repoFilesMirrored = false;

function mockCalendarResult(args) {
  return {
    schema_version: 'web_v1_calendar',
    week_start: args?.week_start || '',
    events: [
      { date: args?.week_start || '', start: '09:00', end: '11:00', label: 'Work', activity: 'work' },
      { date: args?.week_start || '', start: '11:00', end: '12:00', label: 'Break', activity: 'misc' },
    ],
    issues: [],
    metadata: { engine: 'mock', variant: args?.variant || '', rig: args?.rig || '' },
  };
}
const PYTHON_SOURCE_FILES = [
  'archetypes.py',
  'calendar_gen_v2.py',
  'calendar_layers.py',
  'engines/__init__.py',
  'engines/base.py',
  'engines/engine_mk1.py',
  'engines/engine_mk2.py',
  'models.py',
  'modules/__init__.py',
  'modules/calendar_provider.py',
  'modules/friction_model.py',
  'modules/unique_events.py',
  'modules/validation.py',
  'rigs/__init__.py',
  'rigs/calendar_rig.py',
  'rigs/simple_rig.py',
  'rigs/workforce_rig.py',
  'unique_days.py',
  'yearly_budget.py',
];

function post(message) {
  self.postMessage(message);
}

function resolveRepoUrl(path) {
  return new URL(`../${path}`, self.location).toString();
}

async function mirrorRepoFiles(instance) {
  if (repoFilesMirrored) {
    return;
  }

  const tasks = PYTHON_SOURCE_FILES.map(async (path) => {
    const response = await fetch(resolveRepoUrl(path));
    if (!response.ok) {
      throw new Error(`Failed to fetch ${path}: ${response.status} ${response.statusText}`);
    }
    const source = await response.text();
    const directory = path.includes('/') ? path.slice(0, path.lastIndexOf('/')) : '';
    if (directory) {
      try {
        instance.FS.mkdirTree(directory);
      } catch (error) {
        // Ignore EEXIST style errors from mkdirTree.
        if (!/exists/i.test(String(error?.message || ''))) {
          throw error;
        }
      }
    }
    instance.FS.writeFile(path, source);
  });

  await Promise.all(tasks);
  repoFilesMirrored = true;
}

async function ensurePyodide() {
  if (pyodide) {
    return pyodide;
  }

  try {
    pyodide = await loadPyodide({ indexURL: 'pyodide/' });
    await mirrorRepoFiles(pyodide);
    return pyodide;
  } catch (error) {
    pyodide = null;
    repoFilesMirrored = false;
    throw error;
  }
}

async function tryImportEngines() {
  if (!pyodide) {
    return false;
  }

  try {
    await pyodide.runPythonAsync(`
import json
import engines.engine_mk1 as mk1
import engines.engine_mk2 as mk2
    `);
    return true;
  } catch (error) {
    return false;
  }
}

self.onmessage = async (event) => {
  const message = event?.data || {};
  const { id, type } = message;
  if (typeof id === 'undefined') {
    return;
  }

  const respond = (payload) => {
    post({ id, ...payload });
  };

  if (type === 'load') {
    try {
      await ensurePyodide();
      respond({ ok: true, ready: true });
    } catch (error) {
      respond({
        ok: false,
        error: error instanceof Error ? error.message : String(error),
        trace: error?.stack || '',
      });
    }
    return;
  }

  if (type === 'run') {
    const { fn, args = {} } = message;
    if (fn === 'mock_run') {
      respond({
        ok: true,
        result: mockCalendarResult(args),
        fallback: true,
        stdout: '',
        stderr: '',
      });
      return;
    }
    if (!ALLOWED_FUNCTIONS.has(fn)) {
      respond({ ok: false, error: `Unknown worker function: ${String(fn)}` });
      return;
    }

    let stdoutParts = [];
    let stderrParts = [];
    let previousStdout;
    let previousStderr;

    try {
      const instance = await ensurePyodide();
      const importsOK = await tryImportEngines();

      if (!importsOK) {
        respond({
          ok: true,
          result: mockCalendarResult(args),
          fallback: true,
          stdout: stdoutParts.join(''),
          stderr: stderrParts.join(''),
        });
        return;
      }

      stdoutParts = [];
      stderrParts = [];
      previousStdout = instance.setStdout({
        batched(text) {
          if (typeof text === 'string' && text.length > 0) {
            stdoutParts.push(text);
          }
        },
      });
      previousStderr = instance.setStderr({
        batched(text) {
          if (typeof text === 'string' && text.length > 0) {
            stderrParts.push(text);
          }
        },
      });

      const pyCode = `
import json
import engines.engine_mk1 as mk1
import engines.engine_mk2 as mk2

args = json.loads("""${JSON.stringify(args)}""")

if "${fn}" == "mk1_run":
    out = mk1.generate_schedule(args["archetype"], args["week_start"], args["seed"])
elif "${fn}" == "mk2_run_calendar":
    out = mk2.generate_calendar(args["archetype"], args["week_start"], args["seed"])
elif "${fn}" == "mk2_run_workforce":
    out = mk2.generate_workforce(args["archetype"], args["week_start"], args["seed"], args.get("yearly_budget"))
else:
    raise ValueError("Unknown function")

json.dumps(out)
      `;
      const resultJSON = await instance.runPythonAsync(pyCode);
      const parsed = resultJSON ? JSON.parse(resultJSON) : null;

      respond({
        ok: true,
        result: parsed,
        stdout: stdoutParts.join(''),
        stderr: stderrParts.join(''),
      });
    } catch (error) {
      respond({
        ok: false,
        error: error instanceof Error ? error.message : String(error),
        trace: error?.stack || '',
        stdout: stdoutParts.join(''),
        stderr: stderrParts.join(''),
      });
    } finally {
      if (pyodide) {
        if (typeof previousStdout !== 'undefined') {
          pyodide.setStdout(previousStdout);
        }
        if (typeof previousStderr !== 'undefined') {
          pyodide.setStderr(previousStderr);
        }
      }
    }
    return;
  }

  respond({ ok: false, error: `Unknown message type: ${String(type)}` });
};
