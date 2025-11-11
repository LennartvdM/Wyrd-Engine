const tabButtons = Array.from(document.querySelectorAll('.tab'));
const tabPanels = Array.from(document.querySelectorAll('.tab-panel'));
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

const configPanel = document.querySelector('.tab-panel[data-tab="config"]');
const consolePanel = document.querySelector('.tab-panel[data-tab="console"]');
const jsonPanel = document.querySelector('.tab-panel[data-tab="json"]');
const fixturesPanel = document.querySelector('.tab-panel[data-tab="fixtures"]');
const logsPanel = document.querySelector('.tab-panel[data-tab="logs"]');

const defaultStdoutMessage = 'Program output will appear here.';
const defaultStderrMessage = 'Error output will appear here.';

let stdoutOutput;
let stderrOutput;
let initializeRuntimeButton;
let runTestButton;
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
  if (runTestButton) {
    runTestButton.disabled = false;
    updateRuntimeButtonState(runTestButton);
  }
}

function handleRuntimeLoadFailure(error) {
  if (initializeRuntimeButton) {
    initializeRuntimeButton.textContent = 'Initialize Runtime';
    initializeRuntimeButton.disabled = false;
    updateRuntimeButtonState(initializeRuntimeButton);
  }
  if (runTestButton && !runtimeReady) {
    runTestButton.disabled = true;
    updateRuntimeButtonState(runTestButton);
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

if (configPanel) {
  const accordionSections = [
    {
      id: 'mk1-engine',
      title: 'MK1 Engine',
      content: 'Configuration options for the MK1 Engine will appear here.'
    },
    {
      id: 'mk2-engine',
      title: 'MK2 Engine',
      content: 'Configuration options for the MK2 Engine will appear here.'
    },
    {
      id: 'calendar-rig',
      title: 'Calendar Rig',
      content: 'Calendar Rig settings and adjustments will be available in this section.'
    },
    {
      id: 'workforce-rig',
      title: 'Workforce Rig',
      content: 'Manage Workforce Rig parameters from this placeholder area.'
    },
    {
      id: 'yearly-budget',
      title: 'Yearly Budget',
      content: 'Budget configuration tools will live in this Yearly Budget section.'
    }
  ];

  const storageKey = 'configAccordionState';
  let accordionState = {};

  try {
    const storedState = localStorage.getItem(storageKey);
    if (storedState) {
      const parsed = JSON.parse(storedState);
      if (parsed && typeof parsed === 'object') {
        accordionState = parsed;
      }
    }
  } catch (error) {
    console.warn('Unable to read config accordion state:', error);
  }

  const accordion = document.createElement('div');
  accordion.className = 'accordion';

  accordionSections.forEach((section) => {
    const item = document.createElement('div');
    item.className = 'accordion-item';

    const header = document.createElement('button');
    header.type = 'button';
    header.className = 'accordion-header';
    header.dataset.sectionId = section.id;

    const title = document.createElement('span');
    title.className = 'accordion-title';
    title.textContent = section.title;

    const arrow = document.createElement('span');
    arrow.className = 'accordion-arrow';
    arrow.setAttribute('aria-hidden', 'true');
    arrow.textContent = '▸';

    header.append(title, arrow);

    const content = document.createElement('div');
    content.className = 'accordion-content';
    content.innerHTML = `<p>${section.content}</p>`;

    const isOpen = Boolean(accordionState[section.id]);
    item.classList.toggle('open', isOpen);
    header.setAttribute('aria-expanded', String(isOpen));
    content.hidden = !isOpen;

    header.addEventListener('click', () => {
      const nowOpen = !item.classList.contains('open');
      item.classList.toggle('open', nowOpen);
      header.setAttribute('aria-expanded', String(nowOpen));
      content.hidden = !nowOpen;

      accordionState[section.id] = nowOpen;
      try {
        localStorage.setItem(storageKey, JSON.stringify(accordionState));
      } catch (error) {
        console.warn('Unable to persist config accordion state:', error);
      }
    });

    item.append(header, content);
    accordion.append(item);
  });

  const runtimeControls = document.createElement('div');
  runtimeControls.style.display = 'flex';
  runtimeControls.style.gap = '8px';
  runtimeControls.style.marginBottom = '12px';

  initializeRuntimeButton = document.createElement('button');
  initializeRuntimeButton.type = 'button';
  initializeRuntimeButton.textContent = 'Initialize Runtime';
  styleRuntimeButton(initializeRuntimeButton);

  runTestButton = document.createElement('button');
  runTestButton.type = 'button';
  runTestButton.textContent = 'Run Test';
  runTestButton.disabled = true;
  styleRuntimeButton(runTestButton);

  runtimeControls.append(initializeRuntimeButton, runTestButton);

  initializeRuntimeButton.addEventListener('click', async () => {
    if (runtimeReady) {
      return;
    }
    initializeRuntimeButton.disabled = true;
    initializeRuntimeButton.textContent = 'Initializing…';
    runTestButton.disabled = true;
    updateRuntimeButtonState(initializeRuntimeButton);
    updateRuntimeButtonState(runTestButton);
    try {
      await ensureRuntimeLoaded();
      handleRuntimeLoadSuccess();
    } catch (error) {
      handleRuntimeLoadFailure(error);
    }
  });

  runTestButton.addEventListener('click', async () => {
    runTestButton.disabled = true;
    runTestButton.textContent = 'Running…';
    if (initializeRuntimeButton) {
      initializeRuntimeButton.disabled = true;
      updateRuntimeButtonState(initializeRuntimeButton);
    }
    updateRuntimeButtonState(runTestButton);

    try {
      await ensureRuntimeLoaded();
    } catch (error) {
      handleRuntimeLoadFailure(error);
      runTestButton.textContent = 'Run Test';
      updateRuntimeButtonState(runTestButton);
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
          message: hasErrorOutput ? 'Smoke test completed with warnings' : 'Smoke test passed',
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
      runTestButton.disabled = false;
      runTestButton.textContent = 'Run Test';
      updateRuntimeButtonState(runTestButton);
      if (initializeRuntimeButton && runtimeReady) {
        initializeRuntimeButton.textContent = 'Runtime Ready';
        initializeRuntimeButton.disabled = true;
        updateRuntimeButtonState(initializeRuntimeButton);
      }
    }
  });

  configPanel.innerHTML = '';
  configPanel.append(runtimeControls, accordion);
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
