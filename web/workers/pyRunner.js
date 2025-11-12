import { loadPyodide } from 'https://cdn.jsdelivr.net/pyodide/v0.24.1/full/pyodide.mjs';

const PYODIDE_INDEX_URL = 'https://cdn.jsdelivr.net/pyodide/v0.24.1/full/';
const ALLOWED_FUNCTIONS = new Set(['mk1_run', 'mk2_run_calendar', 'mk2_run_workforce']);
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

let pyodideInstance;
let pyodideReadyPromise;
let repoFilesMirrored = false;

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
  if (!pyodideReadyPromise) {
    pyodideReadyPromise = loadPyodide({ indexURL: PYODIDE_INDEX_URL })
      .then(async (instance) => {
        await mirrorRepoFiles(instance);
        pyodideInstance = instance;
        return instance;
      })
      .catch((error) => {
        pyodideInstance = undefined;
        repoFilesMirrored = false;
        pyodideReadyPromise = undefined;
        throw error;
      });
  }

  return pyodideReadyPromise;
}

function buildRunnerCode(fn, args) {
  const normalized = {
    archetype: args?.archetype ?? null,
    week_start: args?.week_start ?? null,
    seed: args?.seed ?? null,
    yearly_budget: args?.yearly_budget ?? null,
  };
  const argsJson = JSON.stringify(normalized);
  const fnLiteral = String(fn ?? '');
  const escapedArgsJson = argsJson
    .replace(/\\/g, '\\\\')
    .replace(/'/g, "\\'");
  const escapedFn = fnLiteral.replace(/\\/g, '\\\\').replace(/'/g, "\\'");
  const template = `\
import json
from datetime import datetime
from engines.engine_mk1 import mk1_run as _mk1_run
from engines.engine_mk2 import mk2_run_calendar as _mk2_cal
from engines.engine_mk2 import mk2_run_workforce as _mk2_wf

ARGS_JSON = '__ARGS_JSON__'
FN = '__FN_NAME__'

ARGS = json.loads(ARGS_JSON)

def _coerce(value):
    return value if value is not None else None

if FN == "mk1_run":
    res = _mk1_run(ARGS["archetype"], ARGS["week_start"], ARGS["seed"])
elif FN == "mk2_run_calendar":
    res = _mk2_cal(ARGS["archetype"], ARGS["week_start"], ARGS["seed"])
elif FN == "mk2_run_workforce":
    res = _mk2_wf(
        ARGS["archetype"],
        ARGS["week_start"],
        ARGS["seed"],
        _coerce(ARGS.get("yearly_budget")),
    )
else:
    raise ValueError(f"Unknown fn: {FN}")

print("")
__out = json.dumps(res)
__out
`;

  return template
    .replace('__ARGS_JSON__', escapedArgsJson)
    .replace('__FN_NAME__', escapedFn);
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
      const code = buildRunnerCode(fn, args);

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

      const raw = await instance.runPythonAsync(code);
      const output = typeof raw === 'string' ? raw : String(raw ?? '');
      const parsed = output ? JSON.parse(output) : null;

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
      if (pyodideInstance) {
        if (typeof previousStdout !== 'undefined') {
          pyodideInstance.setStdout(previousStdout);
        }
        if (typeof previousStderr !== 'undefined') {
          pyodideInstance.setStderr(previousStderr);
        }
      }
    }
    return;
  }

  respond({ ok: false, error: `Unknown message type: ${String(type)}` });
};
