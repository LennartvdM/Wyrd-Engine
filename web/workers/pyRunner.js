const ALLOWED_FUNCTIONS = new Set(['mk1_run', 'mk2_run_calendar', 'mk2_run_workforce']);
const FN_DISPATCH = {
  mk1_run: 'mk1_run_web',
  mk2_run_calendar: 'mk2_run_calendar_web',
  mk2_run_workforce: 'mk2_run_workforce_web',
};

const RUN_TIMEOUT_MS = 30_000;

let pyodide = null;
let pyodideReadyPromise = null;
let lastRepoInitError = null;
let runInFlight = false;

self.__repoReady = false;

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
const PY_MANIFEST = [
  'engines/web_adapter.py',
  'engines/engine_mk1.py',
  'engines/engine_mk2.py',
];

function post(message) {
  self.postMessage(message);
}

function resolveRepoUrl(rel) {
  return new URL(`../../${rel}`, self.location.href).toString();
}

async function mirrorRepoFiles(manifest) {
  if (!pyodide) {
    throw new Error('mirror requires loaded pyodide');
  }

  try {
    pyodide.FS.mkdirTree('/repo');
  } catch (error) {
    if (!/exists/i.test(String(error?.message || ''))) {
      throw new Error(`mkdir fail: /repo ${String(error)}`);
    }
  }

  for (const rel of manifest) {
    const url = resolveRepoUrl(rel);
    let response;
    try {
      response = await fetch(url);
    } catch (error) {
      throw new Error(`fetch fail: ${url} ${String(error)}`);
    }
    if (!response.ok) {
      throw new Error(`fetch fail: ${url} ${response.status}`);
    }

    const targetPath = `/repo/${rel}`;
    const lastSlash = targetPath.lastIndexOf('/');
    const dir = lastSlash > 0 ? targetPath.slice(0, lastSlash) : '/repo';

    if (dir) {
      try {
        pyodide.FS.mkdirTree(dir);
      } catch (error) {
        if (!/exists/i.test(String(error?.message || ''))) {
          throw new Error(`mkdir fail: ${dir} ${String(error)}`);
        }
      }
    }

    const buffer = await response.arrayBuffer();
    try {
      pyodide.FS.writeFile(targetPath, new Uint8Array(buffer));
    } catch (error) {
      throw new Error(`write fail: ${targetPath} ${String(error)}`);
    }
  }

  const result = await pyodide.runPythonAsync(`

import sys, pathlib
p = pathlib.Path('/repo')
if str(p) not in sys.path: sys.path.insert(0, str(p))
for want in ${JSON.stringify(manifest)}:
    assert (p / want).exists(), f"missing after mirror: {want}"
'OK'
`);

  return result;
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
      pyodide = instance;
      return instance;
    })();
  }

  try {
    return await pyodideReadyPromise;
  } catch (error) {
    pyodideReadyPromise = null;
    pyodide = null;
    lastRepoInitError = null;
    self.__repoReady = false;
    throw error;
  }
}

async function initRepo() {
  if (self.__repoReady) {
    return true;
  }

  try {
    lastRepoInitError = null;
    await mirrorRepoFiles(PY_MANIFEST);
    self.__repoReady = true;
    return true;
  } catch (error) {
    lastRepoInitError = error instanceof Error ? error.message : String(error);
    self.__repoReady = false;
    post({ ok: false, stage: 'mirror', error: lastRepoInitError, hint: 'mirrorRepoFiles' });
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
    } catch (error) {
      respond({
        ok: false,
        stage: 'import',
        error: error instanceof Error ? error.message : String(error),
        hint: 'loadPyodide',
        trace: error?.stack || '',
      });
      return;
    }

    const repoReady = await initRepo();
    if (!repoReady) {
      respond({
        ok: false,
        stage: 'mirror',
        error: lastRepoInitError || 'mirror failed',
        hint: 'mirrorRepoFiles',
      });
      return;
    }

    respond({ ok: true, ready: true });
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
      respond({
        ok: false,
        stage: 'run',
        error: `Unknown worker function: ${String(fn)}`,
        hint: `fn:${String(fn)}`,
      });
      return;
    }

    if (runInFlight) {
      respond({ ok: false, stage: 'run', error: 'Runtime busy', hint: 'runInFlight' });
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
      let instance;
      try {
        instance = await ensurePyodide();
      } catch (error) {
        respond({
          ok: false,
          stage: 'import',
          error: error instanceof Error ? error.message : String(error),
          hint: 'loadPyodide',
        });
        return;
      }

      const repoReady = await initRepo();
      if (!repoReady) {
        respond({
          ok: false,
          stage: 'mirror',
          error: lastRepoInitError || 'mirror failed',
          hint: 'mirrorRepoFiles',
        });
        return;
      }

      try {
        await instance.runPythonAsync(`import engines.web_adapter`);
      } catch (error) {
        respond({
          ok: false,
          stage: 'import',
          error: error instanceof Error ? error.message : String(error),
          hint: 'engines.web_adapter',
        });
        return;
      }

      const dispatchName = FN_DISPATCH[fn];
      if (!dispatchName) {
        respond({
          ok: false,
          stage: 'run',
          error: `No adapter configured for ${String(fn)}`,
          hint: `dispatch:${String(fn)}`,
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
        stage: 'run',
        error:
          error instanceof Error && error.message === '__timeout__'
            ? 'timeout'
            : error instanceof Error
            ? error.message
            : String(error),
        trace: error instanceof Error && error.message === '__timeout__' ? '' : error?.stack || '',
        stdout: stdoutParts.join(''),
        stderr: stderrParts.join(''),
        hint: 'py.run',
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

  respond({
    ok: false,
    stage: 'run',
    error: `Unknown message type: ${String(type)}`,
    hint: `message:${String(type)}`,
  });
};
