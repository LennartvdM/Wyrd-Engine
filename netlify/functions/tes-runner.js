const PYTHON_TIMEOUT_MS = 60_000;
const PYTHON_CANDIDATES = [
  process.env.WYRD_PYTHON,
  'python3',
  'python',
].filter(Boolean);

const PYTHON_BRIDGE_CODE = String.raw`
import json
import sys

from tes.runner import run_script


def _as_mapping(value):
    if isinstance(value, dict):
        return value
    return {}


def main():
    raw = sys.stdin.read()
    try:
        data = json.loads(raw or '{}')
    except json.JSONDecodeError:
        data = {}

    script = data.get('script') or ''
    runner_config = _as_mapping(data.get('runnerConfig'))
    inputs = _as_mapping(data.get('inputs'))

    globals_update = {
        'RUNNER_CONFIG': runner_config,
        'EXECUTION_INPUTS': inputs,
    }

    result = run_script(script, globals_update=globals_update)

    payload = {
        'stdout': result.get('stdout', ''),
        'stderr': result.get('stderr', ''),
        'resultJSON': result.get('resultJSON'),
    }

    raw_result = result.get('resultJSON')
    parsed = None
    if isinstance(raw_result, str) and raw_result:
        try:
            parsed = json.loads(raw_result)
        except json.JSONDecodeError:
            parsed = None
    payload['result'] = parsed

    print(json.dumps(payload))


if __name__ == '__main__':
    main()
`;

let cachedEnvironment;

async function loadEnvironment() {
  if (cachedEnvironment) {
    return cachedEnvironment;
  }

  const [{ spawn }, pathModule, urlModule] = await Promise.all([
    import('child_process'),
    import('path'),
    import('url'),
  ]);

  const path = pathModule.default || pathModule;
  const { fileURLToPath } = urlModule;
  const __filename = fileURLToPath(import.meta.url);
  const repoRoot = path.resolve(path.dirname(__filename), '..', '..');

  cachedEnvironment = { spawn, path, repoRoot };
  return cachedEnvironment;
}

function jsonResponse(statusCode, payload) {
  return {
    statusCode,
    headers: {
      'content-type': 'application/json; charset=utf-8',
      'access-control-allow-origin': '*',
    },
    body: JSON.stringify(payload),
  };
}

function spawnPythonOnce(spawnFn, binary, args, options, input, timeoutMs) {
  return new Promise((resolve, reject) => {
    let stdout = '';
    let stderr = '';
    let completed = false;
    let timer = null;
    let child;

    try {
      child = spawnFn(binary, args, options);
    } catch (error) {
      reject(error);
      return;
    }

    const finalize = (error) => {
      if (completed) {
        return;
      }
      completed = true;
      if (timer) {
        clearTimeout(timer);
      }
      if (error) {
        error.stdout = stdout;
        error.stderr = stderr;
        reject(error);
      } else {
        resolve({ stdout, stderr, binary });
      }
    };

    child.stdout.setEncoding('utf8');
    child.stdout.on('data', (chunk) => {
      stdout += chunk;
    });

    child.stderr.setEncoding('utf8');
    child.stderr.on('data', (chunk) => {
      stderr += chunk;
    });

    child.on('error', (error) => {
      finalize(error);
    });

    child.on('close', (code) => {
      if (code === 0) {
        finalize(null);
      } else {
        const error = new Error(`Python exited with code ${code}`);
        error.code = code;
        finalize(error);
      }
    });

    if (typeof input === 'string' && input.length > 0) {
      try {
        child.stdin.write(input);
      } catch (error) {
        finalize(error);
        return;
      }
    }
    child.stdin.end();

    if (timeoutMs > 0) {
      timer = setTimeout(() => {
        const error = new Error('Python execution timed out.');
        error.code = 'TIMEOUT';
        try {
          child.kill('SIGKILL');
        } catch (killError) {
          // ignore inability to kill the process
        }
        finalize(error);
      }, timeoutMs);
      timer.unref?.();
    }
  });
}

