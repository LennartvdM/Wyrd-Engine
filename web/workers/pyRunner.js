const ALLOWED_FUNCTIONS = new Set(['mk1_run', 'mk2_run_calendar', 'mk2_run_workforce']);
const FN_DISPATCH = {
  mk1_run: 'mk1_run_web',
  mk2_run_calendar: 'mk2_run_calendar_web',
  mk2_run_workforce: 'mk2_run_workforce_web',
};

const RUN_TIMEOUT_MS = 30_000;
const DEBUG = typeof self !== 'undefined' && Boolean(self.WYRD_DEBUG);

const textEncoder = new TextEncoder();
const textDecoder = new TextDecoder();

const RUNTIME_ENV = (() => {
  let hostname = '';
  try {
    if (typeof self !== 'undefined' && self.location && typeof self.location.hostname === 'string') {
      hostname = self.location.hostname;
    }
  } catch (error) {
    hostname = '';
  }

  let stage = 'prod';
  if (typeof self !== 'undefined' && typeof self.WYRD_STAGE === 'string') {
    stage = self.WYRD_STAGE;
  } else if (!hostname || hostname === 'localhost' || hostname.endsWith('.local')) {
    stage = 'dev';
  } else if (/^(127\.|0\.)/.test(hostname) || hostname === '[::1]') {
    stage = 'dev';
  } else if (hostname.includes('--')) {
    stage = 'preview';
  } else if (/\.netlify\.app$/i.test(hostname) && hostname.split('--').length > 1) {
    stage = 'preview';
  }

  let userAgent = '';
  try {
    if (typeof self !== 'undefined' && self.navigator && typeof self.navigator.userAgent === 'string') {
      userAgent = self.navigator.userAgent;
    }
  } catch (error) {
    userAgent = '';
  }

  return { stage, hostname, userAgent };
})();

const EMBEDDED_FALLBACK_FILES = Object.freeze({
  'archetypes.py': `"""Embedded fallback archetypes."""

ARCHETYPES = {
    "embedded": {"label": "Embedded Fallback"}
}
`,
  'calendar_gen_v2.py': `"""Embedded fallback calendar generator."""

def generate_calendar(*_args, **_kwargs):
    return {"events": [], "issues": []}
`,
  'calendar_layers.py': `"""Embedded fallback calendar layers."""

LAYERS = []
`,
  'engines/__init__.py': `"""Embedded fallback engines package."""

__all__ = ["base", "engine_mk1", "engine_mk2", "web_adapter"]
`,
  'engines/base.py': `"""Embedded fallback engine base."""

class ScheduleInput:
    def __init__(self, **kwargs):
        for key, value in kwargs.items():
            setattr(self, key, value)
`,
  'engines/engine_mk1.py': `"""Embedded fallback MK1 engine."""

class EngineMK1:
    def run(self, *_args, **_kwargs):
        return {"events": [], "issues": []}
`,
  'engines/engine_mk2.py': `"""Embedded fallback MK2 engine."""

class EngineMK2:
    def run(self, *_args, **_kwargs):
        return {"events": [], "issues": []}
`,
  'engines/web_adapter.py': `"""Embedded fallback web adapter."""

def _payload(archetype="", week_start="", rig=""):
    return {
        "schema_version": "web_v1_calendar",
        "week_start": week_start or "",
        "events": [
            {"date": week_start or "", "start": "09:00", "end": "11:00", "label": "Work", "activity": "work"},
            {"date": week_start or "", "start": "11:00", "end": "12:00", "label": "Break", "activity": "misc"},
        ],
        "issues": [],
        "metadata": {
            "engine": "embedded-fallback",
            "variant": rig or "",
            "rig": rig or "",
            "archetype": archetype or "",
        },
    }


def mk1_run_web(archetype, week_start=None, seed=None):
    return _payload(archetype, week_start, "mk1")


def mk2_run_calendar_web(archetype, week_start=None, seed=None):
    return _payload(archetype, week_start, "mk2")


def mk2_run_workforce_web(archetype, week_start=None, seed=None, yearly_budget=None):
    payload = _payload(archetype, week_start, "workforce")
    payload["metadata"]["yearly_budget"] = yearly_budget
    return payload
`,
  'models.py': `"""Embedded fallback models."""

class CalendarModel:
    def __init__(self, **kwargs):
        self.data = kwargs
`,
  'modules/__init__.py': `"""Embedded fallback modules package."""`,
  'modules/calendar_provider.py': `"""Embedded fallback calendar provider."""

def build_calendar(*_args, **_kwargs):
    return {"events": [], "issues": []}
`,
  'modules/friction_model.py': `"""Embedded fallback friction model."""

def calculate_friction(*_args, **_kwargs):
    return 0.0
`,
  'modules/unique_events.py': `"""Embedded fallback unique events."""

class UniqueDay:
    def __init__(self, label, date):
        self.label = label
        self.date = date
`,
  'modules/validation.py': `"""Embedded fallback validation module."""

def validate(*_args, **_kwargs):
    return {"issues": []}
`,
  'rigs/__init__.py': `"""Embedded fallback rigs package."""`,
  'rigs/calendar_rig.py': `"""Embedded fallback calendar rig."""

class CalendarRig:
    name = "embedded"
`,
  'rigs/simple_rig.py': `"""Embedded fallback simple rig."""

class SimpleRig:
    name = "embedded"
`,
  'rigs/workforce_rig.py': `"""Embedded fallback workforce rig."""

class WorkforceRig:
    name = "embedded"
`,
  'unique_days.py': `"""Embedded fallback unique days."""

def unique_days(*_args, **_kwargs):
    return []
`,
  'yearly_budget.py': `"""Embedded fallback yearly budget."""

class YearlyBudget:
    def __init__(self, total=0):
        self.total = total
`,
});

