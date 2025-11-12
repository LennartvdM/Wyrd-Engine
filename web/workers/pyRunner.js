const ALLOWED_FUNCTIONS = new Set(['mk1_run', 'mk2_run_calendar', 'mk2_run_workforce']);
const FN_DISPATCH = {
  mk1_run: 'mk1_run_web',
  mk2_run_calendar: 'mk2_run_calendar_web',
  mk2_run_workforce: 'mk2_run_workforce_web',
};

const RUN_TIMEOUT_MS = 30_000;
const DEBUG = typeof self !== 'undefined' && Boolean(self.WYRD_DEBUG);

let pyodide = null;
let pyodideReadyPromise = null;
let repoFilesMirrored = false;
let runInFlight = false;
let importProbeComplete = false;
let currentSysPathSnapshot = null;
let repoInitializationPromise = null;
let lastManifestSize = null;
let lastMirrorReport = null;

function uniqueManifestEntries(entries) {
  const seen = new Set();
  const deduped = [];
  for (const entry of entries || []) {
    if (!seen.has(entry)) {
      seen.add(entry);
      deduped.push(entry);
    }
  }
  return deduped;
}

function toErrorMessage(error) {
  if (!error) {
    return '';
  }
  if (error instanceof Error) {
    return error.message;
  }
  if (typeof error === 'string') {
    return error;
  }
  if (typeof error === 'object' && 'message' in error) {
    return String(error.message);
  }
  return String(error);
}

function createStageError(stage, type, message, error, extra = {}) {
  const { details, ...rest } = extra || {};
  const payload = { stage, type, message, ...rest };
  let detailPayload =
    details && typeof details === 'object' && !Array.isArray(details) ? { ...details } : undefined;

  if (error) {
    const causeMessage = toErrorMessage(error);
    if (causeMessage) {
      if (!detailPayload) {
        detailPayload = {};
      }
      if (typeof detailPayload.cause === 'undefined') {
        detailPayload.cause = causeMessage;
      }
    }
    if (error instanceof Error && error.stack) {
      if (!detailPayload) {
        detailPayload = {};
      }
      if (typeof detailPayload.stack === 'undefined') {
        detailPayload.stack = error.stack;
      }
    }
  }

  if (detailPayload) {
    payload.details = detailPayload;
  }

  return payload;
}

function getCurrentSysPathForPayload() {
  if (Array.isArray(currentSysPathSnapshot)) {
    return [...currentSysPathSnapshot];
  }
  if (currentSysPathSnapshot) {
    return currentSysPathSnapshot;
  }
  return undefined;
}

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
const DEFAULT_PYTHON_SOURCE_FILES = uniqueManifestEntries([
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
]);

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
          return uniqueManifestEntries(entries);
        }
      } catch (error) {
        if (DEBUG && typeof console !== 'undefined' && typeof console.warn === 'function') {
          console.warn('Falling back to default PY manifest', error);
        }
      }
      return [...DEFAULT_PYTHON_SOURCE_FILES];
    })();
  }

  return pythonSourceFilesPromise;
}

