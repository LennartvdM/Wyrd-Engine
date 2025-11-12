const tabButtons = Array.from(
  document.querySelectorAll('.tab[data-tab-scope="root"]')
);
const tabPanels = Array.from(
  document.querySelectorAll('.tab-panel[data-tab-scope="root"]')
);
const tabOrder = ['calendar', 'config', 'console', 'json', 'fixtures', 'logs'];
const consoleTabButton = tabButtons.find((button) => button.dataset.tab === 'console');

const INTENT_TYPES = {
  NAVIGATE_TAB: 'NAVIGATE_TAB',
  SHOW_TOAST: 'SHOW_TOAST',
  APP_STATUS: 'APP_STATUS',
};

const intentHandlers = new Map();

function registerIntentHandler(type, handler) {
  if (typeof type !== 'string' || !type) {
    return () => {};
  }
  if (typeof handler !== 'function') {
    return () => {};
  }
  if (!intentHandlers.has(type)) {
    intentHandlers.set(type, new Set());
  }
  const handlers = intentHandlers.get(type);
  handlers.add(handler);
  return () => {
    handlers.delete(handler);
    if (handlers.size === 0) {
      intentHandlers.delete(type);
    }
  };
}

function dispatchIntent(intent) {
  if (!intent || typeof intent.type !== 'string') {
    return;
  }
  const handlers = intentHandlers.get(intent.type);
  if (!handlers || handlers.size === 0) {
    return;
  }
  handlers.forEach((handler) => {
    try {
      handler(intent.payload ?? {}, intent);
    } catch (error) {
      console.error(`Intent handler for ${intent.type} failed:`, error);
    }
  });
}

function initializeNestedTabScopes() {
  const scopeRegistry = new Map();

  document.querySelectorAll('[data-tab-scope]').forEach((element) => {
    const scope = element.dataset.tabScope;
    if (!scope || scope === 'root') {
      return;
    }

    if (!scopeRegistry.has(scope)) {
      scopeRegistry.set(scope, { buttons: [], panels: [] });
    }

    const entry = scopeRegistry.get(scope);
    if (element.classList.contains('tab')) {
      entry.buttons.push(element);
    } else if (element.classList.contains('tab-panel')) {
      entry.panels.push(element);
    }
  });

  scopeRegistry.forEach(({ buttons, panels }) => {
    if (buttons.length === 0 || panels.length === 0) {
      return;
    }

    const activate = (target) => {
      if (typeof target !== 'string') {
        return;
      }
      const normalizedTarget = target.toLowerCase();
      buttons.forEach((button) => {
        button.classList.toggle('active', button.dataset.tab === normalizedTarget);
      });
      panels.forEach((panel) => {
        panel.classList.toggle('active', panel.dataset.tab === normalizedTarget);
      });
    };

    const defaultButton =
      buttons.find((button) => button.classList.contains('active')) ?? buttons[0];
    if (defaultButton && typeof defaultButton.dataset.tab === 'string') {
      activate(defaultButton.dataset.tab);
    }

    buttons.forEach((button) => {
      button.addEventListener('click', () => {
        activate(button.dataset.tab);
      });
    });
  });
}

initializeNestedTabScopes();