let pyodide = null;
let pyodideReadyPromise = null;
let repoFilesMirrored = false;
let runInFlight = false;
let importProbeComplete = false;
let currentSysPathSnapshot = null;
let repoInitializationPromise = null;
let lastManifestSize = null;
let lastMirrorReport = null;
let manifestState = null;
let manifestPromise = null;
let assetsBaseCache = null;
let embeddedFallbackActive = false;
const startupWarnings = [];

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

function isLikelyCspError(error) {
  const message = toErrorMessage(error).toLowerCase();
  if (!message) {
    return false;
  }
  return message.includes('content security policy') || message.includes('csp');
}

function isServiceWorkerControlled() {
  try {
    return Boolean(self?.navigator?.serviceWorker?.controller);
  } catch (error) {
    return false;
  }
}

function logFailureGroup(label, rows) {
  if (RUNTIME_ENV.stage === 'prod' && !DEBUG) {
    return;
  }
  if (typeof console === 'undefined') {
    return;
  }
  try {
    console.groupCollapsed(`[wyrd][pyodide] ${label}`);
    if (Array.isArray(rows) && rows.length > 0 && typeof console.table === 'function') {
      console.table(rows);
    } else if (rows) {
      console.log(rows);
    }
  } catch (error) {
    // ignore
  }
  try {
    console.groupEnd();
  } catch (error) {
    // ignore
  }
}