async function mirrorRepoFiles(instance) {
  if (repoFilesMirrored) {
    return lastMirrorReport;
  }

  const manifest = await loadPythonSourceFiles();
  const manifestEntries = uniqueManifestEntries(manifest);
  lastManifestSize = manifestEntries.length;

  try {
    instance.FS.mkdirTree('/repo');
  } catch (error) {
    throw createStageError(
      'mirror',
      'MirrorSetupFailed',
      'Failed to prepare /repo directory',
      error,
      {
        manifestSize: lastManifestSize,
        sysPath: getCurrentSysPathForPayload(),
      }
    );
  }

  const reports = [];
  const failures = [];
  let okCount = 0;

  for (const path of manifestEntries) {
    const url = resolveRepoUrl(path);
    const repoTargetPath = `/repo/${path}`;
    let status;

    try {
      const response = await fetch(url);
      status = typeof response?.status === 'number' ? response.status : undefined;
      if (!response?.ok) {
        const statusText = response?.statusText ? ` ${response.statusText}` : '';
        throw new Error(`HTTP ${response?.status ?? 'unknown'}${statusText}`.trim());
      }

      const source = await response.text();
      const directory = path.includes('/') ? path.slice(0, path.lastIndexOf('/')) : '';
      if (directory) {
        try {
          instance.FS.mkdirTree(directory);
        } catch (error) {
          if (!/exists/i.test(String(error?.message || ''))) {
            throw error;
          }
        }
      }

      instance.FS.writeFile(path, source);

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
      reports.push({
        path,
        repoPath: repoTargetPath,
        url,
        status,
        ok: true,
        size: typeof source === 'string' ? source.length : 0,
      });
      okCount += 1;
    } catch (error) {
      const inferredStatus =
        typeof status === 'number'
          ? status
          : typeof error?.status === 'number'
          ? error.status
          : undefined;
      const failureEntry = {
        path,
        repoPath: repoTargetPath,
        url,
        status: typeof inferredStatus === 'number' ? inferredStatus : undefined,
        ok: false,
        size: 0,
        error: toErrorMessage(error) || 'Unknown mirror failure',
      };
      reports.push({ ...failureEntry });
      failures.push(failureEntry);
    }
  }

  const failCount = failures.length;
  lastMirrorReport = {
    manifestSize: lastManifestSize,
    okCount,
    failCount,
    files: reports,
  };

  if (failCount > 0) {
    const summary =
      failCount === 1
        ? `Repository mirror failed for ${failures[0].path}`
        : `Repository mirror failed for ${failCount} files`;
    const errorPayload = createStageError('mirror', 'MirrorFailed', summary, null, {
      manifestSize: lastManifestSize,
      okCount,
      failCount,
      failures,
      report: reports,
      sysPath: getCurrentSysPathForPayload(),
    });
    throw errorPayload;
  }

  repoFilesMirrored = true;
  return lastMirrorReport;
}

