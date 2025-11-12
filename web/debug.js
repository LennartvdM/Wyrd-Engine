const GLOBAL = typeof globalThis !== 'undefined' ? globalThis : undefined;

function parseDebugQuery(root) {
  if (!root) {
    return null;
  }
  try {
    const search = root.location && typeof root.location.search === 'string' ? root.location.search : '';
    if (!search) {
      return null;
    }
    const params = new URLSearchParams(search);
    if (!params.has('debug')) {
      return null;
    }
    const value = params.get('debug');
    if (value === null) {
      return true;
    }
    const normalized = String(value).trim().toLowerCase();
    if (normalized === '0' || normalized === 'false' || normalized === 'off') {
      return false;
    }
    if (normalized === '' || normalized === '1' || normalized === 'true' || normalized === 'on') {
      return true;
    }
    return Boolean(normalized);
  } catch (error) {
    return null;
  }
}

export function computeDebugState(root = GLOBAL) {
  if (!root) {
    return false;
  }

  try {
    if (typeof root.__DEBUG__ !== 'undefined') {
      return Boolean(root.__DEBUG__);
    }
  } catch (error) {
    // ignore access issues
  }

  const queryValue = parseDebugQuery(root);
  if (queryValue !== null) {
    return queryValue;
  }

  try {
    const nodeEnv = root?.process?.env?.NODE_ENV;
    if (typeof nodeEnv === 'string') {
      return nodeEnv !== 'production';
    }
  } catch (error) {
    // ignore env access issues
  }

  try {
    if (typeof root.WYRD_STAGE === 'string' && root.WYRD_STAGE !== 'prod') {
      return true;
    }
  } catch (error) {
    // ignore stage access issues
  }

  return false;
}

export const DEBUG = computeDebugState();

if (GLOBAL && typeof GLOBAL.WYRD_DEBUG === 'undefined') {
  try {
    GLOBAL.WYRD_DEBUG = DEBUG;
  } catch (error) {
    // ignore assignment issues
  }
}

export function isDebugEnabled() {
  return DEBUG;
}
