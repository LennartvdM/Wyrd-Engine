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
let importProbeComplete = false;
let currentSysPathSnapshot = null;
let repoInitializationPromise = null;

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
const DEFAULT_PYTHON_SOURCE_FILES = [
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

let pythonSourceFilesPromise = null;

function post(message) {
  self.postMessage(message);
}

function resolveRepoUrl(path) {
  return new URL(`../${path}`, self.location).toString();
}

async function loadPythonSourceFiles() {
  if (!pythonSourceFilesPromise) {
    pythonSourceFilesPromise = (async () => {
      try {
        const response = await fetch(resolveRepoUrl('PY_MANIFEST'));
        if (!response.ok) {
          throw new Error(`Failed to fetch PY_MANIFEST: ${response.status}`);
        }
        const text = await response.text();
        const entries = text
          .split(/\r?\n/g)
          .map((line) => line.trim())
          .filter((line) => line && !line.startsWith('#'));
        if (entries.length > 0) {
          return entries;
        }
      } catch (error) {
        console.warn('Falling back to default PY manifest', error);
      }
      return DEFAULT_PYTHON_SOURCE_FILES;
    })();
  }

  return pythonSourceFilesPromise;
}

async function mirrorRepoFiles(instance) {
  if (repoFilesMirrored) {
    return;
  }

  const manifest = await loadPythonSourceFiles();
  const failures = [];
  const successes = [];

  try {
    instance.FS.mkdir('/repo');
  } catch (error) {
    if (!/exists/i.test(String(error?.message || ''))) {
      throw {
        message: 'Failed to prepare /repo directory',
        stage: 'mirror',
        type: 'MirrorFailed',
        error: error instanceof Error ? error.message : String(error),
      };
    }
  }

  for (const path of manifest) {
    let status;
    try {
      const response = await fetch(resolveRepoUrl(path));
      status = response?.status;
      if (!response.ok) {
        const statusText = response.statusText ? ` ${response.statusText}` : '';
        throw new Error(`HTTP ${response.status}${statusText}`.trim());
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

      const repoTargetPath = `/repo/${path}`;
      const repoDirectory = repoTargetPath.includes('/')
        ? repoTargetPath.slice(0, repoTargetPath.lastIndexOf('/'))
        : '';
      if (repoDirectory) {
        try {
          instance.FS.mkdirTree(repoDirectory);
        } catch (error) {
          if (!/exists/i.test(String(error?.message || ''))) {
            throw error;
          }
        }
      }

      instance.FS.writeFile(repoTargetPath, source);
      successes.push({ path, ok: true, size: source.length });
    } catch (error) {
      const message =
        error instanceof Error
          ? error.message
          : error && typeof error === 'object' && 'message' in error
          ? String(error.message)
          : String(error);
      const failure = { path, ok: false, error: message };
      const inferredStatus =
        typeof status === 'number'
          ? status
          : typeof error?.status === 'number'
          ? error.status
          : undefined;
      if (typeof inferredStatus === 'number' && Number.isFinite(inferredStatus)) {
        failure.status = inferredStatus;
      }
      failures.push(failure);
    }
  }

  if (failures.length > 0) {
    throw {
      message: 'Failed to mirror repository files',
      stage: 'mirror',
      type: 'MirrorFailed',
      failures,
      okCount: successes.length,
      failCount: failures.length,
      sysPath: Array.isArray(currentSysPathSnapshot)
        ? [...currentSysPathSnapshot]
        : currentSysPathSnapshot,
    };
  }

  repoFilesMirrored = true;
}

async function initializeRepo(instance) {
  if (repoInitializationPromise) {
    return repoInitializationPromise;
  }

  repoInitializationPromise = (async () => {
    let result;
    try {
      result = await instance.runPythonAsync(`
import sys, os, json
REPO = "/repo"
if REPO not in sys.path:
    sys.path.insert(0, REPO)
os.environ["WYRD_REPO_READY"] = "1"
_guard_payload = {"sys_path": list(sys.path)}
print(_guard_payload)
json.dumps(_guard_payload)
      `);
    } catch (error) {
      throw {
        message: 'Failed to execute repository initialization guard',
        stage: 'repo-init',
        type: 'RepoInitFailed',
        error: error instanceof Error ? error.message : String(error),
      };
    }

    let parsed;
    try {
      parsed = result ? JSON.parse(result) : null;
    } catch (error) {
      throw {
        message: 'Failed to parse repository guard response',
        stage: 'repo-init',
        type: 'RepoInitFailed',
        error: error instanceof Error ? error.message : String(error),
        raw: result,
      };
    }

    if (!parsed || !Array.isArray(parsed.sys_path)) {
      throw {
        message: 'Repository guard returned invalid payload',
        stage: 'repo-init',
        type: 'RepoInitFailed',
        raw: parsed,
      };
    }

    currentSysPathSnapshot = [...parsed.sys_path];
    return currentSysPathSnapshot;
  })();

  try {
    return await repoInitializationPromise;
  } catch (error) {
    repoInitializationPromise = null;
    throw error;
  }
}

async function probeImports(instance) {
  if (importProbeComplete) {
    return;
  }

  const result = await instance.runPythonAsync(`
import importlib, json
required = [
    "engines.web_adapter",
    "engines.engine_mk1",
    "engines.engine_mk2",
    "modules.validation",
    "modules.unique_events",
    "modules.friction_model",
    "modules.calendar_provider",
    "rigs.simple_rig",
    "rigs.workforce_rig",
]
missing = [m for m in required if importlib.util.find_spec(m) is None]
print(json.dumps({"missing": missing}))
json.dumps({"missing": missing})
  `);

  let parsed;
  try {
    parsed = typeof result === 'string' ? JSON.parse(result) : {};
  } catch (error) {
    throw {
      message: 'Failed to parse import probe response',
      stage: 'import-probe',
      type: 'ProbeFailed',
      hint: 'Check PY_MANIFEST',
      error: error instanceof Error ? error.message : String(error),
    };
  }

  const { missing = [] } = parsed || {};
  if (Array.isArray(missing) && missing.length > 0) {
    throw {
      message: `Missing Python modules: ${missing.join(', ')}`,
      stage: 'import-probe',
      type: 'MissingModules',
      missing,
      hint: 'Check PY_MANIFEST',
    };
  }

  importProbeComplete = true;
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
      await initializeRepo(instance);
      await probeImports(instance);
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
    importProbeComplete = false;
    repoInitializationPromise = null;
    currentSysPathSnapshot = null;
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
      const errorMessage =
        error instanceof Error
          ? error.message
          : error && typeof error === 'object' && 'message' in error
          ? String(error.message)
          : String(error);
      const payload = {
        ok: false,
        error: errorMessage,
        trace: error instanceof Error ? error.stack || '' : error?.stack || '',
      };
      if (error && typeof error === 'object') {
        if ('stage' in error) {
          payload.stage = error.stage;
        }
        if ('type' in error) {
          payload.type = error.type;
        }
        if ('missing' in error) {
          payload.missing = error.missing;
        }
        if ('hint' in error) {
          payload.hint = error.hint;
        }
      }
      if (Array.isArray(currentSysPathSnapshot)) {
        payload.sysPath = [...currentSysPathSnapshot];
      } else if (currentSysPathSnapshot) {
        payload.sysPath = currentSysPathSnapshot;
      }
      respond(payload);
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

      try {
        await instance.runPythonAsync(
          "import engines.web_adapter as ew\nprint('EW_OK')"
        );
        await instance.runPythonAsync(
          `from engines.web_adapter import ${dispatchName} as _entry\nprint('ENTRY_OK')`
        );
      } catch (error) {
        throw {
          message: 'Failed to import engines.web_adapter entrypoint',
          stage: 'run',
          type: 'EntrypointImportFailed',
          error: error instanceof Error ? error.message : String(error),
          cause: error,
        };
      }

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
      const errorMessage =
        error instanceof Error
          ? error.message
          : error && typeof error === 'object' && 'message' in error
          ? String(error.message)
          : String(error);
      const payload = {
        ok: false,
        error: errorMessage === '__timeout__' ? 'timeout' : errorMessage,
        trace:
          error instanceof Error && error.message === '__timeout__'
            ? ''
            : error instanceof Error
            ? error.stack || ''
            : error?.stack || '',
        stdout: stdoutParts.join(''),
        stderr: stderrParts.join(''),
      };
      if (error && typeof error === 'object') {
        if ('stage' in error) {
          payload.stage = error.stage;
        }
        if ('type' in error) {
          payload.type = error.type;
        }
        if ('missing' in error) {
          payload.missing = error.missing;
        }
        if ('hint' in error) {
          payload.hint = error.hint;
        }
      }
      if (Array.isArray(currentSysPathSnapshot)) {
        payload.sysPath = [...currentSysPathSnapshot];
      } else if (currentSysPathSnapshot) {
        payload.sysPath = currentSysPathSnapshot;
      }
      respond(payload);
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
