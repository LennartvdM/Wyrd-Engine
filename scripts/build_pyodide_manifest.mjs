#!/usr/bin/env node
import { promises as fs } from 'fs';
import path from 'path';
import crypto from 'crypto';
import { execSync } from 'child_process';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const repoRoot = path.resolve(__dirname, '..');
const destRoot = path.join(repoRoot, 'web', 'py');

const INCLUDE_DIRS = ['engines', 'modules', 'rigs'];

const manifestListPath = path.join(repoRoot, 'PY_MANIFEST');

async function readPyManifestEntries() {
  try {
    const raw = await fs.readFile(manifestListPath, 'utf8');
    return raw
      .split(/\r?\n/g)
      .map((line) => line.trim())
      .filter((line) => line && !line.startsWith('#'));
  } catch (error) {
    if (error.code === 'ENOENT') {
      return [];
    }
    throw error;
  }
}

async function collectPythonFiles(relativeDir) {
  const absoluteDir = path.join(repoRoot, relativeDir);
  let results = [];
  let entries;
  try {
    entries = await fs.readdir(absoluteDir, { withFileTypes: true });
  } catch (error) {
    if (error.code === 'ENOENT') {
      return results;
    }
    throw error;
  }
  for (const entry of entries) {
    const entryPath = path.join(relativeDir, entry.name);
    if (entry.isDirectory()) {
      const nested = await collectPythonFiles(entryPath);
      results = results.concat(nested);
      continue;
    }
    if (entry.isFile() && entry.name.endsWith('.py')) {
      results.push(entryPath);
    }
  }
  return results;
}

function toPosixPath(value) {
  return value.split(path.sep).join('/');
}

async function ensureDestRoot() {
  await fs.mkdir(destRoot, { recursive: true });
}

async function removeExtraneousFiles(keepSet) {
  async function walk(current) {
    const entries = await fs.readdir(current, { withFileTypes: true });
    for (const entry of entries) {
      if (entry.name === '.gitkeep') {
        continue;
      }
      const absolutePath = path.join(current, entry.name);
      const relative = path.relative(destRoot, absolutePath);
      const posixRelative = toPosixPath(relative);
      if (entry.isDirectory()) {
        await walk(absolutePath);
        const remaining = await fs.readdir(absolutePath);
        if (remaining.length === 0) {
          await fs.rmdir(absolutePath);
        }
      } else if (!keepSet.has(posixRelative)) {
        await fs.unlink(absolutePath);
      }
    }
  }

  await walk(destRoot);
}

async function computeSha256(buffer) {
  return crypto.createHash('sha256').update(buffer).digest('hex');
}

async function main() {
  await ensureDestRoot();
  const manifestEntries = await readPyManifestEntries();
  const directoryFiles = (
    await Promise.all(INCLUDE_DIRS.map((dir) => collectPythonFiles(dir)))
  ).flat();

  const candidates = new Set([...manifestEntries, ...directoryFiles]);
  const ordered = Array.from(candidates)
    .map((entry) => entry.trim())
    .filter(Boolean)
    .map((entry) => toPosixPath(entry))
    .sort((a, b) => a.localeCompare(b));

  if (ordered.length === 0) {
    throw new Error('No Python source files were discovered for the Pyodide bundle.');
  }

  const lowerCaseMap = new Map();
  for (const relative of ordered) {
    const lower = relative.toLowerCase();
    if (lowerCaseMap.has(lower)) {
      throw new Error(
        `Duplicate path detected when ignoring case: ${relative} conflicts with ${lowerCaseMap.get(lower)}`
      );
    }
    lowerCaseMap.set(lower, relative);
  }

  const entries = [];
  const keepSet = new Set();
  for (const relative of ordered) {
    const absolute = path.join(repoRoot, relative);
    let buffer;
    try {
      buffer = await fs.readFile(absolute);
    } catch (error) {
      if (error.code === 'ENOENT') {
        throw new Error(`Expected Python source missing: ${relative}`);
      }
      throw error;
    }

    if (buffer.length === 0) {
      throw new Error(`Python source is zero-length: ${relative}`);
    }

    const sha256 = await computeSha256(buffer);
    const destination = path.join(destRoot, relative);
    await fs.mkdir(path.dirname(destination), { recursive: true });
    await fs.writeFile(destination, buffer);

    const posixRelative = toPosixPath(relative);
    keepSet.add(posixRelative);
    entries.push({ path: posixRelative, bytes: buffer.length, sha256 });
  }

  await removeExtraneousFiles(keepSet);

  entries.sort((a, b) => a.path.localeCompare(b.path));

  let commit = 'unknown';
  try {
    commit = execSync('git rev-parse HEAD', { cwd: repoRoot }).toString().trim();
  } catch (error) {
    // ignore, leave commit as unknown
  }

  const version =
    process.env.PYODIDE_MANIFEST_VERSION || process.env.BUILD_VERSION || '1';
  const manifestPayload = {
    version,
    commit,
    generatedAt: new Date().toISOString(),
    files: entries,
  };

  const manifestPath = path.join(destRoot, 'manifest.json');
  await fs.writeFile(manifestPath, JSON.stringify(manifestPayload, null, 2));

  console.log(`Pyodide manifest generated with ${entries.length} files.`);
}

main().catch((error) => {
  console.error('[build_pyodide_manifest] Failed:', error.message);
  if (error?.stack) {
    console.error(error.stack);
  }
  process.exitCode = 1;
});