async function runPythonBridge(payload) {
  const { spawn, path, repoRoot } = await loadEnvironment();
  const args = ['-c', PYTHON_BRIDGE_CODE];
  const env = { ...process.env };
  const existingPath = env.PYTHONPATH ? env.PYTHONPATH.split(path.delimiter) : [];
  if (!existingPath.includes(repoRoot)) {
    env.PYTHONPATH = [repoRoot, ...existingPath].filter(Boolean).join(path.delimiter);
  }

  const options = { cwd: repoRoot, env };
  const input = JSON.stringify(payload ?? {});

  let lastError = null;
  for (const binary of PYTHON_CANDIDATES) {
    try {
      return await spawnPythonOnce(spawn, binary, args, options, input, PYTHON_TIMEOUT_MS);
    } catch (error) {
      if (error && error.code === 'ENOENT') {
        lastError = error;
        continue;
      }
      throw error;
    }
  }

  if (lastError) {
    throw lastError;
  }

  const error = new Error('No Python interpreter found.');
  error.code = 'ENOENT';
  throw error;
}

export async function handler(event) {
  if (event.httpMethod && event.httpMethod !== 'POST') {
    return jsonResponse(405, { error: 'Method not allowed' });
  }

  let payload;
  try {
    payload = event.body ? JSON.parse(event.body) : {};
  } catch (error) {
    return jsonResponse(400, {
      error: 'Invalid JSON body.',
      details: error?.message || 'Unable to parse request body.',
    });
  }

  const script = typeof payload.script === 'string' ? payload.script : '';
  if (!script.trim()) {
    return jsonResponse(400, { error: 'Script is required.' });
  }

  const runnerConfig = payload.runnerConfig ?? {};
  const inputs = payload.inputs ?? {};

  const start = Date.now();
  let bridgeResult;
  try {
    bridgeResult = await runPythonBridge({
      script,
      runnerConfig,
      inputs,
    });
  } catch (error) {
    const elapsedMs = Date.now() - start;
    if (error?.code === 'ENOENT') {
      return jsonResponse(500, {
        error: 'Python interpreter not available.',
        elapsedMs,
      });
    }
    if (error?.code === 'TIMEOUT') {
      return jsonResponse(504, {
        error: 'Python execution timed out.',
        stdout: error.stdout || '',
        stderr: error.stderr || '',
        elapsedMs,
      });
    }
    return jsonResponse(502, {
      error: 'Python execution failed.',
      details: error?.message || 'Unknown error.',
      stdout: error?.stdout || '',
      stderr: error?.stderr || '',
      elapsedMs,
    });
  }

  const elapsedMs = Date.now() - start;
  let responsePayload;
  try {
    responsePayload = bridgeResult.stdout ? JSON.parse(bridgeResult.stdout) : {};
  } catch (error) {
    return jsonResponse(502, {
      error: 'Failed to decode runner response.',
      details: error?.message || 'Invalid JSON emitted by runner.',
      raw: bridgeResult.stdout,
      bridgeStderr: bridgeResult.stderr,
      elapsedMs,
    });
  }

  const resultValue =
    typeof responsePayload.result !== 'undefined' ? responsePayload.result : null;

  return jsonResponse(200, {
    stdout: typeof responsePayload.stdout === 'string' ? responsePayload.stdout : '',
    stderr: typeof responsePayload.stderr === 'string' ? responsePayload.stderr : '',
    resultJSON:
      typeof responsePayload.resultJSON === 'string' || responsePayload.resultJSON === null
        ? responsePayload.resultJSON
        : null,
    result: resultValue,
    structured:
      responsePayload.structured && typeof responsePayload.structured === 'object'
        ? responsePayload.structured
        : null,
    elapsedMs,
    bridgeStderr: bridgeResult.stderr || '',
    pythonBinary: bridgeResult.binary,
  });
}
