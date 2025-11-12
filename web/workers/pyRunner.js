const ALLOWED_FUNCTIONS = new Set(['mk1_run', 'mk2_run_calendar', 'mk2_run_workforce']);
const FN_DISPATCH = {
  mk1_run: 'mk1_run_web',
  mk2_run_calendar: 'mk2_run_calendar_web',
  mk2_run_workforce: 'mk2_run_workforce_web',
};

const RUN_TIMEOUT_MS = 30_000;

let pyodide = null;
let pyodideReadyPromise = null;
let repoFilesMirrored = false;
let runInFlight = false;

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
  'engines/web_adapter.py',
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

  if (!pyodideReadyPromise) {
    pyodideReadyPromise = (async () => {
      const { loadPyodide } = await import(
        'https://cdn.jsdelivr.net/pyodide/v0.24.1/full/pyodide.mjs'
      );
      const instance = await loadPyodide({
        indexURL: 'https://cdn.jsdelivr.net/pyodide/v0.24.1/full/',
      });
      await mirrorRepoFiles(instance);
      pyodide = instance;
      return instance;
    })();
  }

  try {
    return await pyodideReadyPromise;
  } catch (error) {
    pyodideReadyPromise = null;
    pyodide = null;
    repoFilesMirrored = false;
    throw error;
  }
}

async function tryImportAdapter() {
  if (!pyodide) {
    return false;
  }

  try {
    await pyodide.runPythonAsync(`import engines.web_adapter`);
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

    if (runInFlight) {
      respond({ ok: false, error: 'Runtime busy' });
      return;
    }

    runInFlight = true;

    let stdoutParts = [];
    let stderrParts = [];
    let previousStdout;
    let previousStderr;
    let timeoutId;
    let runPromise;

    try {
      const instance = await ensurePyodide();
      const importsOK = await tryImportAdapter();

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

      const dispatchName = FN_DISPATCH[fn];
      if (!dispatchName) {
        respond({ ok: false, error: `No adapter configured for ${String(fn)}` });
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

      const argsJSON = JSON.stringify(args || {});
      const pyCode = `
import json
from engines.web_adapter import mk1_run_web, mk2_run_calendar_web, mk2_run_workforce_web

ARGS_JSON = ${JSON.stringify(argsJSON)}
ARGS = json.loads(ARGS_JSON)

_dispatch = {
    "mk1_run": lambda: mk1_run_web(
        ARGS.get("archetype", ""),
        ARGS.get("week_start"),
        ARGS.get("seed"),
    ),
    "mk2_run_calendar": lambda: mk2_run_calendar_web(
        ARGS.get("archetype", ""),
        ARGS.get("week_start"),
        ARGS.get("seed"),
    ),
    "mk2_run_workforce": lambda: mk2_run_workforce_web(
        ARGS.get("archetype", ""),
        ARGS.get("week_start"),
        ARGS.get("seed"),
        ARGS.get("yearly_budget"),
    ),
}

res = _dispatch["${fn}"]()
print("")
__out = json.dumps(res)
__out
      `;

      runPromise = instance.runPythonAsync(pyCode);
      const timeoutPromise = new Promise((_, reject) => {
        timeoutId = setTimeout(() => {
          reject(new Error('__timeout__'));
        }, RUN_TIMEOUT_MS);
      });

      const resultJSON = await Promise.race([runPromise, timeoutPromise]);
      clearTimeout(timeoutId);
      await runPromise.catch(() => {});
      const parsed = resultJSON ? JSON.parse(resultJSON) : null;

      respond({
        ok: true,
        result: parsed,
        stdout: stdoutParts.join(''),
        stderr: stderrParts.join(''),
      });
    } catch (error) {
      if (timeoutId) {
        clearTimeout(timeoutId);
      }
      respond({
        ok: false,
        error:
          error instanceof Error && error.message === '__timeout__'
            ? 'timeout'
            : error instanceof Error
            ? error.message
            : String(error),
        trace: error instanceof Error && error.message === '__timeout__' ? '' : error?.stack || '',
        stdout: stdoutParts.join(''),
        stderr: stderrParts.join(''),
      });
    } finally {
      if (timeoutId) {
        clearTimeout(timeoutId);
      }
      if (runPromise && typeof runPromise.catch === 'function') {
        runPromise.catch(() => {});
      }
      if (pyodide) {
        if (typeof previousStdout !== 'undefined') {
          pyodide.setStdout(previousStdout);
        }
        if (typeof previousStderr !== 'undefined') {
          pyodide.setStderr(previousStderr);
        }
      }
      runInFlight = false;
    }
    return;
  }

  respond({ ok: false, error: `Unknown message type: ${String(type)}` });
};