function currentMondayISO(referenceDate = new Date()) {
  const date = new Date(referenceDate);
  const day = date.getDay();
  const diff = day === 0 ? -6 : 1 - day;
  date.setDate(date.getDate() + diff);
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const dayOfMonth = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${dayOfMonth}`;
}

function deterministicSeed(input) {
  if (typeof input !== 'string' || input.length === 0) {
    return 0;
  }
  let hash = 0;
  for (let index = 0; index < input.length; index += 1) {
    hash = (hash * 31 + input.charCodeAt(index)) >>> 0;
  }
  return hash;
}

let toastContainer;
let toastIdCounter = 0;
const activeToasts = new Map();

function getToastContainer() {
  if (toastContainer && document.body.contains(toastContainer)) {
    return toastContainer;
  }
  toastContainer = document.createElement('div');
  toastContainer.className = 'toast-container';
  toastContainer.style.position = 'fixed';
  toastContainer.style.top = '16px';
  toastContainer.style.right = '16px';
  toastContainer.style.display = 'flex';
  toastContainer.style.flexDirection = 'column';
  toastContainer.style.alignItems = 'flex-end';
  toastContainer.style.gap = '8px';
  toastContainer.style.zIndex = '9999';
  toastContainer.style.pointerEvents = 'none';
  document.body.append(toastContainer);
  return toastContainer;
}

function removeToast(id) {
  const entry = activeToasts.get(id);
  if (!entry) {
    return;
  }
  activeToasts.delete(id);
  window.clearTimeout(entry.timeoutId);
  const { element } = entry;
  element.style.opacity = '0';
  element.style.transform = 'translateY(-6px)';
  const removeDelay = Number.parseInt(element.dataset.dismissDelay ?? '200', 10);
  window.setTimeout(() => {
    element.remove();
    if (toastContainer && toastContainer.childElementCount === 0) {
      toastContainer.remove();
      toastContainer = undefined;
    }
  }, Number.isNaN(removeDelay) ? 200 : removeDelay);
}

function showToast(payload = {}) {
  const message = typeof payload.message === 'string' ? payload.message.trim() : '';
  if (!message) {
    return;
  }
  const description =
    typeof payload.description === 'string' ? payload.description.trim() : '';
  const intent = typeof payload.intent === 'string' ? payload.intent.toLowerCase() : 'info';
  const duration = Number.isFinite(payload.duration) ? payload.duration : 4000;

  const container = getToastContainer();
  toastIdCounter += 1;
  const toastId = toastIdCounter;

  const toast = document.createElement('div');
  toast.className = 'toast';
  toast.style.pointerEvents = 'auto';
  toast.style.background = '#0f172a';
  toast.style.border = '1px solid #1e293b';
  toast.style.borderRadius = '8px';
  toast.style.padding = '12px 16px';
  toast.style.color = '#f8fafc';
  toast.style.display = 'flex';
  toast.style.flexDirection = 'row';
  toast.style.alignItems = 'flex-start';
  toast.style.gap = '12px';
  toast.style.minWidth = '240px';
  toast.style.maxWidth = '320px';
  toast.style.boxShadow = '0 20px 35px rgba(15, 23, 42, 0.35)';
  toast.style.opacity = '0';
  toast.style.transform = 'translateY(-6px)';
  toast.style.transition = 'opacity 0.2s ease, transform 0.2s ease';
  toast.setAttribute('role', 'status');
  toast.setAttribute('aria-live', 'polite');

  const intentColors = {
    success: '#22c55e',
    error: '#f97316',
    warning: '#facc15',
    info: '#38bdf8',
  };
  const accentColor = intentColors[intent] || intentColors.info;

  const accent = document.createElement('span');
  accent.style.display = 'block';
  accent.style.width = '4px';
  accent.style.borderRadius = '4px';
  accent.style.background = accentColor;

  const content = document.createElement('div');
  content.style.display = 'flex';
  content.style.flexDirection = 'column';
  content.style.gap = description ? '4px' : '0';
  content.style.flex = '1 1 auto';

  const title = document.createElement('p');
  title.textContent = message;
  title.style.margin = '0';
  title.style.fontSize = '13px';
  title.style.fontWeight = '600';
  title.style.lineHeight = '1.4';
  content.append(title);

  if (description) {
    const details = document.createElement('p');
    details.textContent = description;
    details.style.margin = '0';
    details.style.fontSize = '12px';
    details.style.fontWeight = '400';
    details.style.color = '#cbd5f5';
    details.style.lineHeight = '1.4';
    content.append(details);
  }

  const closeButton = document.createElement('button');
  closeButton.type = 'button';
  closeButton.textContent = '×';
  closeButton.setAttribute('aria-label', 'Dismiss notification');
  closeButton.style.background = 'transparent';
  closeButton.style.border = 'none';
  closeButton.style.color = '#94a3b8';
  closeButton.style.cursor = 'pointer';
  closeButton.style.fontSize = '16px';
  closeButton.style.lineHeight = '1';
  closeButton.style.padding = '2px';
  closeButton.style.marginLeft = '4px';
  closeButton.style.transition = 'color 0.2s ease';
  closeButton.addEventListener('mouseenter', () => {
    closeButton.style.color = '#f8fafc';
  });
  closeButton.addEventListener('mouseleave', () => {
    closeButton.style.color = '#94a3b8';
  });

  closeButton.addEventListener('click', () => {
    removeToast(toastId);
  });

  toast.append(accent, content, closeButton);
  container.append(toast);

  requestAnimationFrame(() => {
    toast.style.opacity = '1';
    toast.style.transform = 'translateY(0)';
  });

  const safeDuration = Number.isFinite(duration) ? Math.max(2000, duration) : 4000;
  const timeoutId = window.setTimeout(() => {
    removeToast(toastId);
  }, safeDuration);

  toast.dataset.dismissDelay = '200';
  activeToasts.set(toastId, { element: toast, timeoutId });
}

registerIntentHandler(INTENT_TYPES.SHOW_TOAST, showToast);

let currentTab =
  tabButtons.find((button) => button.classList.contains('active'))?.dataset.tab ||
  tabOrder[0];
let consoleIndicator;
let pendingAutoSwitch = false;

function applyActiveTab(targetTab) {
  if (typeof targetTab !== 'string') {
    return;
  }
  const normalizedTarget = targetTab.toLowerCase();
  if (!tabOrder.includes(normalizedTarget)) {
    return;
  }

  tabButtons.forEach((button) => {
    const isActive = button.dataset.tab === normalizedTarget;
    button.classList.toggle('active', isActive);
  });

  tabPanels.forEach((panel) => {
    const isActive = panel.dataset.tab === normalizedTarget;
    panel.classList.toggle('active', isActive);
  });

  currentTab = normalizedTarget;
  if (normalizedTarget === 'console') {
    dispatchIntent({
      type: INTENT_TYPES.APP_STATUS,
      payload: { channel: 'console-indicator', visible: false },
    });
    pendingAutoSwitch = false;
  }
}

registerIntentHandler(INTENT_TYPES.NAVIGATE_TAB, (payload = {}) => {
  const target =
    typeof payload.tab === 'string' ? payload.tab.toLowerCase() : undefined;
  if (!target) {
    return;
  }
  applyActiveTab(target);
});

if (consoleTabButton) {
  consoleTabButton.style.display = 'inline-flex';
  consoleTabButton.style.alignItems = 'center';
  consoleTabButton.style.justifyContent = 'center';

  consoleIndicator = document.createElement('span');
  consoleIndicator.textContent = '•';
  consoleIndicator.setAttribute('aria-hidden', 'true');
  consoleIndicator.style.marginLeft = '4px';
  consoleIndicator.style.fontSize = '10px';
  consoleIndicator.style.color = '#22d3ee';
  consoleIndicator.style.opacity = '0';
  consoleIndicator.style.transition = 'opacity 0.2s ease';
  consoleIndicator.style.pointerEvents = 'none';
  consoleTabButton.append(consoleIndicator);
}

tabButtons.forEach((button) => {
  button.addEventListener('click', () => {
    const targetTab = button.dataset.tab;
    dispatchIntent({
      type: INTENT_TYPES.NAVIGATE_TAB,
      payload: { tab: targetTab },
    });
  });
});

function tabFromShortcutKey(key) {
  const numericKey = Number.parseInt(key, 10);
  if (Number.isNaN(numericKey)) {
    return null;
  }

  const index = numericKey - 1;
  if (index >= 0 && index < tabOrder.length) {
    return tabOrder[index];
  }
  return null;
}

const paletteOverlay = document.createElement('div');
paletteOverlay.className = 'command-palette-overlay';
paletteOverlay.setAttribute('aria-hidden', 'true');
paletteOverlay.hidden = true;

const paletteDialog = document.createElement('div');
paletteDialog.className = 'command-palette';
paletteDialog.setAttribute('role', 'dialog');
paletteDialog.setAttribute('aria-modal', 'true');

const paletteTitle = document.createElement('h2');
paletteTitle.className = 'command-palette-title';
paletteTitle.textContent = 'Command Palette';

const paletteList = document.createElement('ul');
paletteList.className = 'command-palette-actions';

const paletteActions = [
  { label: 'Go to Calendar', tab: 'calendar' },
  { label: 'Go to Config', tab: 'config' },
  { label: 'Go to Console', tab: 'console' },
  { label: 'Go to JSON', tab: 'json' },
  { label: 'Go to Fixtures', tab: 'fixtures' },
  { label: 'Go to Logs', tab: 'logs' },
  { label: 'Reload Runtime', disabled: true }
];

paletteActions.forEach((action) => {
  const item = document.createElement('li');
  item.className = 'command-palette-item';

  const button = document.createElement('button');
  button.type = 'button';
  button.className = 'command-palette-action';
  button.textContent = action.label;

  if (action.disabled) {
    button.disabled = true;
    button.setAttribute('aria-disabled', 'true');
  } else if (action.tab) {
    button.addEventListener('click', () => {
      dispatchIntent({
        type: INTENT_TYPES.NAVIGATE_TAB,
        payload: { tab: action.tab },
      });
      closePalette();
    });
  }

  item.append(button);
  paletteList.append(item);
});

paletteDialog.append(paletteTitle, paletteList);
paletteOverlay.append(paletteDialog);
document.body.append(paletteOverlay);

let isPaletteOpen = false;
let lastFocusedElement = null;

function openPalette() {
  if (isPaletteOpen) return;
  isPaletteOpen = true;
  lastFocusedElement = document.activeElement instanceof HTMLElement ? document.activeElement : null;
  paletteOverlay.hidden = false;
  paletteOverlay.classList.add('open');
  paletteOverlay.setAttribute('aria-hidden', 'false');

  const firstAction = paletteOverlay.querySelector('.command-palette-action:not([disabled])');
  if (firstAction) {
    firstAction.focus();
  }
}

function closePalette() {
  if (!isPaletteOpen) return;
  isPaletteOpen = false;
  paletteOverlay.classList.remove('open');
  paletteOverlay.setAttribute('aria-hidden', 'true');
  paletteOverlay.hidden = true;

  if (lastFocusedElement && typeof lastFocusedElement.focus === 'function') {
    lastFocusedElement.focus();
  }
}

paletteOverlay.addEventListener('click', (event) => {
  if (event.target === paletteOverlay) {
    closePalette();
  }
});

document.addEventListener('keydown', (event) => {
  const key = event.key;
  const hasModifier = event.ctrlKey || event.metaKey;

  if (hasModifier && !event.altKey && !event.shiftKey) {
    if (key.toLowerCase() === 'k') {
      if (event.repeat) {
        event.preventDefault();
        return;
      }
      event.preventDefault();
      if (isPaletteOpen) {
        closePalette();
      } else {
        openPalette();
      }
      return;
    }

    const targetTab = tabFromShortcutKey(key);
    if (targetTab) {
      if (event.repeat) {
        event.preventDefault();
        return;
      }
      event.preventDefault();
      dispatchIntent({
        type: INTENT_TYPES.NAVIGATE_TAB,
        payload: { tab: targetTab },
      });
      if (isPaletteOpen) {
        closePalette();
      }
      return;
    }
  }

  if (key === 'Escape' && isPaletteOpen) {
    event.preventDefault();
    closePalette();
  }
});

const configPanel = document.getElementById('config-panel');
const consolePanel = document.querySelector('.tab-panel[data-tab="console"]');
const jsonPanel = document.querySelector('.tab-panel[data-tab="json"]');
const fixturesPanel = document.querySelector('.tab-panel[data-tab="fixtures"]');
const logsPanel = document.querySelector('.tab-panel[data-tab="logs"]');

const defaultStdoutMessage = 'Program output will appear here.';
const defaultStderrMessage = 'Error output will appear here.';

let stdoutOutput;
let stderrOutput;
let initializeRuntimeButton;
let generateButton;
let runtimeReady = false;
let runtimeLoadingPromise;
let runtimeStatus = 'idle';
let hasShownRuntimeReadyToast = false;

let pyWorker;
try {
  pyWorker = new Worker('workers/pyRunner.js', { type: 'module' });
} catch (error) {
  console.error('Failed to initialize runtime worker:', error);
}

let workerMessageId = 0;
const workerPendingRequests = new Map();

if (pyWorker) {
  pyWorker.addEventListener('message', (event) => {
    const { data } = event;
    if (!data || typeof data.id === 'undefined') {
      return;
    }
    const pending = workerPendingRequests.get(data.id);
    if (!pending) {
      return;
    }
    workerPendingRequests.delete(data.id);
    const { resolve, reject } = pending;
    const { ok, id, ...rest } = data;
    if (ok) {
      resolve(rest);
    } else {
      reject(rest);
    }
  });

  pyWorker.addEventListener('error', (event) => {
    const message = event?.message || 'Unexpected runtime worker error.';
    workerPendingRequests.forEach(({ reject }) => {
      reject({ error: message, stdout: '', stderr: message });
    });
    workerPendingRequests.clear();
  });

  pyWorker.addEventListener('messageerror', () => {
    workerPendingRequests.forEach(({ reject }) => {
      reject({ error: 'Failed to decode message from runtime worker.' });
    });
    workerPendingRequests.clear();
  });
}

function sendWorkerMessage(type, payload = {}) {
  if (!pyWorker) {
    return Promise.reject({ error: 'Runtime worker unavailable.' });
  }
  workerMessageId += 1;
  const id = workerMessageId;
  const message = { id, type, ...payload };
  return new Promise((resolve, reject) => {
    workerPendingRequests.set(id, { resolve, reject });
    try {
      pyWorker.postMessage(message);
    } catch (error) {
      workerPendingRequests.delete(id);
      reject({
        error: error?.message || 'Unable to communicate with runtime worker.',
      });
    }
  });
}

function styleRuntimeButton(button) {
  if (!button) {
    return;
  }
  button.style.background = '#1f2128';
  button.style.border = '1px solid #2a2d35';
  button.style.borderRadius = '4px';
  button.style.color = '#cbd0df';
  button.style.padding = '6px 12px';
  button.style.fontSize = '12px';
  button.style.letterSpacing = '0.02em';
  button.style.fontWeight = '600';
  button.style.transition = 'background 0.2s ease, color 0.2s ease, opacity 0.2s ease';
  button.style.cursor = button.disabled ? 'not-allowed' : 'pointer';
  updateRuntimeButtonState(button);
}

function updateRuntimeButtonState(button) {
  if (!button) {
    return;
  }
  button.style.opacity = button.disabled ? '0.6' : '1';
  button.style.cursor = button.disabled ? 'not-allowed' : 'pointer';
  if (button.disabled) {
    button.style.background = '#1f2128';
    button.style.color = '#cbd0df';
  }
}

function applyConsoleIndicatorVisible(isVisible) {
  if (!consoleIndicator) {
    return;
  }
  consoleIndicator.style.opacity = isVisible ? '1' : '0';
}

function beginConsoleRun(message) {
  pendingAutoSwitch = true;
  if (stdoutOutput) {
    stdoutOutput.textContent = message;
  }
  if (stderrOutput) {
    stderrOutput.textContent = defaultStderrMessage;
  }
  if (currentTab === 'console') {
    dispatchIntent({
      type: INTENT_TYPES.APP_STATUS,
      payload: { channel: 'console-indicator', visible: false },
    });
  }
}

function renderConsoleOutputs({ stdout, stderr }) {
  if (stdoutOutput) {
    const stdoutText = typeof stdout === 'string' && stdout ? stdout : '';
    stdoutOutput.textContent = stdoutText || defaultStdoutMessage;
    stdoutOutput.scrollTop = stdoutOutput.scrollHeight;
  }
  if (stderrOutput) {
    const stderrText = typeof stderr === 'string' && stderr ? stderr : '';
    stderrOutput.textContent = stderrText || defaultStderrMessage;
    stderrOutput.scrollTop = stderrOutput.scrollHeight;
  }

  if (currentTab !== 'console') {
    const hasOutput = Boolean(stdout) || Boolean(stderr);
    dispatchIntent({
      type: INTENT_TYPES.APP_STATUS,
      payload: { channel: 'console-indicator', visible: hasOutput },
    });
  }

  if ((stdout && stdout.length > 0) || (stderr && stderr.length > 0)) {
    if (pendingAutoSwitch && currentTab !== 'console') {
      dispatchIntent({
        type: INTENT_TYPES.NAVIGATE_TAB,
        payload: { tab: 'console' },
      });
    }
  }
  pendingAutoSwitch = false;
}

async function ensureRuntimeLoaded() {
  if (runtimeReady) {
    return;
  }
  if (!runtimeLoadingPromise) {
    dispatchIntent({
      type: INTENT_TYPES.APP_STATUS,
      payload: { channel: 'runtime', status: 'loading' },
    });
    runtimeLoadingPromise = sendWorkerMessage('load')
      .then((result) => {
        dispatchIntent({
          type: INTENT_TYPES.APP_STATUS,
          payload: { channel: 'runtime', status: 'ready' },
        });
        return result;
      })
      .catch((error) => {
        dispatchIntent({
          type: INTENT_TYPES.APP_STATUS,
          payload: { channel: 'runtime', status: 'error', error },
        });
        throw error;
      })
      .finally(() => {
        runtimeLoadingPromise = undefined;
      });
  }
  return runtimeLoadingPromise;
}

registerIntentHandler(INTENT_TYPES.APP_STATUS, (payload = {}) => {
  const channel = payload.channel;
  if (channel === 'console-indicator') {
    applyConsoleIndicatorVisible(Boolean(payload.visible));
    return;
  }

  if (channel === 'runtime') {
    const status = typeof payload.status === 'string' ? payload.status : '';
    if (!status) {
      return;
    }
    const previousStatus = runtimeStatus;
    if (status === 'ready') {
      runtimeReady = true;
      if (!hasShownRuntimeReadyToast || previousStatus !== 'ready') {
        dispatchIntent({
          type: INTENT_TYPES.SHOW_TOAST,
          payload: {
            message: payload.message || 'Runtime ready',
            intent: 'success',
            duration: 3200,
          },
        });
        hasShownRuntimeReadyToast = true;
      }
    } else if (status === 'loading') {
      runtimeReady = false;
    } else if (status === 'error') {
      runtimeReady = false;
      hasShownRuntimeReadyToast = false;
    }
    runtimeStatus = status;
  }
});

function handleRuntimeLoadSuccess() {
  if (initializeRuntimeButton) {
    initializeRuntimeButton.textContent = 'Runtime Ready';
    initializeRuntimeButton.disabled = true;
    updateRuntimeButtonState(initializeRuntimeButton);
  }
  if (generateButton) {
    generateButton.disabled = false;
    updateRuntimeButtonState(generateButton);
  }
}

function handleRuntimeLoadFailure(error) {
  if (initializeRuntimeButton) {
    initializeRuntimeButton.textContent = 'Initialize Runtime';
    initializeRuntimeButton.disabled = false;
    updateRuntimeButtonState(initializeRuntimeButton);
  }
  if (generateButton && !runtimeReady) {
    generateButton.disabled = true;
    updateRuntimeButtonState(generateButton);
  }
  hasShownRuntimeReadyToast = false;
  const stderrMessage =
    typeof error?.stderr === 'string' && error.stderr
      ? error.stderr
      : error?.error || 'Failed to initialize Pyodide runtime.';
  renderConsoleOutputs({ stdout: error?.stdout || '', stderr: stderrMessage });
  const toastDescription =
    typeof error?.error === 'string' && error.error !== stderrMessage
      ? error.error
      : stderrMessage;
  dispatchIntent({
    type: INTENT_TYPES.SHOW_TOAST,
    payload: {
      message: 'Runtime error',
      description: toastDescription,
      intent: 'error',
      duration: 6000,
    },
  });
}

if (configPanel && configPanel.dataset.hydrated !== '1') {
  const CLASS_STORAGE_KEY = 'config.class';
  const VARIANT_STORAGE_KEY = 'config.variant';
  const RIG_STORAGE_PREFIX = 'config.rig.';
  const LEGACY_RIG_STORAGE_KEY = 'config.rig';
  const CALENDAR_COMMON_STORAGE_KEY = 'cfg.calendar.common';
  const CALENDAR_MK2_CALENDAR_STORAGE_KEY = 'cfg.calendar.mk2.calendar';
  const CALENDAR_MK2_WORKFORCE_STORAGE_KEY = 'cfg.calendar.mk2.workforce';
  const MK2_WORKFORCE_DEFAULT_TEXT =
    '{"hours":{"work":1800,"sleep":2800,"caregiving":250,"vacation":120,"sick":40}}';
  const VALID_ARCHETYPES = new Set(['Office', 'Parent', 'Freelancer']);

  const summaryLabels = {
    class: 'Class',
    variant: 'Variant',
    rig: 'Rig',
    archetype: 'Archetype',
    weekStart: 'Week Start',
    seed: 'Seed',
  };

  const configActions = configPanel.querySelector('.config-actions');
  if (configActions) {
    initializeRuntimeButton =
      configActions.querySelector('[data-config-action="initialize-runtime"]') ||
      configActions.querySelector('.secondary-action');
    generateButton =
      configActions.querySelector('[data-config-action="generate-runtime"]') ||
      configActions.querySelector('.primary-action');
  }

  const classTabBar = configPanel.querySelector('[data-config="class-tabs"]');
  const classButtons = classTabBar
    ? Array.from(classTabBar.querySelectorAll('button[data-class]'))
    : [];

  const classPanels = new Map();
  configPanel.querySelectorAll('[data-class-panel]').forEach((panel) => {
    const classId = panel.dataset.classPanel;
    if (classId) {
      classPanels.set(classId, panel);
    }
  });

  const calendarPanel = classPanels.get('calendar');
  const variantTabBar = calendarPanel
    ? calendarPanel.querySelector('[data-calendar="variant-tabs"]')
    : null;
  const variantButtons = variantTabBar
    ? Array.from(variantTabBar.querySelectorAll('button[data-variant]'))
    : [];

  const variantPanels = new Map();
  const rigTabsByVariant = new Map();
  const rigButtonsByVariant = new Map();
  const rigPanels = new Map();

  if (calendarPanel) {
    calendarPanel.querySelectorAll('[data-variant-panel]').forEach((panel) => {
      const variantId = panel.dataset.variantPanel;
      if (!variantId) {
        return;
      }
      variantPanels.set(variantId, panel);
      const rigTabRow = panel.querySelector(`[data-rig-tabs="${variantId}"]`);
      if (rigTabRow) {
        rigTabsByVariant.set(variantId, rigTabRow);
        const rigButtons = Array.from(rigTabRow.querySelectorAll('button[data-rig]'));
        if (rigButtons.length > 0) {
          rigButtonsByVariant.set(variantId, rigButtons);
        }
      }
      panel.querySelectorAll('[data-panel]').forEach((contentPanel) => {
        const panelKey = contentPanel.dataset.panel;
        if (panelKey) {
          rigPanels.set(panelKey, contentPanel);
        }
      });
    });
  }

  const calendarCommonSection = calendarPanel
    ? calendarPanel.querySelector('[data-calendar="common"]')
    : null;
  const archetypeSelect = calendarCommonSection?.querySelector('#cal-arch') || null;
  const weekStartInput = calendarCommonSection?.querySelector('#cal-week') || null;
  const seedInput = calendarCommonSection?.querySelector('#cal-seed') || null;
  const seedResetButton = calendarCommonSection?.querySelector('#seed-reset') || null;
  const seedRandomButton = calendarCommonSection?.querySelector('#seed-random') || null;

  const mk2CalendarCompressToggle = calendarPanel?.querySelector('#mk2cal-compress') || null;
  const mk2CalendarConflictsToggle = calendarPanel?.querySelector('#mk2cal-conflicts') || null;
  const mk2WorkforceTextarea = calendarPanel?.querySelector('#mk2wf-budget') || null;
  const mk2WorkforceDefaultButton = calendarPanel?.querySelector('#mk2wf-default') || null;
  const mk2WorkforceValidateButton = calendarPanel?.querySelector('#mk2wf-validate') || null;

  const variantRigs = {};
  const defaultRigByVariant = {};
  rigButtonsByVariant.forEach((buttons, variantId) => {
    const rigs = buttons
      .map((button) => button.dataset.rig)
      .filter((rig) => typeof rig === 'string' && rig.length > 0);
    if (rigs.length === 0) {
      return;
    }
    variantRigs[variantId] = rigs;
    const defaultButton =
      buttons.find((button) => button.classList.contains('active')) || buttons[0];
    if (defaultButton && defaultButton.dataset.rig) {
      defaultRigByVariant[variantId] = defaultButton.dataset.rig;
    }
  });

  const variantIds = Object.keys(variantRigs);
  const defaultVariantButton =
    variantButtons.find((button) => button.classList.contains('active')) ||
    variantButtons[0];
  let defaultVariant = defaultVariantButton?.dataset.variant;
  if (!defaultVariant || !variantRigs[defaultVariant]) {
    defaultVariant = variantIds[0];
  }
  if (!defaultVariant) {
    defaultVariant = 'mk1';
  }

  const classVariantMap = new Map();
  classVariantMap.set('calendar', variantIds);

  const defaultVariantByClass = new Map();
  if (variantIds.length > 0 && defaultVariant && variantRigs[defaultVariant]) {
    defaultVariantByClass.set('calendar', defaultVariant);
  }

  const summaryRoot = configPanel.querySelector('[data-config-summary]');
  const summaryChips = new Map();
  if (summaryRoot) {
    summaryRoot.querySelectorAll('[data-config-chip]').forEach((chip) => {
      const key = chip.dataset.configChip;
      if (key) {
        summaryChips.set(key, chip);
      }
    });
  }

  const cfg = {
    class: 'calendar',
    variant: defaultVariant,
    rig: {},
    archetype: '',
    weekStart: '',
    seed: '',
  };

  const calendarConfig = {
    common: {
      archetype: 'Office',
      weekStart: currentMondayISO(),
      seed: '',
    },
    mk2: {
      calendar: { compress: false, conflicts: false },
      workforce: { budgetText: '' },
    },
  };

  let commonSeedUserEdited = false;
  let shouldPersistInitialCommon = false;

  const isoDatePattern = /^\d{4}-\d{2}-\d{2}$/;

  const readStorageValue = (key) => {
    try {
      const stored = localStorage.getItem(key);
      return typeof stored === 'string' && stored ? stored : undefined;
    } catch (error) {
      console.warn(`Unable to read stored value for ${key}:`, error);
      return undefined;
    }
  };

  const persistStorageValue = (key, value) => {
    if (typeof value !== 'string' || !value) {
      return;
    }
    try {
      localStorage.setItem(key, value);
    } catch (error) {
      console.warn(`Unable to persist value for ${key}:`, error);
    }
  };

  const readJsonStorage = (key) => {
    const raw = readStorageValue(key);
    if (typeof raw !== 'string' || raw.length === 0) {
      return undefined;
    }
    try {
      return JSON.parse(raw);
    } catch (error) {
      console.warn(`Unable to parse stored value for ${key}:`, error);
      return undefined;
    }
  };

  const persistJsonStorage = (key, value) => {
    if (!key) {
      return;
    }
    try {
      localStorage.setItem(key, JSON.stringify(value));
    } catch (error) {
      console.warn(`Unable to persist JSON value for ${key}:`, error);
    }
  };

  const storedCommon = readJsonStorage(CALENDAR_COMMON_STORAGE_KEY);
  if (storedCommon) {
    if (
      typeof storedCommon.archetype === 'string' &&
      VALID_ARCHETYPES.has(storedCommon.archetype)
    ) {
      calendarConfig.common.archetype = storedCommon.archetype;
    }
    if (
      typeof storedCommon.weekStart === 'string' &&
      isoDatePattern.test(storedCommon.weekStart)
    ) {
      calendarConfig.common.weekStart = storedCommon.weekStart;
    }
    if (typeof storedCommon.seed === 'number') {
      calendarConfig.common.seed = String(storedCommon.seed);
      commonSeedUserEdited = true;
    } else if (
      typeof storedCommon.seed === 'string' &&
      storedCommon.seed.trim().length > 0
    ) {
      const parsedSeed = Number.parseInt(storedCommon.seed, 10);
      if (Number.isFinite(parsedSeed)) {
        calendarConfig.common.seed = String(parsedSeed);
        commonSeedUserEdited = true;
      }
    }
  }
  shouldPersistInitialCommon = !storedCommon;

  const storedMk2Calendar = readJsonStorage(CALENDAR_MK2_CALENDAR_STORAGE_KEY);
  if (storedMk2Calendar) {
    calendarConfig.mk2.calendar.compress = Boolean(storedMk2Calendar.compress);
    calendarConfig.mk2.calendar.conflicts = Boolean(storedMk2Calendar.conflicts);
  }

  const storedMk2Workforce = readJsonStorage(CALENDAR_MK2_WORKFORCE_STORAGE_KEY);
  if (storedMk2Workforce && typeof storedMk2Workforce.budgetText === 'string') {
    calendarConfig.mk2.workforce.budgetText = storedMk2Workforce.budgetText;
  }

  variantIds.forEach((variantId) => {
    const defaultRig = defaultRigByVariant[variantId] || variantRigs[variantId]?.[0];
    if (defaultRig) {
      cfg.rig[variantId] = defaultRig;
    }
  });

  const storedClass = readStorageValue(CLASS_STORAGE_KEY);
  if (storedClass && classPanels.has(storedClass)) {
    cfg.class = storedClass;
  } else if (classButtons[0]?.dataset.class) {
    cfg.class = classButtons[0].dataset.class;
  }

  const storedVariant = readStorageValue(VARIANT_STORAGE_KEY);
  if (storedVariant && variantRigs[storedVariant]) {
    cfg.variant = storedVariant;
  }

  const legacyRig = readStorageValue(LEGACY_RIG_STORAGE_KEY);
  variantIds.forEach((variantId) => {
    const storedRig = readStorageValue(`${RIG_STORAGE_PREFIX}${variantId}`);
    if (storedRig && variantRigs[variantId]?.includes(storedRig)) {
      cfg.rig[variantId] = storedRig;
      return;
    }
    if (
      variantId === cfg.variant &&
      legacyRig &&
      variantRigs[variantId]?.includes(legacyRig)
    ) {
      cfg.rig[variantId] = legacyRig;
    }
  });

  const renderSummaryChips = () => {
    if (summaryChips.size === 0) {
      return;
    }
    const activeRig = cfg.rig[cfg.variant] || '';
    const values = {
      class: cfg.class || '',
      variant: cfg.variant || '',
      rig: activeRig || '',
      archetype: cfg.archetype || '',
      weekStart: cfg.weekStart || '',
      seed: cfg.seed || '',
    };
    Object.entries(values).forEach(([key, value]) => {
      const chip = summaryChips.get(key);
      if (!chip) {
        return;
      }
      const label = summaryLabels[key] || key;
      const displayValue = value ? String(value) : '—';
      chip.textContent = `${label}: ${displayValue}`;
    });
  };

  const syncCommonStateToChips = () => {
    cfg.archetype = calendarConfig.common.archetype || '';
    cfg.weekStart = calendarConfig.common.weekStart || '';
    cfg.seed = calendarConfig.common.seed ? String(calendarConfig.common.seed) : '';
    renderSummaryChips();
  };

  const computeDeterministicSeed = () => {
    const activeVariant = cfg.variant || '';
    const activeRig = cfg.rig[activeVariant] || '';
    const weekStartValue = calendarConfig.common.weekStart || currentMondayISO();
    return String(deterministicSeed(`${activeVariant}:${activeRig}:${weekStartValue}`));
  };

  const syncCommonInputs = () => {
    if (archetypeSelect) {
      const target = calendarConfig.common.archetype || 'Office';
      if (VALID_ARCHETYPES.has(target)) {
        archetypeSelect.value = target;
      } else {
        archetypeSelect.value = 'Office';
      }
    }
    if (weekStartInput) {
      weekStartInput.value = calendarConfig.common.weekStart || currentMondayISO();
    }
    if (seedInput) {
      seedInput.value = calendarConfig.common.seed || computeDeterministicSeed();
    }
  };

  const persistCalendarCommon = () => {
    shouldPersistInitialCommon = false;
    const numericSeed = Number.parseInt(calendarConfig.common.seed, 10);
    const payload = {
      archetype: calendarConfig.common.archetype,
      weekStart: calendarConfig.common.weekStart,
      seed: Number.isFinite(numericSeed) ? numericSeed : calendarConfig.common.seed,
    };
    persistJsonStorage(CALENDAR_COMMON_STORAGE_KEY, payload);
  };

  const persistCalendarMk2Calendar = () => {
    persistJsonStorage(CALENDAR_MK2_CALENDAR_STORAGE_KEY, {
      compress: Boolean(calendarConfig.mk2.calendar.compress),
      conflicts: Boolean(calendarConfig.mk2.calendar.conflicts),
    });
  };

  const persistCalendarMk2Workforce = () => {
    persistJsonStorage(CALENDAR_MK2_WORKFORCE_STORAGE_KEY, {
      budgetText: calendarConfig.mk2.workforce.budgetText || '',
    });
  };

  const syncMk2CalendarControls = () => {
    if (mk2CalendarCompressToggle) {
      mk2CalendarCompressToggle.checked = Boolean(calendarConfig.mk2.calendar.compress);
    }
    if (mk2CalendarConflictsToggle) {
      mk2CalendarConflictsToggle.checked = Boolean(calendarConfig.mk2.calendar.conflicts);
    }
  };

  const syncMk2WorkforceControls = () => {
    if (mk2WorkforceTextarea) {
      mk2WorkforceTextarea.value = calendarConfig.mk2.workforce.budgetText || '';
    }
  };

  const updateDerivedFromFoundation = ({ persistCommon = false } = {}) => {
    if (cfg.class !== 'calendar') {
      cfg.archetype = '';
      cfg.weekStart = '';
      cfg.seed = '';
      renderSummaryChips();
      return;
    }
    if (!VALID_ARCHETYPES.has(calendarConfig.common.archetype)) {
      calendarConfig.common.archetype = 'Office';
    }
    if (!calendarConfig.common.weekStart || !isoDatePattern.test(calendarConfig.common.weekStart)) {
      calendarConfig.common.weekStart = currentMondayISO();
    }
    if (!calendarConfig.common.seed || !commonSeedUserEdited) {
      calendarConfig.common.seed = computeDeterministicSeed();
      commonSeedUserEdited = false;
    }
    syncCommonInputs();
    syncCommonStateToChips();
    if (persistCommon || shouldPersistInitialCommon) {
      persistCalendarCommon();
    }
  };

  syncCommonInputs();
  syncMk2CalendarControls();
  syncMk2WorkforceControls();

  if (archetypeSelect) {
    archetypeSelect.addEventListener('change', () => {
      const value = archetypeSelect.value;
      if (!VALID_ARCHETYPES.has(value)) {
        calendarConfig.common.archetype = 'Office';
        archetypeSelect.value = 'Office';
      } else {
        calendarConfig.common.archetype = value;
      }
      persistCalendarCommon();
      updateDerivedFromFoundation();
    });
  }

  if (weekStartInput) {
    weekStartInput.addEventListener('change', () => {
      const value = weekStartInput.value;
      if (value && isoDatePattern.test(value)) {
        calendarConfig.common.weekStart = value;
      } else {
        const fallback = currentMondayISO();
        calendarConfig.common.weekStart = fallback;
        weekStartInput.value = fallback;
      }
      if (!commonSeedUserEdited) {
        calendarConfig.common.seed = computeDeterministicSeed();
      }
      persistCalendarCommon();
      updateDerivedFromFoundation();
    });
  }

  if (seedInput) {
    seedInput.addEventListener('change', () => {
      const value = seedInput.value.trim();
      if (!value) {
        commonSeedUserEdited = false;
        calendarConfig.common.seed = computeDeterministicSeed();
        seedInput.value = calendarConfig.common.seed;
      } else {
        const numericSeed = Number.parseInt(value, 10);
        if (!Number.isFinite(numericSeed)) {
          seedInput.value = calendarConfig.common.seed || computeDeterministicSeed();
          return;
        }
        calendarConfig.common.seed = String(numericSeed);
        commonSeedUserEdited = true;
      }
      persistCalendarCommon();
      updateDerivedFromFoundation();
    });
  }

  if (seedResetButton) {
    seedResetButton.addEventListener('click', () => {
      commonSeedUserEdited = false;
      calendarConfig.common.seed = computeDeterministicSeed();
      persistCalendarCommon();
      updateDerivedFromFoundation();
    });
  }

  if (seedRandomButton) {
    seedRandomButton.addEventListener('click', () => {
      const randomSeed = Math.floor(Math.random() * 1_000_000_000);
      calendarConfig.common.seed = String(randomSeed);
      commonSeedUserEdited = true;
      persistCalendarCommon();
      updateDerivedFromFoundation();
    });
  }

  if (mk2CalendarCompressToggle) {
    mk2CalendarCompressToggle.addEventListener('change', () => {
      calendarConfig.mk2.calendar.compress = mk2CalendarCompressToggle.checked;
      persistCalendarMk2Calendar();
    });
  }

  if (mk2CalendarConflictsToggle) {
    mk2CalendarConflictsToggle.addEventListener('change', () => {
      calendarConfig.mk2.calendar.conflicts = mk2CalendarConflictsToggle.checked;
      persistCalendarMk2Calendar();
    });
  }

  if (mk2WorkforceTextarea) {
    mk2WorkforceTextarea.addEventListener('input', () => {
      calendarConfig.mk2.workforce.budgetText = mk2WorkforceTextarea.value;
      persistCalendarMk2Workforce();
    });
  }

  if (mk2WorkforceDefaultButton) {
    mk2WorkforceDefaultButton.addEventListener('click', () => {
      if (mk2WorkforceTextarea) {
        mk2WorkforceTextarea.value = MK2_WORKFORCE_DEFAULT_TEXT;
      }
      calendarConfig.mk2.workforce.budgetText = MK2_WORKFORCE_DEFAULT_TEXT;
      persistCalendarMk2Workforce();
      syncMk2WorkforceControls();
    });
  }

  if (mk2WorkforceValidateButton) {
    mk2WorkforceValidateButton.addEventListener('click', () => {
      const raw = mk2WorkforceTextarea?.value ?? '';
      try {
        JSON.parse(raw);
        dispatchIntent({
          type: INTENT_TYPES.SHOW_TOAST,
          payload: {
            message: 'Workforce budget valid',
            intent: 'success',
            duration: 2400,
          },
        });
      } catch (error) {
        const description =
          error instanceof Error ? error.message : 'Unable to parse JSON input.';
        dispatchIntent({
          type: INTENT_TYPES.SHOW_TOAST,
          payload: {
            message: 'Invalid workforce budget',
            description,
            intent: 'error',
            duration: 5000,
          },
        });
      }
    });
  }

  const syncClassUI = () => {
    classButtons.forEach((button) => {
      const isActive = button.dataset.class === cfg.class;
      button.classList.toggle('active', isActive);
      button.dataset.active = isActive ? '1' : '0';
      button.setAttribute('aria-pressed', isActive ? 'true' : 'false');
    });
    classPanels.forEach((panel, classId) => {
      const isActive = classId === cfg.class;
      panel.hidden = !isActive;
      panel.classList.toggle('active', isActive);
    });
  };

  const syncVariantUI = () => {
    variantButtons.forEach((button) => {
      const isActive = button.dataset.variant === cfg.variant;
      button.classList.toggle('active', isActive);
      button.dataset.active = isActive ? '1' : '0';
      button.setAttribute('aria-pressed', isActive ? 'true' : 'false');
    });
    variantPanels.forEach((panel, variantId) => {
      const isActive = variantId === cfg.variant;
      panel.hidden = !isActive;
      panel.classList.toggle('active', isActive);
    });
    rigTabsByVariant.forEach((row, variantId) => {
      const isActive = variantId === cfg.variant;
      row.hidden = !isActive;
      row.dataset.active = isActive ? '1' : '0';
    });
  };

  const syncRigUI = () => {
    rigButtonsByVariant.forEach((buttons, variantId) => {
      buttons.forEach((button) => {
        const isActive =
          variantId === cfg.variant && button.dataset.rig === cfg.rig[variantId];
        button.classList.toggle('active', isActive);
        button.dataset.active = isActive ? '1' : '0';
        button.setAttribute('aria-pressed', isActive ? 'true' : 'false');
      });
    });
  };

  const syncRigPanels = () => {
    const activeVariant = cfg.variant;
    const activeRig = cfg.rig[activeVariant];
    const targetKey = activeVariant && activeRig ? `${activeVariant}:${activeRig}` : '';
    rigPanels.forEach((panel, panelKey) => {
      const isActive = panelKey === targetKey;
      panel.classList.toggle('active', isActive);
      panel.hidden = !isActive;
    });
  };

  const rigStorageKey = (variantId) => `${RIG_STORAGE_PREFIX}${variantId}`;

  const applyRig = (variantId, rigId, { updateStorage = true } = {}) => {
    const rigs = variantRigs[variantId] || [];
    if (!rigs.includes(rigId)) {
      return;
    }
    cfg.rig[variantId] = rigId;
    if (variantId === cfg.variant) {
      syncRigUI();
      syncRigPanels();
      updateDerivedFromFoundation({ persistCommon: !commonSeedUserEdited });
    }
    if (updateStorage) {
      persistStorageValue(rigStorageKey(variantId), rigId);
    }
  };

  const applyVariant = (variantId, { updateStorage = true } = {}) => {
    if (!variantRigs[variantId]) {
      return;
    }
    cfg.variant = variantId;
    const rigs = variantRigs[variantId];
    const currentRig = cfg.rig[variantId];
    if (!rigs.includes(currentRig)) {
      const fallbackRig = defaultRigByVariant[variantId] || rigs[0];
      if (fallbackRig) {
        cfg.rig[variantId] = fallbackRig;
      }
    }
    syncVariantUI();
    syncRigUI();
    syncRigPanels();
    updateDerivedFromFoundation({
      persistCommon: !commonSeedUserEdited || shouldPersistInitialCommon,
    });
    if (updateStorage) {
      persistStorageValue(VARIANT_STORAGE_KEY, cfg.variant);
      const activeRig = cfg.rig[variantId];
      if (activeRig) {
        persistStorageValue(rigStorageKey(variantId), activeRig);
      }
    }
  };

  const applyClass = (classId, { updateStorage = true } = {}) => {
    if (!classPanels.has(classId)) {
      return;
    }
    cfg.class = classId;
    syncClassUI();
    const variants = classVariantMap.get(classId) || [];
    let targetVariant = cfg.variant;
    if (!variants.includes(targetVariant)) {
      const fallbackVariant = defaultVariantByClass.get(classId) || variants[0];
      targetVariant = fallbackVariant;
    }
    if (targetVariant && variantRigs[targetVariant]) {
      applyVariant(targetVariant, { updateStorage });
    } else {
      updateDerivedFromFoundation({
        persistCommon: !commonSeedUserEdited || shouldPersistInitialCommon,
      });
    }
    if (updateStorage) {
      persistStorageValue(CLASS_STORAGE_KEY, classId);
    }
  };

  classButtons.forEach((button) => {
    button.addEventListener('click', () => {
      const classId = button.dataset.class;
      if (classId) {
        applyClass(classId);
      }
    });
  });

  variantButtons.forEach((button) => {
    button.addEventListener('click', () => {
      const variantId = button.dataset.variant;
      if (variantId) {
        applyVariant(variantId);
      }
    });
  });

  rigButtonsByVariant.forEach((buttons, variantId) => {
    buttons.forEach((button) => {
      button.addEventListener('click', () => {
        const rigId = button.dataset.rig;
        if (!rigId) {
          return;
        }
        if (variantId !== cfg.variant) {
          applyVariant(variantId);
        }
        applyRig(variantId, rigId);
      });
    });
  });

  applyClass(cfg.class, { updateStorage: false });

  if (initializeRuntimeButton) {
    styleRuntimeButton(initializeRuntimeButton);
    initializeRuntimeButton.addEventListener('click', async () => {
      if (runtimeReady) {
        return;
      }
      initializeRuntimeButton.disabled = true;
      initializeRuntimeButton.textContent = 'Initializing…';
      if (generateButton) {
        generateButton.disabled = true;
        updateRuntimeButtonState(generateButton);
      }
      updateRuntimeButtonState(initializeRuntimeButton);
      try {
        await ensureRuntimeLoaded();
        handleRuntimeLoadSuccess();
      } catch (error) {
        handleRuntimeLoadFailure(error);
      }
    });
  }

  if (generateButton) {
    styleRuntimeButton(generateButton);
    generateButton.disabled = !runtimeReady;
    updateRuntimeButtonState(generateButton);
    generateButton.addEventListener('click', async () => {
      generateButton.disabled = true;
      generateButton.textContent = 'Generating…';
      if (initializeRuntimeButton) {
        initializeRuntimeButton.disabled = true;
        updateRuntimeButtonState(initializeRuntimeButton);
      }
      updateRuntimeButtonState(generateButton);

      try {
        await ensureRuntimeLoaded();
      } catch (error) {
        handleRuntimeLoadFailure(error);
        generateButton.textContent = 'Generate';
        updateRuntimeButtonState(generateButton);
        return;
      }

      beginConsoleRun('Running smoke test…');

      try {
        const { stdout = '', stderr = '' } = await sendWorkerMessage('runPython', {
          code: 'print("Pyodide OK")',
        });
        renderConsoleOutputs({ stdout, stderr });
        const hasErrorOutput =
          typeof stderr === 'string' && stderr.trim().length > 0;
        dispatchIntent({
          type: INTENT_TYPES.SHOW_TOAST,
          payload: {
            message: hasErrorOutput
              ? 'Smoke test completed with warnings'
              : 'Smoke test passed',
            description: hasErrorOutput ? 'Check the console output for details.' : undefined,
            intent: hasErrorOutput ? 'warning' : 'success',
            duration: hasErrorOutput ? 5000 : 2800,
          },
        });
      } catch (error) {
        const stderrMessage =
          typeof error?.stderr === 'string' && error.stderr
            ? error.stderr
            : error?.error || 'Pyodide execution failed.';
        renderConsoleOutputs({ stdout: error?.stdout || '', stderr: stderrMessage });
        dispatchIntent({
          type: INTENT_TYPES.SHOW_TOAST,
          payload: {
            message: 'Smoke test failed',
            description: stderrMessage,
            intent: 'error',
            duration: 6000,
          },
        });
      } finally {
        generateButton.disabled = false;
        generateButton.textContent = 'Generate';
        updateRuntimeButtonState(generateButton);
        if (initializeRuntimeButton && runtimeReady) {
          initializeRuntimeButton.textContent = 'Runtime Ready';
          initializeRuntimeButton.disabled = true;
          updateRuntimeButtonState(initializeRuntimeButton);
        }
      }
    });
  }

  if (initializeRuntimeButton && runtimeReady) {
    initializeRuntimeButton.textContent = 'Runtime Ready';
    initializeRuntimeButton.disabled = true;
    updateRuntimeButtonState(initializeRuntimeButton);
  }

  configPanel.dataset.hydrated = '1';
}


if (consolePanel) {
  const consoleContainer = document.createElement('div');
  consoleContainer.className = 'console-pane';

  const stdoutSection = document.createElement('section');
  stdoutSection.className = 'console-stream';

  const stdoutHeader = document.createElement('h3');
  stdoutHeader.className = 'console-stream-title';
  stdoutHeader.textContent = 'Stdout';

  stdoutOutput = document.createElement('div');
  stdoutOutput.className = 'console-output';
  stdoutOutput.textContent = defaultStdoutMessage;

  stdoutSection.append(stdoutHeader, stdoutOutput);

  const stderrSection = document.createElement('section');
  stderrSection.className = 'console-stream';

  const stderrHeader = document.createElement('h3');
  stderrHeader.className = 'console-stream-title';
  stderrHeader.textContent = 'Stderr';

  stderrOutput = document.createElement('div');
  stderrOutput.className = 'console-output';
  stderrOutput.textContent = defaultStderrMessage;

  stderrSection.append(stderrHeader, stderrOutput);

  consoleContainer.append(stdoutSection, stderrSection);
  consolePanel.append(consoleContainer);
}

if (jsonPanel) {
  const jsonContainer = document.createElement('div');
  jsonContainer.className = 'json-pane';

  const jsonToolbar = document.createElement('div');
  jsonToolbar.className = 'json-toolbar';

  const copyButton = document.createElement('button');
  copyButton.type = 'button';
  copyButton.className = 'json-copy';
  copyButton.textContent = 'Copy';

  jsonToolbar.append(copyButton);

  const jsonOutput = document.createElement('pre');
  jsonOutput.className = 'json-output';
  jsonOutput.textContent = '{\n  "data": "JSON payloads will render here."\n}';

  jsonContainer.append(jsonToolbar, jsonOutput);
  jsonPanel.append(jsonContainer);
}

if (fixturesPanel) {
  const fixturesContainer = document.createElement('div');
  fixturesContainer.className = 'fixtures-pane';

  const fixturesList = document.createElement('ul');
  fixturesList.className = 'fixtures-list';

  const placeholderItem = document.createElement('li');
  placeholderItem.textContent = 'No fixtures loaded. Add fixtures to see them listed here.';

  fixturesList.append(placeholderItem);

  const fixturesActions = document.createElement('div');
  fixturesActions.className = 'fixtures-actions';

  const loadButton = document.createElement('button');
  loadButton.type = 'button';
  loadButton.textContent = 'Load';
  loadButton.disabled = true;

  const saveButton = document.createElement('button');
  saveButton.type = 'button';
  saveButton.textContent = 'Save';
  saveButton.disabled = true;

  fixturesActions.append(loadButton, saveButton);

  fixturesContainer.append(fixturesList, fixturesActions);
  fixturesPanel.append(fixturesContainer);
}

if (logsPanel) {
  const logsContainer = document.createElement('div');
  logsContainer.className = 'logs-pane';

  const logsToolbar = document.createElement('div');
  logsToolbar.className = 'logs-toolbar';

  const clearButton = document.createElement('button');
  clearButton.type = 'button';
  clearButton.className = 'logs-clear';
  clearButton.textContent = 'Clear';

  logsToolbar.append(clearButton);

  const logsOutput = document.createElement('div');
  logsOutput.className = 'logs-output';
  logsOutput.textContent = 'Log messages will appear here as they stream in.';

  logsContainer.append(logsToolbar, logsOutput);
  logsPanel.append(logsContainer);
}
