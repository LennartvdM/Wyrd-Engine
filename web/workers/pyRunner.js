import { loadPyodide } from "https://cdn.jsdelivr.net/pyodide/v0.24.1/full/pyodide.mjs";

let pyodideInstance;
let pyodideReady;
let loadingError;

self.onmessage = async (event) => {
  const { id, type, ...payload } = event.data || {};

  if (typeof id === "undefined") {
    return;
  }

  try {
    if (type === "load") {
      await ensurePyodide();
      respond(id, { ok: true, event: "load" });
      return;
    }

    if (type === "runPython") {
      const response = await executePython(payload);
      respond(id, { ok: true, event: "runPython", ...response });
      return;
    }

    respond(id, {
      ok: false,
      event: type,
      error: `Unknown message type: ${String(type)}`,
    });
  } catch (error) {
    respond(id, {
      ok: false,
      event: type,
      error: stringifyError(error),
      stack: error?.stack,
      stdout: error?.stdout || "",
      stderr: error?.stderr || "",
      resultJSON: error?.resultJSON,
    });
  }
};

function respond(id, data) {
  self.postMessage({ id, ...data });
}

async function ensurePyodide() {
  if (pyodideInstance) {
    return pyodideInstance;
  }

  if (loadingError) {
    throw loadingError;
  }

  if (!pyodideReady) {
    pyodideReady = (async () => {
      const instance = await loadPyodide({
        indexURL: "https://cdn.jsdelivr.net/pyodide/v0.24.1/full/",
      });
      disableNetworkAccess(instance);
      return instance;
    })();
  }

  try {
    pyodideInstance = await pyodideReady;
    return pyodideInstance;
  } catch (error) {
    loadingError = error;
    pyodideReady = undefined;
    throw error;
  }
}

async function executePython({ code, context }) {
  if (!code || typeof code !== "string") {
    throw new Error("Python source code is required");
  }

  const pyodide = await ensurePyodide();

  const stdoutChunks = [];
  const stderrChunks = [];
  const stdoutWriter = { batched: (text) => stdoutChunks.push(text) };
  const stderrWriter = { batched: (text) => stderrChunks.push(text) };
  const previousStdout = pyodide.setStdout(stdoutWriter);
  const previousStderr = pyodide.setStderr(stderrWriter);

  let globals;
  let payloadProxy;
  let result;

  try {
    globals = pyodide.globals.get("dict")();
    const builtins = pyodide.globals.get("__builtins__");
    globals.set("__builtins__", builtins);
    builtins.destroy();

    if (typeof context !== "undefined") {
      payloadProxy = pyodide.toPy(context);
      globals.set("payload", payloadProxy);
    }

    result = await pyodide.runPythonAsync(code, { globals });

    const jsResult = convertResult(result);
    return {
      stdout: stdoutChunks.join(""),
      stderr: stderrChunks.join(""),
      resultJSON: safeStringify(jsResult),
    };
  } catch (error) {
    throw enrichError(error, stdoutChunks, stderrChunks);
  } finally {
    pyodide.setStdout(previousStdout);
    pyodide.setStderr(previousStderr);

    if (result && typeof result.destroy === "function") {
      result.destroy();
    }

    if (payloadProxy && typeof payloadProxy.destroy === "function") {
      payloadProxy.destroy();
    }

    if (globals && typeof globals.destroy === "function") {
      globals.destroy();
    }
  }
}

function enrichError(error, stdoutChunks, stderrChunks) {
  if (error && typeof error === "object") {
    const stdout = stdoutChunks.join("");
    const stderr = stderrChunks.join("");
    error.stdout = stdout;
    error.stderr = stderr;
    error.resultJSON = safeStringify({ error: stringifyError(error) });
  }
  return error;
}

function convertResult(result) {
  if (!result) {
    return result;
  }

  if (typeof result.toJs === "function") {
    return result.toJs({ create_proxy: false });
  }

  return result;
}

function disableNetworkAccess(pyodide) {
  const errorFactory = () =>
    new Error("Network access from the sandboxed Python runtime is disabled.");

  const blockAsync = () => Promise.reject(errorFactory());
  const blockSync = () => {
    throw errorFactory();
  };

  self.fetch = blockAsync;
  self.XMLHttpRequest = function XMLHttpRequest() {
    blockSync();
  };
  self.WebSocket = function WebSocket() {
    blockSync();
  };
  self.EventSource = function EventSource() {
    blockSync();
  };

  if (typeof pyodide.loadPackage === "function") {
    pyodide.loadPackage = async () => {
      throw errorFactory();
    };
  }
}

function safeStringify(value) {
  try {
    const json = JSON.stringify(value, null, 2);
    return typeof json === "undefined" ? "null" : json;
  } catch (error) {
    return JSON.stringify({ error: stringifyError(error) });
  }
}

function stringifyError(error) {
  if (!error) {
    return "Unknown error";
  }
  if (typeof error === "string") {
    return error;
  }
  return error.message || error.name || "Unknown error";
}