function createStageError(stage, type, message, error, extra = {}) {
  const { details, env: extraEnv, commit: overrideCommit, manifestVersion: overrideVersion, ...rest } =
    extra || {};
  const payload = {
    stage,
    type,
    message,
    commit:
      typeof overrideCommit !== 'undefined'
        ? overrideCommit
        : manifestState?.manifest?.commit ?? null,
    manifestVersion:
      typeof overrideVersion !== 'undefined'
        ? overrideVersion
        : manifestState?.manifest?.version ?? null,
    env: {
      hostname: RUNTIME_ENV.hostname || '',
      userAgent: RUNTIME_ENV.userAgent || '',
      ...(extraEnv || {}),
    },
    ...rest,
  };

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

function post(message) {
  self.postMessage(message);
}

function resolveAssetsBase() {
  if (embeddedFallbackActive) {
    return 'embedded://py/';
  }
  if (assetsBaseCache) {
    return assetsBaseCache;
  }

  let baseCandidate = null;
  try {
    if (typeof self !== 'undefined' && typeof self.WYRD_ASSET_BASE === 'string') {
      baseCandidate = self.WYRD_ASSET_BASE;
    }
  } catch (error) {
    baseCandidate = null;
  }

  if (!baseCandidate) {
    try {
      if (typeof import.meta !== 'undefined' && import.meta.url) {
        baseCandidate = new URL('../py/', import.meta.url).toString();
      }
    } catch (error) {
      baseCandidate = null;
    }
  }

  if (!baseCandidate) {
    try {
      if (typeof self !== 'undefined' && self.location && typeof self.location.href === 'string') {
        baseCandidate = new URL('../py/', self.location.href).toString();
      }
    } catch (error) {
      baseCandidate = null;
    }
  }

  if (!baseCandidate) {
    baseCandidate = '/py/';
  }

  if (!baseCandidate.endsWith('/')) {
    baseCandidate = `${baseCandidate}/`;
  }

  assetsBaseCache = baseCandidate;

  if (DEBUG || RUNTIME_ENV.stage !== 'prod') {
    try {
      const sample = new URL('manifest.json', assetsBaseCache).toString();
      if (typeof console !== 'undefined' && typeof console.debug === 'function') {
        console.debug('[wyrd][pyodide] asset base', {
          stage: RUNTIME_ENV.stage,
          base: assetsBaseCache,
          sample,
        });
      }
    } catch (error) {
      // ignore logging issues
    }
  }

  return assetsBaseCache;
}

function createAssetUrl(path) {
  const base = resolveAssetsBase();
  return new URL(path, base).toString();
}

function bufferFromData(data) {
  if (data instanceof ArrayBuffer) {
    return data;
  }
  if (ArrayBuffer.isView(data)) {
    return data.buffer.slice(data.byteOffset, data.byteOffset + data.byteLength);
  }
  throw new TypeError('Unsupported data type for hashing');
}

async function computeSha256Hex(data) {
  const buffer = bufferFromData(data);
  const digest = await crypto.subtle.digest('SHA-256', buffer);
  return Array.from(new Uint8Array(digest))
    .map((value) => value.toString(16).padStart(2, '0'))
    .join('');
}

function sanitizeManifest(manifest, base, manifestUrl) {
  if (!manifest || typeof manifest !== 'object') {
    throw createStageError('startup', 'AssetIntegrityFailed', 'Manifest payload invalid', null, {
      base,
      probeURL: manifestUrl,
      reason: 'InvalidManifest',
    });
  }

  const rawFiles = Array.isArray(manifest.files) ? manifest.files : null;
  if (!rawFiles || rawFiles.length === 0) {
    throw createStageError('startup', 'AssetIntegrityFailed', 'Manifest contains no files', null, {
      base,
      probeURL: manifestUrl,
      reason: 'EmptyManifest',
    });
  }

  const files = [];
  const seen = new Set();
  const seenLower = new Map();

  for (const entry of rawFiles) {
    const pathValue = typeof entry?.path === 'string' ? entry.path.trim() : '';
    if (!pathValue) {
      throw createStageError('startup', 'AssetIntegrityFailed', 'Manifest entry missing path', null, {
        base,
        probeURL: manifestUrl,
        reason: 'InvalidEntry',
      });
    }
    if (seen.has(pathValue)) {
      throw createStageError('startup', 'AssetIntegrityFailed', `Manifest contains duplicate path: ${pathValue}`, null, {
        base,
        probeURL: manifestUrl,
        reason: 'DuplicatePath',
      });
    }
    const lower = pathValue.toLowerCase();
    if (seenLower.has(lower) && seenLower.get(lower) !== pathValue) {
      throw createStageError('startup', 'AssetIntegrityFailed', `Manifest contains case-insensitive duplicate: ${pathValue}`, null, {
        base,
        probeURL: manifestUrl,
        reason: 'DuplicateCase',
        details: { existing: seenLower.get(lower), duplicate: pathValue },
      });
    }
    seen.add(pathValue);
    seenLower.set(lower, pathValue);

    const bytes = Number(entry?.bytes);
    if (!Number.isFinite(bytes) || bytes <= 0) {
      throw createStageError('startup', 'AssetIntegrityFailed', `Manifest entry has invalid byte size for ${pathValue}`, null, {
        base,
        probeURL: manifestUrl,
        reason: 'InvalidBytes',
        details: { path: pathValue, bytes: entry?.bytes },
      });
    }

    const sha = typeof entry?.sha256 === 'string' ? entry.sha256.trim().toLowerCase() : '';
    if (!/^[a-f0-9]{64}$/.test(sha)) {
      throw createStageError('startup', 'AssetIntegrityFailed', `Manifest entry has invalid sha256 for ${pathValue}`, null, {
        base,
        probeURL: manifestUrl,
        reason: 'InvalidSha',
        details: { path: pathValue, sha256: entry?.sha256 },
      });
    }

    files.push({ path: pathValue, bytes, sha256: sha });
  }

  files.sort((a, b) => a.path.localeCompare(b.path));

  const version = typeof manifest.version === 'string' ? manifest.version : null;
  const commit = typeof manifest.commit === 'string' ? manifest.commit : null;
  const generatedAt = typeof manifest.generatedAt === 'string' ? manifest.generatedAt : null;

  return { version, commit, generatedAt, files };
}

async function verifyManifestFiles(state) {
  const { manifest, base } = state;
  const files = manifest?.files || [];
  const fileMap = new Map();
  const cachedFiles = new Map();

  for (const entry of files) {
    fileMap.set(entry.path, entry);

    const url = new URL(entry.path, base).toString();

    if (state.embedded) {
      const text = EMBEDDED_FALLBACK_FILES[entry.path] || '';
      const buffer = textEncoder.encode(text);
      const bytes = buffer.byteLength;
      const sha256 = await computeSha256Hex(buffer);
      if (bytes !== entry.bytes || sha256 !== entry.sha256) {
        logFailureGroup('Embedded fallback integrity mismatch', [
          {
            path: entry.path,
            expectedBytes: entry.bytes,
            actualBytes: bytes,
            expectedSha256: entry.sha256,
            actualSha256: sha256,
          },
        ]);
        throw createStageError('startup', 'AssetIntegrityFailed', `Embedded fallback mismatch for ${entry.path}`, null, {
          base,
          probeURL: url,
          reason: 'EmbeddedMismatch',
          expectedBytes: entry.bytes,
          actualBytes: bytes,
        });
      }
      cachedFiles.set(entry.path, {
        text,
        bytes,
        sha256,
        url,
        finalUrl: url,
        status: 200,
      });
      continue;
    }

    let response;
    try {
      response = await fetch(url, { cache: 'no-store' });
    } catch (error) {
      const swControlled = isServiceWorkerControlled();
      if (isLikelyCspError(error)) {
        logFailureGroup('Pyodide asset policy block', [{ path: entry.path, url, directive: 'connect-src' }]);
        throw createStageError('startup', 'PolicyBlocked', 'Content Security Policy blocked asset fetch', error, {
          directive: 'connect-src',
          base,
          probeURL: url,
          manifestSize: files.length,
          swControlled,
        });
      }
      logFailureGroup('Pyodide asset fetch failure', [{ path: entry.path, url, reason: 'FetchError' }]);
      throw createStageError('startup', 'AssetIntegrityFailed', `Failed to fetch ${entry.path}`, error, {
        base,
        probeURL: url,
        reason: 'FetchError',
        manifestSize: files.length,
        swControlled,
      });
    }

    const status = typeof response?.status === 'number' ? response.status : undefined;
    const finalUrl = response?.url && response.url !== url ? response.url : undefined;

    if (!response?.ok) {
      const reason = `HTTP ${status ?? 'unknown'}`;
      const failure = {
        path: entry.path,
        url,
        status,
        reason,
        finalURL: finalUrl,
      };
      logFailureGroup('Pyodide asset fetch failure', [failure]);
      throw createStageError('startup', 'AssetIntegrityFailed', `Asset fetch failed for ${entry.path}`, null, {
        base,
        probeURL: url,
        reason,
        status,
        manifestSize: files.length,
        swControlled: isServiceWorkerControlled(),
        finalURL: finalUrl,
      });
    }

    const buffer = await response.arrayBuffer();
    const bytes = buffer.byteLength;
    if (bytes !== entry.bytes) {
      const failure = {
        path: entry.path,
        url,
        status,
        expectedBytes: entry.bytes,
        actualBytes: bytes,
        finalURL: finalUrl,
      };
      logFailureGroup('Pyodide asset byte mismatch', [failure]);
      throw createStageError('startup', 'AssetIntegrityFailed', `Byte size mismatch for ${entry.path}`, null, {
        base,
        probeURL: url,
        reason: 'ByteMismatch',
        expectedBytes: entry.bytes,
        actualBytes: bytes,
        status,
        manifestSize: files.length,
        finalURL: finalUrl,
      });
    }

    const sha256 = await computeSha256Hex(buffer);
    if (sha256 !== entry.sha256) {
      const failure = {
        path: entry.path,
        url,
        status,
        expectedSha256: entry.sha256,
        actualSha256: sha256,
        finalURL: finalUrl,
      };
      logFailureGroup('Pyodide asset hash mismatch', [failure]);
      throw createStageError('startup', 'AssetIntegrityFailed', `SHA mismatch for ${entry.path}`, null, {
        base,
        probeURL: url,
        reason: 'ShaMismatch',
        expectedSha256: entry.sha256,
        actualSha256: sha256,
        status,
        manifestSize: files.length,
        finalURL: finalUrl,
      });
    }

    const text = textDecoder.decode(buffer);
    cachedFiles.set(entry.path, {
      text,
      bytes,
      sha256,
      url,
      finalUrl: finalUrl || url,
      status,
    });
  }

  state.fileMap = fileMap;
  state.cachedFiles = cachedFiles;
  lastManifestSize = files.length;
}

function canUseEmbeddedFallback() {
  return !embeddedFallbackActive && RUNTIME_ENV.stage !== 'prod';
}

async function activateEmbeddedFallback(triggerError) {
  embeddedFallbackActive = true;
  assetsBaseCache = 'embedded://py/';

  const files = [];
  const cachedFiles = new Map();

  for (const [path, text] of Object.entries(EMBEDDED_FALLBACK_FILES)) {
    const buffer = textEncoder.encode(text);
    const bytes = buffer.byteLength;
    const sha256 = await computeSha256Hex(buffer);
    files.push({ path, bytes, sha256 });
    const url = new URL(path, assetsBaseCache).toString();
    cachedFiles.set(path, {
      text,
      bytes,
      sha256,
      url,
      finalUrl: url,
      status: 200,
    });
  }

  files.sort((a, b) => a.path.localeCompare(b.path));

  const manifest = {
    version: 'embedded-fallback',
    commit: 'embedded',
    generatedAt: new Date().toISOString(),
    files,
  };

  manifestState = {
    manifest,
    base: assetsBaseCache,
    manifestUrl: new URL('manifest.json', assetsBaseCache).toString(),
    embedded: true,
    fileMap: new Map(files.map((entry) => [entry.path, entry])),
    cachedFiles,
  };

  const warning = createStageError(
    'startup',
    'UsingEmbeddedFallback',
    'Using embedded fallback Python bundle',
    triggerError,
    {
      base: manifestState.base,
      probeURL: manifestState.manifestUrl,
      filesUsed: files.map((entry) => entry.path),
      warning: true,
    }
  );
  startupWarnings.push(warning);

  if (typeof console !== 'undefined' && typeof console.warn === 'function') {
    console.warn('[wyrd][pyodide] Using embedded fallback Python sources', {
      stage: RUNTIME_ENV.stage,
      reason: toErrorMessage(triggerError) || 'asset base unavailable',
    });
  }

  lastManifestSize = files.length;
  return manifestState;
}

async function fetchManifestFromNetwork(base) {
  const manifestUrl = new URL('manifest.json', base).toString();
  const swControlled = isServiceWorkerControlled();
  let response;

  try {
    response = await fetch(manifestUrl, { cache: 'no-store' });
  } catch (error) {
    if (isLikelyCspError(error)) {
      throw createStageError('startup', 'PolicyBlocked', 'Content Security Policy blocked manifest fetch', error, {
        directive: 'connect-src',
        base,
        probeURL: manifestUrl,
        swControlled,
      });
    }
    throw createStageError('startup', 'AssetIntegrityFailed', 'Failed to fetch manifest.json', error, {
      base,
      probeURL: manifestUrl,
      reason: 'FetchError',
      swControlled,
    });
  }

  const status = typeof response?.status === 'number' ? response.status : undefined;
  const finalUrl = response?.url && response.url !== manifestUrl ? response.url : undefined;

  if (!response?.ok) {
    const reason = `HTTP ${status ?? 'unknown'}`;
    throw createStageError('startup', 'AssetIntegrityFailed', 'Manifest fetch failed', null, {
      base,
      probeURL: manifestUrl,
      reason,
      status,
      swControlled,
      finalURL: finalUrl,
    });
  }

  let manifest;
  try {
    manifest = await response.json();
  } catch (error) {
    throw createStageError('startup', 'AssetIntegrityFailed', 'Manifest JSON parse failed', error, {
      base,
      probeURL: manifestUrl,
      reason: 'InvalidManifest',
      swControlled,
      finalURL: finalUrl,
    });
  }

  return { manifest, manifestUrl, finalUrl };
}

async function ensureManifestReady() {
  if (manifestState && manifestState.cachedFiles && manifestState.cachedFiles.size > 0) {
    return manifestState;
  }

  if (manifestPromise) {
    return manifestPromise;
  }

  manifestPromise = (async () => {
    if (embeddedFallbackActive && manifestState) {
      return manifestState;
    }

    const base = resolveAssetsBase();

    let fetched;
    try {
      fetched = await fetchManifestFromNetwork(base);
    } catch (error) {
      manifestState = null;
      const allowFallback =
        canUseEmbeddedFallback() &&
        error &&
        typeof error === 'object' &&
        error.stage === 'startup' &&
        error.type === 'AssetIntegrityFailed' &&
        typeof error.reason === 'string' &&
        error.reason === 'FetchError';
      if (allowFallback) {
        return activateEmbeddedFallback(error);
      }
      throw error;
    }

    try {
      const sanitized = sanitizeManifest(fetched.manifest, base, fetched.manifestUrl);
      manifestState = {
        manifest: sanitized,
        base,
        manifestUrl: fetched.manifestUrl,
        embedded: false,
        fileMap: new Map(),
        cachedFiles: new Map(),
      };
      await verifyManifestFiles(manifestState);
      return manifestState;
    } catch (error) {
      manifestState = null;
      throw error;
    }
  })();

  try {
    const result = await manifestPromise;
    return result;
  } catch (error) {
    manifestPromise = null;
    throw error;
  }
}

async function mirrorRepoFiles(instance) {
  if (repoFilesMirrored) {
    return lastMirrorReport;
  }

  const state = await ensureManifestReady();
  const manifest = state?.manifest;
  const manifestEntries = Array.isArray(manifest?.files) ? manifest.files : [];
  lastManifestSize = manifestEntries.length;

  try {
    instance.FS.mkdirTree('/repo');
  } catch (error) {
    throw createStageError('mirror', 'MirrorSetupFailed', 'Failed to prepare /repo directory', error, {
      manifestSize: lastManifestSize,
      sysPath: getCurrentSysPathForPayload(),
      base: state?.base,
    });
  }

  const reports = [];
  const failures = [];
  let okCount = 0;

  for (const entry of manifestEntries) {
    const { path, bytes } = entry;
    const repoTargetPath = `/repo/${path}`;
    const baseUrl = state?.base ? new URL(path, state.base).toString() : createAssetUrl(path);
    const url = baseUrl;
    let cached = state.cachedFiles?.get(path);
    let status = typeof cached?.status === 'number' ? cached.status : undefined;
    let finalUrl = cached?.finalUrl || url;
    let sourceText = typeof cached?.text === 'string' ? cached.text : undefined;
    let actualBytes = typeof cached?.bytes === 'number' ? cached.bytes : 0;

    try {
      if (!cached) {
        const response = await fetch(url, { cache: 'no-store' });
        status = typeof response?.status === 'number' ? response.status : undefined;
        if (!response?.ok) {
          const reason = `HTTP ${status ?? 'unknown'}`;
          throw new Error(reason);
        }
        const buffer = await response.arrayBuffer();
        actualBytes = buffer.byteLength;
        const digest = await computeSha256Hex(buffer);
        if (actualBytes !== bytes) {
          throw new Error('ByteMismatch');
        }
        if (digest !== entry.sha256) {
          throw new Error('ShaMismatch');
        }
        sourceText = textDecoder.decode(buffer);
        finalUrl = response?.url && response.url !== url ? response.url : url;
        cached = {
          text: sourceText,
          bytes: actualBytes,
          sha256: digest,
          url,
          finalUrl,
          status,
        };
        state.cachedFiles?.set(path, cached);
      }

      if (typeof sourceText !== 'string') {
        sourceText = cached?.text;
      }
      if (typeof sourceText !== 'string') {
        throw new Error('Missing source payload');
      }

      actualBytes = typeof cached?.bytes === 'number' ? cached.bytes : textEncoder.encode(sourceText).byteLength;
      if (actualBytes !== bytes) {
        throw new Error('ByteMismatch');
      }

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

      instance.FS.writeFile(path, sourceText);

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

      instance.FS.writeFile(repoTargetPath, sourceText);

      reports.push({
        path,
        repoPath: repoTargetPath,
        url,
        finalURL: finalUrl !== url ? finalUrl : undefined,
        status: typeof status === 'number' ? status : undefined,
        ok: true,
        size: actualBytes,
      });
      okCount += 1;
    } catch (error) {
      const failureEntry = {
        path,
        repoPath: repoTargetPath,
        url,
        status: typeof status === 'number' ? status : undefined,
        bytes: actualBytes,
        expectedBytes: bytes,
        finalURL: finalUrl !== url ? finalUrl : undefined,
        reason: toErrorMessage(error) || 'Unknown mirror failure',
      };
      reports.push({ ...failureEntry, ok: false });
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
    logFailureGroup('Pyodide mirror failure', failures);
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
      base: state?.base,
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
        const manifestTask = ensureManifestReady();
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

        await manifestTask;
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
      const payload = {
        ok: true,
        ready: true,
        manifestVersion: manifestState?.manifest?.version ?? null,
        commit: manifestState?.manifest?.commit ?? null,
        base: manifestState?.base ?? resolveAssetsBase(),
        sysPath: getCurrentSysPathForPayload(),
      };
      if (manifestState?.manifest?.generatedAt) {
        payload.generatedAt = manifestState.manifest.generatedAt;
      }
      if (startupWarnings.length > 0) {
        payload.warnings = startupWarnings.map((warning) => ({ ...warning }));
      }
      respond(payload);
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
        if ('commit' in error) {
          payload.commit = error.commit;
        }
        if ('manifestVersion' in error) {
          payload.manifestVersion = error.manifestVersion;
        }
        if ('env' in error) {
          payload.env = error.env;
        }
        if ('base' in error) {
          payload.base = error.base;
        }
        if ('probeURL' in error) {
          payload.probeURL = error.probeURL;
        }
        if ('reason' in error) {
          payload.reason = error.reason;
        }
        if ('swControlled' in error) {
          payload.swControlled = error.swControlled;
        }
        if ('directive' in error) {
          payload.directive = error.directive;
        }
        if ('warning' in error) {
          payload.warning = error.warning;
        }
        if ('filesUsed' in error) {
          payload.filesUsed = error.filesUsed;
        }
        if ('finalURL' in error) {
          payload.finalURL = error.finalURL;
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