async function initializeRepo(instance) {
  if (repoInitializationPromise) {
    return repoInitializationPromise;
  }

  repoInitializationPromise = (async () => {
    let result;
    try {
      result = await instance.runPythonAsync(`
import json, os, sys

REPO = "/repo"
if REPO not in sys.path:
    sys.path.insert(0, REPO)

os.environ["WYRD_REPO_READY"] = "1"

json.dumps({"sys_path": list(sys.path)})
      `);
    } catch (error) {
      throw createStageError('mirror', 'RepoInitFailed', 'Failed to initialize Python search path', error, {
        manifestSize: lastManifestSize,
        sysPath: getCurrentSysPathForPayload(),
      });
    }

    let parsed;
    try {
      parsed = result ? JSON.parse(result) : null;
    } catch (error) {
      throw createStageError('mirror', 'RepoInitFailed', 'Failed to parse repository guard response', error, {
        manifestSize: lastManifestSize,
        sysPath: getCurrentSysPathForPayload(),
        details: { raw: result },
      });
    }

    if (!parsed || !Array.isArray(parsed.sys_path)) {
      throw createStageError('mirror', 'RepoInitFailed', 'Repository guard returned invalid payload', null, {
        manifestSize: lastManifestSize,
        sysPath: getCurrentSysPathForPayload(),
        details: { raw: parsed },
      });
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

  const requiredModules = [
    'engines.web_adapter',
    'engines.engine_mk1',
    'engines.engine_mk2',
    'engines.base',
    'modules.validation',
    'modules.unique_events',
    'modules.friction_model',
    'modules.calendar_provider',
    'rigs.simple_rig',
    'rigs.workforce_rig',
    'rigs.calendar_rig',
    'archetypes',
    'models',
    'unique_days',
    'yearly_budget',
  ];

  let result;
  try {
    result = await instance.runPythonAsync(`
import importlib, json

required = ${JSON.stringify(requiredModules)}
missing = sorted(name for name in required if importlib.util.find_spec(name) is None)

json.dumps({"missing": missing})
    `);
  } catch (error) {
    throw createStageError('import-probe', 'ProbeFailed', 'Failed to execute import probe', error, {
      manifestSize: lastManifestSize,
      sysPath: getCurrentSysPathForPayload(),
      hint: 'Update PY_MANIFEST',
    });
  }

  let parsed;
  try {
    parsed = typeof result === 'string' && result ? JSON.parse(result) : {};
  } catch (error) {
    throw createStageError('import-probe', 'ProbeFailed', 'Failed to parse import probe response', error, {
      manifestSize: lastManifestSize,
      sysPath: getCurrentSysPathForPayload(),
      hint: 'Update PY_MANIFEST',
      details: { raw: result },
    });
  }

  const missing = Array.isArray(parsed?.missing) ? parsed.missing : [];
  if (missing.length > 0) {
    const payload = createStageError(
      'import-probe',
      'MissingModules',
      `Missing Python modules after mirror: ${missing.join(', ')}`,
      null,
      {
        missing,
        hint: 'Update PY_MANIFEST',
        manifestSize: lastManifestSize,
        sysPath: getCurrentSysPathForPayload(),
      }
    );
    throw payload;
  }

  importProbeComplete = true;
}

async function ensurePyodide() {
  if (pyodide) {
    return pyodide;
  }

  if (!pyodideReadyPromise) {
    pyodideReadyPromise = (async () => {
      let instance;
      try {
        let loader;
        try {
          loader = await import('https://cdn.jsdelivr.net/pyodide/v0.24.1/full/pyodide.mjs');
        } catch (error) {
          throw createStageError('pyodide-init', 'PyodideModuleLoadFailed', 'Failed to load Pyodide module', error);
        }

        try {
          instance = await loader.loadPyodide({
            indexURL: 'https://cdn.jsdelivr.net/pyodide/v0.24.1/full/',
          });
        } catch (error) {
          throw createStageError('pyodide-init', 'PyodideBootstrapFailed', 'Failed to initialize Pyodide runtime', error);
        }

        await mirrorRepoFiles(instance);
        await initializeRepo(instance);
        await probeImports(instance);
        pyodide = instance;
        return instance;
      } catch (error) {
        if (error && typeof error === 'object' && 'stage' in error) {
          throw error;
        }
        throw createStageError('pyodide-init', 'PyodideInitFailed', 'Pyodide initialization failed', error);
      }
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
    lastMirrorReport = null;
    lastManifestSize = null;
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
        if ('manifestSize' in error) {
          payload.manifestSize = error.manifestSize;
        }
        if ('okCount' in error) {
          payload.okCount = error.okCount;
        }
        if ('failCount' in error) {
          payload.failCount = error.failCount;
        }
        if ('failures' in error) {
          payload.failures = error.failures;
        }
        if ('report' in error) {
          payload.report = error.report;
        }
        if ('details' in error) {
          payload.details = error.details;
        }
        if ('sysPath' in error) {
          payload.sysPath = Array.isArray(error.sysPath)
            ? [...error.sysPath]
            : error.sysPath;
        }
      }
      if (typeof payload.sysPath === 'undefined') {
        const sysPathSnapshot = getCurrentSysPathForPayload();
        if (typeof sysPathSnapshot !== 'undefined') {
          payload.sysPath = Array.isArray(sysPathSnapshot)
            ? [...sysPathSnapshot]
            : sysPathSnapshot;
        }
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
        throw createStageError('run', 'EntrypointImportFailed', 'Failed to import engines.web_adapter entrypoint', error, {
          manifestSize: lastManifestSize,
          sysPath: getCurrentSysPathForPayload(),
        });
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
        if ('manifestSize' in error) {
          payload.manifestSize = error.manifestSize;
        }
        if ('okCount' in error) {
          payload.okCount = error.okCount;
        }
        if ('failCount' in error) {
          payload.failCount = error.failCount;
        }
        if ('failures' in error) {
          payload.failures = error.failures;
        }
        if ('report' in error) {
          payload.report = error.report;
        }
        if ('details' in error) {
          payload.details = error.details;
        }
        if ('sysPath' in error) {
          payload.sysPath = Array.isArray(error.sysPath)
            ? [...error.sysPath]
            : error.sysPath;
        }
      }
      if (typeof payload.sysPath === 'undefined') {
        const sysPathSnapshot = getCurrentSysPathForPayload();
        if (typeof sysPathSnapshot !== 'undefined') {
          payload.sysPath = Array.isArray(sysPathSnapshot)
            ? [...sysPathSnapshot]
            : sysPathSnapshot;
        }
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
