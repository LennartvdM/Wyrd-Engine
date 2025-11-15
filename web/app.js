import { DEBUG } from './debug.js';
import {
  createRadialUrchin,
  createBalanceHistoryEntry,
  computeScheduleSignature,
  MAX_HISTORY_ROWS as BALANCE_HISTORY_LIMIT,
} from './ui/visuals/RadialUrchin.js';
import { computeSegmentTextColor } from './ui/visuals/ActivityShareBar.js';
import { formatDuration } from './ui/visuals/useUrchinLayout.js';

console.info('[app] app.js loaded');

const tabList = document.querySelector('.tab-bar[role="tablist"]');
if (tabList instanceof HTMLElement && !tabList.hasAttribute('aria-orientation')) {
  tabList.setAttribute('aria-orientation', 'horizontal');
}
const tabOrder = ['visuals', 'batch', 'config', 'console', 'json', 'fixtures', 'logs'];
let tabButtons = [];
let tabPanels = [];
let tabPanelMap = new Map();
let tabHeadings = new Map();
let consoleTabButton;
let jsonTabButton;
let fixturesTabButton;
let jsonTabBadge;
let fixturesTabBadge;

function collectRootTabElements() {
  tabButtons = Array.from(document.querySelectorAll('[data-root-tab]'));
  tabPanels = Array.from(document.querySelectorAll('[data-root-panel]'));

  tabButtons.forEach((button) => {
    const tabId = button.dataset.rootTab;
    if (tabId && !button.dataset.tab) {
      button.dataset.tab = tabId;
    }
  });

  tabPanelMap = new Map();
  tabPanels.forEach((panel) => {
    const panelId = panel.dataset.rootPanel || panel.dataset.tab;
    if (panelId) {
      const normalizedId = panelId.toLowerCase();
      tabPanelMap.set(normalizedId, panel);
      if (!panel.dataset.tab) {
        panel.dataset.tab = panelId;
      }
    }
  });

  tabHeadings = new Map();
  tabPanels.forEach((panel) => {
    const panelId = panel.dataset.rootPanel || panel.dataset.tab;
    if (!panelId) {
      return;
    }
    const heading = panel.querySelector('[data-tab-heading]');
    if (heading instanceof HTMLElement) {
      tabHeadings.set(panelId.toLowerCase(), heading);
    }
  });

  consoleTabButton = tabButtons.find(
    (button) => (button.dataset.rootTab || button.dataset.tab || '').toLowerCase() === 'console'
  );
  jsonTabButton = tabButtons.find(
    (button) => (button.dataset.rootTab || button.dataset.tab || '').toLowerCase() === 'json'
  );
  fixturesTabButton = tabButtons.find(
    (button) => (button.dataset.rootTab || button.dataset.tab || '').toLowerCase() === 'fixtures'
  );
}

collectRootTabElements();

if (typeof window !== 'undefined') {
  window.WYRD_DEBUG = DEBUG;
}

const RUN_HISTORY_STORAGE_KEY = 'runHistory';
const RUN_HISTORY_LIMIT = 10;

let runHistory = [];
let runHistoryListElement;
let copyJsonButton;
let saveJsonButton;
let jsonSummaryElement;

let currentJsonText = '';
let currentJsonMetadata = { variant: '', rig: '', week: '', events: null };

const VISUALS_LEGACY_FLAG = 'wyrd.visuals.legacy';
const visualsState = {
  container: null,
  layout: null,
  mainPanel: null,
  mount: null,
  fallback: null,
  fallbackImg: null,
  fallbackMessage: null,
  urchin: null,
  useLegacy: false,
  statusOverlay: null,
  statusText: null,
  metaBar: null,
  metaSlot: null,
  runLabel: null,
  balanceHistory: [],
  totalRunCount: 0,
};
let lastVisualPayload = null;
let lastVisualSchedule = null;
let isGeneratingCalendar = false;
const GENERATE_BUTTON_DEFAULT_LABEL = 'Generate schedule';
const GENERATE_BUTTON_LOADING_LABEL = 'Generating…';
const VISUALS_EMPTY_STATE_MESSAGE = 'No schedule generated yet. Click Generate to create one.';

const CALENDAR_HISTORY_LIMIT = 50;
const calendarHistoryState = {
  runHistory: [],
  panel: null,
  list: null,
  activeId: null,
  currentRun: null,
  summaryContainer: null,
  summaryList: null,
  summaryMeta: null,
};

const RUNNER_FN_MAP = {
  mk1: { default: 'mk1_run' },
  mk2: { calendar: 'mk2_run_calendar', workforce: 'mk2_run_workforce' },
};

const BATCH_PRESETS = [52, 100, 500];
const batchState = {
  panel: null,
  results: [],
  size: BATCH_PRESETS[0],
  isRunning: false,
  targetRuns: 0,
  completedRuns: 0,
  scaleMode: 'proportional',
  runButton: null,
  summary: null,
  stack: null,
  empty: null,
  sizeButtons: new Map(),
  modeButtons: new Map(),
  lastRunCount: 0,
};

const RANDOMIZE_SEED_STORAGE_KEY = 'cfg.calendar.randomizeSeed';
let randomizeSeed = false;
let randomizeSeedToggle = null;
let seedIndicatorElement = null;
let calendarConfigController = null;

function readRandomizeSeedPreference() {
  try {
    return localStorage.getItem(RANDOMIZE_SEED_STORAGE_KEY) === '1';
  } catch (error) {
    return false;
  }
}

function persistRandomizeSeedPreference(enabled) {
  try {
    localStorage.setItem(RANDOMIZE_SEED_STORAGE_KEY, enabled ? '1' : '0');
  } catch (error) {
    // ignore storage failures
  }
}

function updateRandomizeSeedToggleUI() {
  if (randomizeSeedToggle) {
    randomizeSeedToggle.checked = Boolean(randomizeSeed);
  }
}

function updateSeedIndicator(seedValue) {
  if (!seedIndicatorElement) {
    return;
  }
  let value = seedValue;
  if (typeof value === 'undefined') {
    if (calendarConfigState && calendarConfigState.common) {
      value = calendarConfigState.common.seed;
    } else if (typeof getConfigSnapshot === 'function') {
      try {
        const snapshot = getConfigSnapshot();
        value = snapshot?.seed;
      } catch (error) {
        value = undefined;
      }
    }
  }
  if (value === null || typeof value === 'undefined' || value === '') {
    seedIndicatorElement.textContent = '—';
    return;
  }
  seedIndicatorElement.textContent = String(value);
}

function readVisualsLegacyFlag() {
  try {
    return localStorage.getItem(VISUALS_LEGACY_FLAG) === '1';
  } catch (error) {
    return false;
  }
}

function persistVisualsLegacyFlag(enabled) {
  try {
    if (enabled) {
      localStorage.setItem(VISUALS_LEGACY_FLAG, '1');
    } else {
      localStorage.removeItem(VISUALS_LEGACY_FLAG);
    }
  } catch (error) {
    // ignore storage failures
  }
}

function ensureVisualsFallbackPanel() {
  if (visualsState.fallback && visualsState.fallbackImg && visualsState.fallbackMessage) {
    if (visualsState.fallback.parentElement || !visualsState.mainPanel) {
      return;
    }
    visualsState.mainPanel.append(visualsState.fallback);
    return;
  }

  if (!visualsState.mainPanel) {
    return;
  }

  const fallback = document.createElement('div');
  fallback.className = 'visuals-fallback-panel';
  fallback.hidden = true;

  const fallbackImg = document.createElement('img');
  fallbackImg.className = 'visuals-fallback-panel__image';
  fallbackImg.alt = 'Legacy visuals preview unavailable';
  fallbackImg.hidden = true;

  const fallbackMessage = document.createElement('p');
  fallbackMessage.className = 'visuals-fallback-panel__message';
  fallbackMessage.textContent = 'Legacy visuals preview unavailable.';
  fallbackMessage.hidden = true;

  fallback.append(fallbackImg, fallbackMessage);
  visualsState.mainPanel.append(fallback);

  visualsState.fallback = fallback;
  visualsState.fallbackImg = fallbackImg;
  visualsState.fallbackMessage = fallbackMessage;
}

function removeFallbackPanel() {
  if (visualsState.fallback && visualsState.fallback.parentElement) {
    visualsState.fallback.parentElement.removeChild(visualsState.fallback);
  }
}

function syncVisualsVisibility() {
  if (visualsState.mount) {
    visualsState.mount.hidden = visualsState.useLegacy;
  }
  if (visualsState.useLegacy) {
    ensureVisualsFallbackPanel();
    if (visualsState.fallback) {
      visualsState.fallback.hidden = false;
    }
  } else {
    if (visualsState.fallback) {
      visualsState.fallback.hidden = true;
    }
    removeFallbackPanel();
  }
}

function showVisualsOverlay(message, { loading = false } = {}) {
  const overlay = visualsState.statusOverlay;
  const text = visualsState.statusText;
  if (!overlay || !text) {
    return;
  }
  overlay.hidden = false;
  overlay.classList.toggle('is-loading', Boolean(loading));
  text.textContent = message || '';
}

function hideVisualsOverlay() {
  const overlay = visualsState.statusOverlay;
  const text = visualsState.statusText;
  if (!overlay || !text) {
    return;
  }
  overlay.hidden = true;
  overlay.classList.remove('is-loading');
  text.textContent = '';
}

function showVisualsEmptyState() {
  if (isGeneratingCalendar) {
    return;
  }
  showVisualsOverlay(VISUALS_EMPTY_STATE_MESSAGE, { loading: false });
}

function resolveLegacyPng(payload) {
  if (!payload || typeof payload !== 'object') {
    return '';
  }
  const metadata = payload.metadata || {};
  const candidates = [
    metadata.preview_png,
    metadata.preview_png_url,
    metadata.calendar_png,
    metadata.calendar_png_url,
    payload.preview_png,
    payload.preview_png_url,
  ];
  return candidates.find((value) => typeof value === 'string' && value.trim().length > 0) || '';
}

function resolveVisualPayload(payload) {
  if (!payload || typeof payload !== 'object') {
    return null;
  }
  if (Array.isArray(payload.events)) {
    return payload;
  }
  if (payload.calendar && typeof payload.calendar === 'object') {
    return resolveVisualPayload(payload.calendar);
  }
  if (payload.calendarJson && typeof payload.calendarJson === 'object') {
    return resolveVisualPayload(payload.calendarJson);
  }
  if (payload.rawResult && typeof payload.rawResult === 'object') {
    return resolveVisualPayload(payload.rawResult);
  }
  if (payload.data && typeof payload.data === 'object') {
    return resolveVisualPayload(payload.data);
  }
  return null;
}

function applyBalanceHistoryToUrchin() {
  if (!visualsState.urchin || typeof visualsState.urchin.setBalanceHistory !== 'function') {
    return;
  }
  visualsState.urchin.setBalanceHistory(
    visualsState.balanceHistory,
    visualsState.totalRunCount
  );
}

function appendActivityBalanceSnapshot(schedule) {
  if (!schedule || typeof schedule !== 'object') {
    return;
  }
  const previousTotal = Number.isFinite(visualsState.totalRunCount)
    ? visualsState.totalRunCount
    : 0;
  const nextRunNumber = previousTotal + 1;
  const signature = computeScheduleSignature(schedule);
  const entry = createBalanceHistoryEntry(schedule, {
    runNumber: nextRunNumber,
    highContrast: Boolean(visualsState.urchin?.state?.highContrast),
    signature,
  });
  if (!entry) {
    return;
  }
  visualsState.totalRunCount = nextRunNumber;
  const nextHistory =
    visualsState.balanceHistory.length >= BALANCE_HISTORY_LIMIT
      ? [...visualsState.balanceHistory.slice(1), entry]
      : [...visualsState.balanceHistory, entry];
  visualsState.balanceHistory = nextHistory;
  if (
    visualsState.urchin &&
    typeof visualsState.urchin.appendBalanceHistoryEntry === 'function'
  ) {
    try {
      visualsState.urchin.appendBalanceHistoryEntry(entry, nextRunNumber);
    } catch (error) {
      console.warn('[visuals] failed to append balance history entry:', error);
    }
  }
  applyBalanceHistoryToUrchin();
}

function updateVisuals(payload) {
  lastVisualPayload = payload && typeof payload === 'object' ? payload : null;
  lastVisualSchedule = resolveVisualPayload(payload);

  if (!lastVisualSchedule && payload && typeof payload === 'object' && !visualsState.useLegacy) {
    console.warn('[visuals] received payload without events, skipping radial render');
  }

  if (visualsState.useLegacy) {
    ensureVisualsFallbackPanel();
    resetVisualsInstance();
    const src = resolveLegacyPng(lastVisualPayload);
    if (visualsState.fallbackImg) {
      if (src) {
        visualsState.fallbackImg.src = src;
        visualsState.fallbackImg.alt = 'Schedule preview (legacy PNG)';
        visualsState.fallbackImg.hidden = false;
        if (visualsState.fallbackMessage) {
          visualsState.fallbackMessage.hidden = true;
        }
      } else {
        visualsState.fallbackImg.removeAttribute('src');
        visualsState.fallbackImg.alt = 'Legacy visuals preview unavailable';
        visualsState.fallbackImg.hidden = true;
        if (visualsState.fallbackMessage) {
          visualsState.fallbackMessage.hidden = false;
          visualsState.fallbackMessage.textContent =
            'Legacy visuals preview unavailable. Run generator to produce a fresh export.';
        }
      }
    }
    return;
  }

  const readyForRadial = canRenderRadialVisuals();
  if (!readyForRadial) {
    if (visualsState.urchin) {
      resetVisualsInstance();
    }
    return;
  }

  if (!hasVisualEvents(lastVisualSchedule)) {
    resetVisualsInstance();
    return;
  }

  maybeCreateUrchinInstance(lastVisualSchedule);

  if (!visualsState.urchin) {
    return;
  }

  try {
    if (visualsState.metaBar && typeof visualsState.urchin.attachRunMeta === 'function') {
      visualsState.urchin.attachRunMeta(visualsState.metaBar);
    }
    if (visualsState.metaSlot) {
      visualsState.metaSlot.hidden = Boolean(visualsState.metaBar?.hidden);
    }
    visualsState.urchin.update({ data: lastVisualSchedule });
    applyBalanceHistoryToUrchin();
  } catch (error) {
    console.error('[visuals] failed to update radial urchin:', error);
  }
}

function resetVisualsInstance() {
  if (visualsState.urchin) {
    try {
      if (typeof visualsState.urchin.destroy === 'function') {
        visualsState.urchin.destroy();
      }
    } catch (error) {
      console.warn('[visuals] failed to destroy existing radial urchin:', error);
    }
    visualsState.urchin = null;
  }
  if (visualsState.metaBar && visualsState.metaBar.parentElement) {
    visualsState.metaBar.parentElement.removeChild(visualsState.metaBar);
  }
  visualsState.metaSlot = null;
  if (visualsState.mount && visualsState.mount.childNodes.length > 0) {
    visualsState.mount.replaceChildren();
  }
}

function hasVisualEvents(payload) {
  const schedule = resolveVisualPayload(payload);
  return Boolean(schedule && Array.isArray(schedule.events) && schedule.events.length > 0);
}

function canRenderRadialVisuals() {
  if (visualsState.useLegacy) {
    return false;
  }
  const mount = visualsState.mount;
  if (!(mount instanceof HTMLElement) || !mount.isConnected) {
    return false;
  }
  return true;
}

function maybeCreateUrchinInstance(schedule) {
  if (
    visualsState.useLegacy ||
    visualsState.urchin ||
    !visualsState.mount ||
    !visualsState.mount.isConnected ||
    !schedule ||
    !hasVisualEvents(schedule)
  ) {
    return;
  }
  resetVisualsInstance();
  const instance = createRadialUrchin(visualsState.mount, {
    data: schedule,
    mode: 'day-rings',
    onSelect: handleUrchinSelect,
  });
  if (instance) {
    if (typeof instance.getRunMetaSlot === 'function') {
      visualsState.metaSlot = instance.getRunMetaSlot();
    } else {
      visualsState.metaSlot = null;
    }
    if (visualsState.metaBar && typeof instance.attachRunMeta === 'function') {
      instance.attachRunMeta(visualsState.metaBar);
    }
    visualsState.urchin = instance;
    applyBalanceHistoryToUrchin();
  }
}

function initVisualsMount() {
  if (visualsState.container) {
    return true;
  }
  const container = document.querySelector('#visuals-container');
  if (!container) {
    return false;
  }

  visualsState.container = container;
  visualsState.useLegacy = readVisualsLegacyFlag();

  const layout = document.createElement('div');
  layout.className = 'visuals-layout';
  container.append(layout);
  visualsState.layout = layout;

  const mainPanel = document.createElement('div');
  mainPanel.className = 'visuals-main visuals-panel';
  layout.append(mainPanel);
  visualsState.mainPanel = mainPanel;

  const metaBar = document.createElement('div');
  metaBar.className = 'visuals-run-meta';
  metaBar.hidden = true;
  const runLabel = document.createElement('span');
  runLabel.className = 'visuals-run-meta__label';
  metaBar.append(runLabel);
  visualsState.metaBar = metaBar;
  visualsState.runLabel = runLabel;

  const mount = document.createElement('div');
  mount.className = 'visuals-mount';
  mainPanel.append(mount);
  visualsState.mount = mount;

  const overlay = document.createElement('div');
  overlay.className = 'visuals-status-overlay';
  overlay.hidden = true;
  const overlaySpinner = document.createElement('div');
  overlaySpinner.className = 'visuals-status-overlay__spinner';
  const overlayText = document.createElement('div');
  overlayText.className = 'visuals-status-overlay__text';
  overlay.append(overlaySpinner, overlayText);
  mainPanel.append(overlay);
  visualsState.statusOverlay = overlay;
  visualsState.statusText = overlayText;

  if (typeof window !== 'undefined') {
    window.WYRD_SET_VISUALS_LEGACY = (enabled) => {
      const flag = Boolean(enabled);
      visualsState.useLegacy = flag;
      persistVisualsLegacyFlag(flag);
      syncVisualsVisibility();
      updateVisuals(lastVisualPayload);
    };
  }

  syncVisualsVisibility();
  return true;
}

function safeInitVisuals(initialData) {
  try {
    const ready = initVisualsMount();
    if (!ready) {
      console.warn('[visuals] no container found, skipping visuals init');
      return;
    }
    const payload = lastVisualPayload ?? (initialData && typeof initialData === 'object' ? initialData : null);
    console.info('[visuals] initializing with', hasVisualEvents(payload) ? 'real data' : 'no data');
    updateVisuals(payload);
    if (hasVisualEvents(payload)) {
      hideVisualsOverlay();
    } else {
      showVisualsEmptyState();
    }
  } catch (error) {
    console.error('[visuals] init failed:', error);
  }
}

function generateCalendarHistoryId() {
  try {
    if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
      return crypto.randomUUID();
    }
  } catch (error) {
    // ignore
  }
  const random = Math.random().toString(16).slice(2);
  return `calendar-${Date.now()}-${random}`;
}

function parseHistoryTime(value) {
  if (typeof value !== 'string') {
    return null;
  }
  const [hoursPart, minutesPart] = value.split(':');
  const hours = Number.parseInt(hoursPart, 10);
  const minutes = Number.parseInt(minutesPart, 10);
  if (!Number.isFinite(hours) || !Number.isFinite(minutes)) {
    return null;
  }
  const total = hours * 60 + minutes;
  return Number.isFinite(total) ? ((total % (24 * 60)) + 24 * 60) % (24 * 60) : null;
}

function computeEventDurationMinutes(event) {
  if (!event || typeof event !== 'object') {
    return 0;
  }
  const start = parseHistoryTime(event.start);
  const end = parseHistoryTime(event.end);
  if (start === null || end === null) {
    return 0;
  }
  if (end >= start) {
    return end - start;
  }
  return 24 * 60 - start + end;
}

function computeCalendarHistorySummary(events) {
  if (!Array.isArray(events) || events.length === 0) {
    return { totalEvents: Array.isArray(events) ? events.length : 0 };
  }

  let sleepMinutes = 0;
  let workMinutes = 0;

  events.forEach((event) => {
    const duration = computeEventDurationMinutes(event);
    if (duration <= 0) {
      return;
    }
    const activity = (event?.activity || event?.label || '').toString().toLowerCase();
    if (activity.includes('sleep')) {
      sleepMinutes += duration;
    }
    if (activity.includes('work')) {
      workMinutes += duration;
    }
  });

  const summary = { totalEvents: events.length };
  if (sleepMinutes > 0) {
    summary.totalSleepHours = Math.round((sleepMinutes / 60) * 10) / 10;
  }
  if (workMinutes > 0) {
    summary.totalWorkHours = Math.round((workMinutes / 60) * 10) / 10;
  }
  return summary;
}

function ensureCalendarHistorySummary(entry) {
  if (!entry) {
    return null;
  }
  if (entry.summary && typeof entry.summary === 'object') {
    return entry.summary;
  }
  const events = entry.calendarJson && Array.isArray(entry.calendarJson.events)
    ? entry.calendarJson.events
    : entry.rawResult && Array.isArray(entry.rawResult.events)
    ? entry.rawResult.events
    : null;
  if (!events) {
    return null;
  }
  return computeCalendarHistorySummary(events);
}

function cloneCalendarHistoryPayload(payload) {
  try {
    return JSON.parse(JSON.stringify(payload ?? {}));
  } catch (error) {
    console.warn('Unable to clone calendar history payload:', error);
    return null;
  }
}

function formatHistoryTimestamp(value) {
  try {
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) {
      throw new Error('Invalid date');
    }
    const pad = (num) => String(num).padStart(2, '0');
    const year = date.getFullYear();
    const month = pad(date.getMonth() + 1);
    const day = pad(date.getDate());
    const hours = pad(date.getHours());
    const minutes = pad(date.getMinutes());
    return `${year}-${month}-${day} ${hours}:${minutes}`;
  } catch (error) {
    return 'Unknown time';
  }
}

function formatHistoryHours(value) {
  if (!Number.isFinite(value)) {
    return null;
  }
  const rounded = Math.round(value * 10) / 10;
  return rounded.toFixed(1);
}

function updateActiveRunLabel() {
  const metaBar = visualsState.metaBar;
  const runLabel = visualsState.runLabel;
  if (!metaBar || !runLabel) {
    return;
  }

  const { activeId, runHistory } = calendarHistoryState;
  if (!activeId) {
    runLabel.textContent = '';
    metaBar.hidden = true;
    if (visualsState.metaSlot) {
      visualsState.metaSlot.hidden = true;
    }
    return;
  }

  const index = runHistory.findIndex((entry) => entry.id === activeId);
  if (index === -1) {
    runLabel.textContent = '';
    metaBar.hidden = true;
    if (visualsState.metaSlot) {
      visualsState.metaSlot.hidden = true;
    }
    return;
  }

  const entry = runHistory[index];
  const runNumber = Number.isFinite(entry?.runNumber)
    ? entry.runNumber
    : runHistory.length - index;
  const parts = [`Run #${runNumber}`];
  if (entry.timestamp) {
    const formatted = formatHistoryTimestamp(entry.timestamp);
    if (formatted) {
      parts.push(formatted);
    }
  }
  runLabel.textContent = parts.join(' · ');
  metaBar.hidden = false;
  if (visualsState.metaSlot) {
    visualsState.metaSlot.hidden = false;
  }
}

function renderCalendarRunHistory() {
  const list = calendarHistoryState.list;
  if (!list) {
    renderCalendarHistorySummary();
    return;
  }

  list.innerHTML = '';
  if (calendarHistoryState.runHistory.length === 0) {
    const emptyItem = document.createElement('li');
    emptyItem.className = 'visuals-history-empty';
    emptyItem.textContent = 'No runs yet. Generate a schedule to build history.';
    list.append(emptyItem);
    updateActiveRunLabel();
    renderCalendarHistorySummary();
    updateVisuals(null);
    showVisualsEmptyState();
    return;
  }

  const fragment = document.createDocumentFragment();
  calendarHistoryState.runHistory.forEach((entry) => {
    const item = document.createElement('li');
    item.className = 'visuals-history-item';

    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'visuals-history-entry';
    if (entry.id === calendarHistoryState.activeId) {
      button.classList.add('is-active');
    }

    const headline = document.createElement('span');
    headline.className = 'visuals-history-entry__headline';
    const timeLabel = formatHistoryTimestamp(entry.timestamp);
    const parts = [`[${timeLabel}]`];
    if (entry.archetype) {
      parts.push(`archetype=${entry.archetype}`);
    }
    if (entry.seed !== undefined && entry.seed !== null && entry.seed !== '') {
      parts.push(`seed=${entry.seed}`);
    }
    if (entry.variant) {
      parts.push(`variant=${entry.variant}`);
    }
    if (entry.rig) {
      parts.push(`rig=${entry.rig}`);
    }
    headline.textContent = parts.join(' ');

    const meta = document.createElement('span');
    meta.className = 'visuals-history-entry__meta';
    const summary = ensureCalendarHistorySummary(entry);
    const metaParts = [];
    if (summary && Number.isFinite(summary.totalSleepHours)) {
      const value = formatHistoryHours(summary.totalSleepHours);
      if (value) {
        metaParts.push(`sleep≈${value}h`);
      }
    }
    if (summary && Number.isFinite(summary.totalWorkHours)) {
      const value = formatHistoryHours(summary.totalWorkHours);
      if (value) {
        metaParts.push(`work≈${value}h`);
      }
    }
    if (summary && Number.isFinite(summary.totalEvents)) {
      metaParts.push(`events=${summary.totalEvents}`);
    }
    if (entry.weekStart) {
      metaParts.push(`week=${entry.weekStart}`);
    }
    meta.textContent = metaParts.join(', ') || 'No summary available';

    button.append(headline, meta);
    button.addEventListener('click', () => {
      restoreCalendarHistoryEntry(entry.id);
    });

    item.append(button);
    fragment.append(item);
  });

  list.append(fragment);
  updateActiveRunLabel();
  renderCalendarHistorySummary();
}

function renderCalendarHistorySummary() {
  const container = calendarHistoryState.summaryContainer;
  const list = calendarHistoryState.summaryList;
  const meta = calendarHistoryState.summaryMeta;
  if (!container || !list) {
    return;
  }

  const { activeId, runHistory, currentRun } = calendarHistoryState;
  const activeIndex = activeId ? runHistory.findIndex((entry) => entry.id === activeId) : -1;
  const entry =
    currentRun && currentRun.id === activeId
      ? currentRun
      : activeIndex !== -1
      ? runHistory[activeIndex]
      : null;

  if (!entry) {
    list.innerHTML = '';
    if (meta) {
      meta.textContent = '';
    }
    container.hidden = true;
    return;
  }

  const summary = ensureCalendarHistorySummary(entry);

  list.innerHTML = '';

  const summaryItems = [
    {
      label: 'Sleep',
      value: summary && Number.isFinite(summary.totalSleepHours)
        ? `${formatHistoryHours(summary.totalSleepHours)} h`
        : '—',
    },
    {
      label: 'Work',
      value: summary && Number.isFinite(summary.totalWorkHours)
        ? `${formatHistoryHours(summary.totalWorkHours)} h`
        : '—',
    },
    {
      label: 'Events',
      value:
        summary && Number.isFinite(summary.totalEvents) ? String(summary.totalEvents) : '—',
    },
  ];

  summaryItems.forEach((item) => {
    const block = document.createElement('div');
    block.className = 'visuals-history-summary__item';

    const term = document.createElement('span');
    term.className = 'visuals-history-summary__term';
    term.textContent = item.label;

    const value = document.createElement('span');
    value.className = 'visuals-history-summary__value';
    value.textContent = item.value;

    block.append(term, value);
    list.append(block);
  });

  if (meta) {
    const activeEntry = activeIndex !== -1 ? runHistory[activeIndex] : null;
    const runNumber = activeEntry && Number.isFinite(activeEntry.runNumber)
      ? activeEntry.runNumber
      : activeIndex !== -1
      ? runHistory.length - activeIndex
      : null;
    const metaParts = [];
    if (Number.isFinite(runNumber)) {
      metaParts.push(`Run #${runNumber}`);
    } else {
      metaParts.push('Run');
    }
    if (entry.weekStart) {
      metaParts.push(`Week ${entry.weekStart}`);
    }
    const variantParts = [entry.archetype, entry.variant, entry.rig].filter(Boolean);
    if (variantParts.length > 0) {
      metaParts.push(variantParts.join(' / '));
    }
    meta.textContent = metaParts.join(' • ');
  }

  container.hidden = false;
}

function setCurrentCalendarHistoryEntry(entry, options = {}) {
  const { updateJson = true, focusVisuals = false, showEmptyState = true } = options;

  const rawPayload =
    entry && entry.rawResult ? cloneCalendarHistoryPayload(entry.rawResult) || entry.rawResult : null;
  const calendarPayloadSource =
    entry && entry.calendarJson
      ? cloneCalendarHistoryPayload(entry.calendarJson) || entry.calendarJson
      : rawPayload;
  const visualPayload = resolveVisualPayload(calendarPayloadSource);

  if (!entry || !visualPayload || typeof visualPayload !== 'object') {
    calendarHistoryState.activeId = null;
    calendarHistoryState.currentRun = null;
    updateVisuals(null);
    if (showEmptyState) {
      showVisualsEmptyState();
    }
  } else {
    calendarHistoryState.activeId = entry.id;
    calendarHistoryState.currentRun = {
      ...entry,
      summary: entry.summary && typeof entry.summary === 'object' ? { ...entry.summary } : null,
      rawResult: rawPayload || visualPayload,
      calendarJson: cloneCalendarHistoryPayload(visualPayload) || visualPayload,
    };

    if (updateJson) {
      setJsonPayload(rawPayload || visualPayload, {
        variant: entry.variant,
        rig: entry.rig,
        weekStart: entry.weekStart,
      });
      const validation = validateWebV1Calendar(rawPayload || visualPayload || {});
      setJsonValidationBadge(validation.ok ? 'ok' : 'err');
    } else {
      updateVisuals(rawPayload || visualPayload);
    }

    hideVisualsOverlay();
  }

  renderCalendarRunHistory();

  if (focusVisuals) {
    dispatchIntent({
      type: INTENT_TYPES.NAVIGATE_TAB,
      payload: { tab: 'visuals' },
    });
  }
}

function ensureCalendarHistoryPanel(parentElement) {
  if (!parentElement) {
    return null;
  }

  let panel = calendarHistoryState.panel;
  if (!panel) {
    panel = document.createElement('section');
    panel.className = 'visuals-history-panel';

    const header = document.createElement('div');
    header.className = 'visuals-history-header';

    const title = document.createElement('h3');
    title.className = 'visuals-history-title';
    title.textContent = 'Run History';

    header.append(title);
    panel.append(header);

    const hint = document.createElement('p');
    hint.className = 'visuals-history-hint';
    hint.textContent = 'Recent runs (click to load):';
    panel.append(hint);

    const summary = document.createElement('div');
    summary.className = 'visuals-history-summary';
    summary.hidden = true;

    const summaryTitle = document.createElement('h4');
    summaryTitle.className = 'visuals-history-summary__title';
    summaryTitle.textContent = 'Current run overview';

    const summaryMeta = document.createElement('p');
    summaryMeta.className = 'visuals-history-summary__meta';
    summaryMeta.textContent = '';

    const summaryList = document.createElement('div');
    summaryList.className = 'visuals-history-summary__grid';

    summary.append(summaryTitle, summaryMeta, summaryList);
    panel.append(summary);

    const list = document.createElement('ul');
    list.className = 'visuals-history-list';
    panel.append(list);

    calendarHistoryState.panel = panel;
    calendarHistoryState.list = list;
    calendarHistoryState.summaryContainer = summary;
    calendarHistoryState.summaryList = summaryList;
    calendarHistoryState.summaryMeta = summaryMeta;
  }

  if (panel.parentElement !== parentElement) {
    parentElement.append(panel);
  }

  renderCalendarRunHistory();

  return panel;
}

function recordCalendarHistoryEntry(entry) {
  if (!entry || !entry.rawResult) {
    return;
  }
  const visualPayload = resolveVisualPayload(entry.calendarJson || entry.rawResult);
  const normalized = {
    id: entry.id || generateCalendarHistoryId(),
    runNumber: Number.isFinite(visualsState.totalRunCount)
      ? visualsState.totalRunCount
      : undefined,
    timestamp: entry.timestamp || new Date().toISOString(),
    archetype: entry.archetype || '',
    seed:
      Number.isFinite(entry.seed)
        ? entry.seed
        : Number.isFinite(Number.parseInt(entry.seed, 10))
        ? Number.parseInt(entry.seed, 10)
        : undefined,
    variant: entry.variant || '',
    rig: entry.rig || '',
    weekStart: entry.weekStart || '',
    summary: entry.summary ? { ...entry.summary } : null,
    rawResult: cloneCalendarHistoryPayload(entry.rawResult) || entry.rawResult,
    calendarJson: cloneCalendarHistoryPayload(visualPayload) || visualPayload,
  };

  calendarHistoryState.runHistory = [normalized, ...calendarHistoryState.runHistory].slice(
    0,
    CALENDAR_HISTORY_LIMIT,
  );
  setCurrentCalendarHistoryEntry(normalized, { updateJson: false });
}

function restoreCalendarHistoryEntry(entryId) {
  if (!entryId) {
    return;
  }
  const entry = calendarHistoryState.runHistory.find((item) => item.id === entryId);
  if (!entry) {
    return;
  }
  setCurrentCalendarHistoryEntry(entry, { focusVisuals: true });
}

let getConfigSnapshot = () => ({
  classId: 'calendar',
  variant: '',
  rig: '',
  archetype: '',
  week_start: '',
  seed: '',
  hasBudget: false,
});

const DEFAULT_JSON_PLACEHOLDER = '{\n  "data": "JSON payloads will render here."\n}';

function ensureJsonTabBadge() {
  if (!jsonTabButton) {
    return null;
  }
  if (!jsonTabBadge) {
    jsonTabBadge = document.createElement('span');
    jsonTabBadge.className = 'tab-badge';
    jsonTabBadge.hidden = true;
    jsonTabBadge.setAttribute('aria-hidden', 'true');
    jsonTabButton.classList.add('json-tab');
    jsonTabButton.append(jsonTabBadge);
  }
  return jsonTabBadge;
}

function setJsonValidationBadge(status) {
  const badge = ensureJsonTabBadge();
  if (!badge) {
    return;
  }
  badge.classList.remove('tab-badge--ok', 'tab-badge--err');
  if (status === 'ok') {
    badge.hidden = false;
    badge.classList.add('tab-badge--ok');
  } else if (status === 'err') {
    badge.hidden = false;
    badge.classList.add('tab-badge--err');
  } else {
    badge.hidden = true;
  }
}

window.setJsonValidationBadge = setJsonValidationBadge;

function ensureFixturesTabBadge() {
  if (!fixturesTabButton) {
    return null;
  }
  if (!fixturesTabBadge) {
    fixturesTabBadge = document.createElement('span');
    fixturesTabBadge.className = 'tab-badge';
    fixturesTabBadge.hidden = true;
    fixturesTabBadge.setAttribute('aria-hidden', 'true');
    fixturesTabButton.classList.add('fixtures-tab');
    fixturesTabButton.append(fixturesTabBadge);
  }
  return fixturesTabBadge;
}

function setFixturesHistoryBadgeVisible(isVisible) {
  const badge = ensureFixturesTabBadge();
  if (!badge) {
    return;
  }
  badge.classList.remove('tab-badge--notice');
  if (isVisible) {
    badge.hidden = false;
    badge.classList.add('tab-badge--notice');
  } else {
    badge.hidden = true;
  }
}

function generateHistoryId() {
  try {
    if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
      return crypto.randomUUID();
    }
  } catch (error) {
    // ignore
  }
  const random = Math.random().toString(16).slice(2);
  return `hist-${Date.now()}-${random}`;
}

function loadRunHistoryFromStorage() {
  try {
    const raw = localStorage.getItem(RUN_HISTORY_STORAGE_KEY);
    if (!raw) {
      runHistory = [];
      return;
    }
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) {
      runHistory = [];
      return;
    }
    runHistory = parsed
      .filter((entry) => entry && typeof entry === 'object')
      .map((entry) => ({
        ...entry,
        id: entry.id || generateHistoryId(),
      }))
      .slice(0, RUN_HISTORY_LIMIT);
  } catch (error) {
    console.warn('Unable to load run history:', error);
    runHistory = [];
  }
}

function persistRunHistory() {
  try {
    localStorage.setItem(RUN_HISTORY_STORAGE_KEY, JSON.stringify(runHistory));
  } catch (error) {
    console.warn('Unable to persist run history:', error);
  }
}

function renderRunHistory() {
  if (!runHistoryListElement) {
    return;
  }

  runHistoryListElement.innerHTML = '';
  if (runHistory.length === 0) {
    const emptyItem = document.createElement('li');
    emptyItem.className = 'run-history-empty';
    emptyItem.textContent = 'No runs recorded yet.';
    runHistoryListElement.append(emptyItem);
    return;
  }

  runHistory.forEach((entry) => {
    const item = document.createElement('li');
    item.className = 'run-history-item';

    const details = document.createElement('div');
    details.className = 'run-history-details';

    const label = document.createElement('span');
    label.className = 'run-history-label';
    const variantText = [entry.variant, entry.rig].filter(Boolean).join('/') || 'calendar';
    const sourceLabel = entry.kind === 'generate' ? 'Generated' : entry.label || 'Fixture';
    label.textContent = `${sourceLabel} • ${variantText}`;

    const meta = document.createElement('span');
    meta.className = 'run-history-meta';
    const timestamp = Number.isFinite(entry.ts)
      ? new Date(entry.ts).toLocaleString()
      : 'Unknown time';
    const week = typeof entry.week_start === 'string' && entry.week_start ? entry.week_start : '—';
    const eventCount =
      entry.resultSummary && Number.isFinite(entry.resultSummary.events)
        ? entry.resultSummary.events
        : null;
    const eventText =
      eventCount === null
        ? ''
        : `${eventCount} event${eventCount === 1 ? '' : 's'}`;
    const metaParts = [`${timestamp}`, `Week: ${week}`];
    const seedDisplay =
      entry.seed !== undefined && entry.seed !== null && entry.seed !== ''
        ? String(entry.seed)
        : '';
    if (seedDisplay) {
      metaParts.push(`Seed: ${seedDisplay}`);
    }
    if (eventText) {
      metaParts.push(eventText);
    }
    meta.textContent = metaParts.join(' • ');

    details.append(label, meta);

    const actions = document.createElement('div');
    actions.className = 'run-history-actions';

    const openButton = document.createElement('button');
    openButton.type = 'button';
    openButton.className = 'run-history-button';
    openButton.textContent = 'Open';
    openButton.addEventListener('click', () => {
      const payload = entry.payload && typeof entry.payload === 'object' ? entry.payload : null;
      if (!payload) {
        return;
      }
      setJsonPayload(payload, {
        variant: entry.variant,
        rig: entry.rig,
        weekStart: entry.week_start,
      });
      const validation = validateWebV1Calendar(payload);
      setJsonValidationBadge(validation.ok ? 'ok' : 'err');
      dispatchIntent({
        type: INTENT_TYPES.NAVIGATE_TAB,
        payload: { tab: 'json', focusPanel: true },
      });
    });

    const deleteButton = document.createElement('button');
    deleteButton.type = 'button';
    deleteButton.className = 'run-history-button run-history-button--danger';
    deleteButton.textContent = 'Delete';
    deleteButton.addEventListener('click', () => {
      runHistory = runHistory.filter((item) => item.id !== entry.id);
      persistRunHistory();
      renderRunHistory();
    });

    actions.append(openButton, deleteButton);
    item.append(details, actions);
    runHistoryListElement.append(item);
  });
}

function clonePayload(payload) {
  try {
    return JSON.parse(JSON.stringify(payload ?? {}));
  } catch (error) {
    console.warn('Unable to clone payload for history:', error);
    return null;
  }
}

function addRunHistoryEntry(entry) {
  if (!entry) {
    return;
  }
  const normalized = {
    id: entry.id || generateHistoryId(),
    ts: Number.isFinite(entry.ts) ? entry.ts : Date.now(),
    kind: entry.kind || 'generate',
    class: entry.class || 'calendar',
    variant: entry.variant || '',
    rig: entry.rig || '',
    seed:
      typeof entry.seed === 'number'
        ? entry.seed
        : typeof entry.seed === 'string' && entry.seed.trim().length > 0
        ? entry.seed.trim()
        : '',
    week_start: typeof entry.week_start === 'string' ? entry.week_start : '',
    label: entry.label || '',
    payload: clonePayload(entry.payload) || entry.payload || {},
    inputs: entry.inputs ? clonePayload(entry.inputs) || entry.inputs : null,
    resultSummary: entry.resultSummary
      ? clonePayload(entry.resultSummary) || entry.resultSummary
      : null,
  };
  runHistory = [normalized, ...runHistory].slice(0, RUN_HISTORY_LIMIT);
  persistRunHistory();
  renderRunHistory();
  if (currentTab !== 'fixtures') {
    setFixturesHistoryBadgeVisible(true);
  }
}

function hasJsonContent() {
  const trimmed = (currentJsonText || '').trim();
  if (!trimmed) {
    return false;
  }
  return trimmed !== DEFAULT_JSON_PLACEHOLDER.trim();
}

function updateJsonActionsState() {
  const hasContent = hasJsonContent();
  if (copyJsonButton) {
    copyJsonButton.disabled = !hasContent;
  }
  if (saveJsonButton) {
    saveJsonButton.disabled = !hasContent;
  }
}

function updateJsonSummaryDisplay() {
  if (!jsonSummaryElement) {
    return;
  }
  const parts = [];
  const variantRig = [currentJsonMetadata.variant, currentJsonMetadata.rig]
    .filter(Boolean)
    .join('/');
  if (variantRig) {
    parts.push(variantRig);
  }
  if (currentJsonMetadata.week) {
    parts.push(currentJsonMetadata.week);
  }
  if (typeof currentJsonMetadata.events === 'number') {
    parts.push(`${currentJsonMetadata.events} event${currentJsonMetadata.events === 1 ? '' : 's'}`);
  }
  if (parts.length === 0) {
    jsonSummaryElement.textContent = '';
    jsonSummaryElement.hidden = true;
    return;
  }
  jsonSummaryElement.textContent = parts.join(' · ');
  jsonSummaryElement.hidden = false;
}

function setJsonPayload(payload, options = {}) {
  if (!jsonOutputElement) {
    return;
  }

  let formatted = DEFAULT_JSON_PLACEHOLDER;
  let parsedPayload = null;
  if (typeof payload === 'string') {
    formatted = payload;
    try {
      parsedPayload = JSON.parse(payload);
    } catch (error) {
      parsedPayload = null;
    }
  } else if (payload && typeof payload === 'object') {
    parsedPayload = payload;
    try {
      formatted = JSON.stringify(payload, null, 2);
    } catch (error) {
      formatted = DEFAULT_JSON_PLACEHOLDER;
    }
  } else {
    parsedPayload = null;
  }

  jsonOutputElement.textContent = formatted;
  currentJsonText = formatted;

  const snapshot = typeof getConfigSnapshot === 'function' ? getConfigSnapshot() : {};
  const metadata = {
    variant: options.variant ?? snapshot.variant ?? '',
    rig: options.rig ?? snapshot.rig ?? '',
    week: '',
    events: null,
  };

  const weekFromOptions =
    typeof options.weekStart === 'string' && options.weekStart
      ? options.weekStart
      : parsedPayload && typeof parsedPayload.week_start === 'string'
      ? parsedPayload.week_start
      : snapshot.week_start || '';
  metadata.week = weekFromOptions;

  const scheduleForMeta = resolveVisualPayload(parsedPayload);
  if (scheduleForMeta && Array.isArray(scheduleForMeta.events)) {
    metadata.events = scheduleForMeta.events.length;
  }

  currentJsonMetadata = metadata;
  updateJsonActionsState();
  updateJsonSummaryDisplay();
  updateVisuals(parsedPayload);
  if (hasVisualEvents(parsedPayload)) {
    hideVisualsOverlay();
  } else if (!calendarHistoryState.currentRun && calendarHistoryState.runHistory.length === 0) {
    showVisualsEmptyState();
  }
}

loadRunHistoryFromStorage();

async function copyTextToClipboard(text) {
  const payload = typeof text === 'string' ? text : String(text ?? '');
  if (!payload) {
    throw new Error('Nothing to copy.');
  }
  if (navigator.clipboard && typeof navigator.clipboard.writeText === 'function') {
    await navigator.clipboard.writeText(payload);
    return;
  }

  const textarea = document.createElement('textarea');
  textarea.value = payload;
  textarea.setAttribute('readonly', '');
  textarea.style.position = 'absolute';
  textarea.style.left = '-9999px';
  document.body.append(textarea);
  textarea.select();
  const successful = document.execCommand ? document.execCommand('copy') : false;
  textarea.remove();
  if (!successful) {
    throw new Error('Copy command was rejected.');
  }
}

async function copyCurrentJsonToClipboard() {
  if (!hasJsonContent()) {
    return;
  }
  try {
    await copyTextToClipboard(currentJsonText);
    dispatchIntent({
      type: INTENT_TYPES.SHOW_TOAST,
      payload: {
        message: 'JSON copied',
        intent: 'success',
        duration: 2000,
      },
    });
  } catch (error) {
    dispatchIntent({
      type: INTENT_TYPES.SHOW_TOAST,
      payload: {
        message: 'Copy failed',
        description:
          error && error.message ? error.message : 'Unable to copy JSON to clipboard.',
        intent: 'error',
        duration: 4000,
      },
    });
  }
}

function sanitizeFileSegment(value, fallback) {
  if (!value) {
    return fallback;
  }
  const normalized = String(value).trim().replace(/\s+/g, '-');
  const cleaned = normalized.replace(/[^a-z0-9_-]/gi, '');
  return cleaned || fallback;
}

function saveCurrentJsonToFile() {
  if (!hasJsonContent()) {
    return;
  }
  const snapshot = typeof getConfigSnapshot === 'function' ? getConfigSnapshot() : {};
  const variant = currentJsonMetadata.variant || snapshot.variant || 'calendar';
  const rig = currentJsonMetadata.rig || snapshot.rig || 'rig';
  const week = currentJsonMetadata.week || snapshot.week_start || 'week';
  const fileName = `schedule_${sanitizeFileSegment(variant, 'calendar')}_${sanitizeFileSegment(
    rig,
    'rig',
  )}_${sanitizeFileSegment(week, 'week')}.json`;

  try {
    const blob = new Blob([currentJsonText], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = fileName;
    document.body.append(link);
    link.click();
    link.remove();
    window.setTimeout(() => {
      URL.revokeObjectURL(url);
    }, 0);
    dispatchIntent({
      type: INTENT_TYPES.SHOW_TOAST,
      payload: {
        message: 'JSON saved',
        description: fileName,
        intent: 'success',
        duration: 2200,
      },
    });
  } catch (error) {
    dispatchIntent({
      type: INTENT_TYPES.SHOW_TOAST,
      payload: {
        message: 'Save failed',
        description: error && error.message ? error.message : 'Unable to download JSON.',
        intent: 'error',
        duration: 4000,
      },
    });
  }
}

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

function handleUrchinSelect(activity) {
  if (!activity) {
    return;
  }
  dispatchIntent({
    type: INTENT_TYPES.SHOW_TOAST,
    payload: {
      message: activity.label || 'Activity selected',
      description: `${activity.start || '?'} – ${activity.end || '?'}`,
      intent: 'info',
      duration: 1800,
    },
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

function isISODate(value) {
  if (typeof value !== 'string') {
    return false;
  }
  const isoDatePattern = /^\d{4}-\d{2}-\d{2}$/;
  if (!isoDatePattern.test(value)) {
    return false;
  }
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return false;
  }
  return date.toISOString().slice(0, 10) === value;
}

function isTimeHHMM(value) {
  if (typeof value !== 'string') {
    return false;
  }
  const match = value.match(/^([0-1]\d|2[0-3]):([0-5]\d)$/);
  if (!match) {
    return false;
  }
  return match[0] === value;
}

function validateWebV1Calendar(obj) {
  const errors = [];

  if (!obj || typeof obj !== 'object' || Array.isArray(obj)) {
    errors.push('Payload must be an object.');
    return { ok: false, errors };
  }

  if (obj.schema_version !== 'web_v1_calendar') {
    errors.push('schema_version must equal "web_v1_calendar".');
  }

  if (!isISODate(obj.week_start)) {
    errors.push('week_start must be an ISO date (YYYY-MM-DD).');
  }

  if (!Array.isArray(obj.events)) {
    errors.push('events must be an array.');
  } else {
    obj.events.forEach((event, index) => {
      const prefix = `Event ${index + 1}:`;
      if (!event || typeof event !== 'object' || Array.isArray(event)) {
        errors.push(`${prefix} must be an object.`);
        return;
      }
      if (!isISODate(event.date)) {
        errors.push(`${prefix} date must be ISO formatted (YYYY-MM-DD).`);
      }
      if (!isTimeHHMM(event.start)) {
        errors.push(`${prefix} start must be HH:MM.`);
      }
      if (!isTimeHHMM(event.end)) {
        errors.push(`${prefix} end must be HH:MM.`);
      }
      if (typeof event.label !== 'string' || event.label.trim().length === 0) {
        errors.push(`${prefix} label must be a non-empty string.`);
      }
    });
  }

  return { ok: errors.length === 0, errors };
}

window.validateWebV1Calendar = validateWebV1Calendar;

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
  tabButtons.find((button) => button.classList.contains('root-tab--active'))
    ?.dataset.rootTab ||
  tabButtons.find((button) => button.classList.contains('active'))?.dataset.tab ||
  tabOrder[0];
if (typeof currentTab === 'string') {
  currentTab = currentTab.toLowerCase();
}
let consoleIndicator;
let pendingAutoSwitch = false;

function focusTabPanel(targetTab) {
  if (typeof targetTab !== 'string') {
    return;
  }
  const normalized = targetTab.toLowerCase();
  collectRootTabElements();
  const panel = tabPanelMap.get(normalized);
  if (!panel) {
    return;
  }
  const heading = tabHeadings.get(normalized);
  const focusTarget = heading instanceof HTMLElement ? heading : panel;
  if (focusTarget && typeof focusTarget.focus === 'function') {
    try {
      focusTarget.focus({ preventScroll: true });
    } catch (error) {
      focusTarget.focus();
    }
  }
}

function goToRootTab(id) {
  if (typeof id !== 'string' || !id) {
    return;
  }
  console.info('[root-tabs] switching to', id);
  const normalizedTarget = id.toLowerCase();
  if (!tabOrder.includes(normalizedTarget)) {
    return;
  }

  collectRootTabElements();

  const tabs = document.querySelectorAll('[data-root-tab]');
  const panels = document.querySelectorAll('[data-root-panel]');

  tabs.forEach((button) => {
    const buttonId = (button.dataset.rootTab || '').toLowerCase();
    const isActive = buttonId === normalizedTarget;
    button.classList.toggle('active', isActive);
    button.classList.toggle('root-tab--active', isActive);
    button.setAttribute('aria-selected', isActive ? 'true' : 'false');
    button.setAttribute('tabindex', isActive ? '0' : '-1');
  });

  panels.forEach((panel) => {
    const panelId = (panel.dataset.rootPanel || '').toLowerCase();
    const isActive = panelId === normalizedTarget;
    panel.classList.toggle('active', isActive);
    panel.classList.toggle('root-panel--active', isActive);
    panel.classList.toggle('is-hidden', !isActive);
    panel.toggleAttribute('hidden', !isActive);
    panel.setAttribute('aria-hidden', isActive ? 'false' : 'true');
  });

  currentTab = normalizedTarget;
  if (normalizedTarget === 'fixtures') {
    setFixturesHistoryBadgeVisible(false);
  }
  if (normalizedTarget === 'console') {
    dispatchIntent({
      type: INTENT_TYPES.APP_STATUS,
      payload: { channel: 'console-indicator', visible: false },
    });
    pendingAutoSwitch = false;
  }
}

function initRootTabs() {
  if (!document.body) {
    return;
  }
  if (document.body.dataset.rootTabsHydrated === '1') {
    console.info('[root-tabs] already hydrated');
    return;
  }
  document.body.dataset.rootTabsHydrated = '1';

  const bar = document.querySelector('[data-root-tabs]');
  if (!bar) {
    console.warn('[root-tabs] no [data-root-tabs] container found');
    return;
  }

  console.info('[root-tabs] hydrating');

  collectRootTabElements();

  bar.addEventListener('click', (event) => {
    const btn = event.target.closest('[data-root-tab]');
    if (!btn) {
      return;
    }
    event.preventDefault();
    const id = btn.dataset.rootTab;
    if (!id) {
      return;
    }
    console.info('[root-tabs] click on', id);
    goToRootTab(id);
    focusTabPanel(id);
  });

  tabButtons.forEach((button) => {
    button.addEventListener('keydown', handleRootTabKeydown);
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

  const firstActive = document.querySelector('[data-root-tab].root-tab--active');
  const first = firstActive || document.querySelector('[data-root-tab]');
  if (first && first.dataset.rootTab) {
    goToRootTab(first.dataset.rootTab);
  }
}

registerIntentHandler(INTENT_TYPES.NAVIGATE_TAB, (payload = {}) => {
  const target = typeof payload.tab === 'string' ? payload.tab : undefined;
  if (!target) {
    return;
  }
  goToRootTab(target);
  if (payload.focusPanel === true) {
    focusTabPanel(target);
  }
});

document.addEventListener('DOMContentLoaded', () => {
  console.info('[app] DOMContentLoaded');
  initRootTabs();
  hydrateConfigPanel();
  hydrateGlobalActions();
  hydrateBatchPanel();
  hydrateConsolePanel();
  hydrateJsonPanel();
  hydrateFixturesPanel();
  hydrateLogsPanel();
  const initialVisualData =
    typeof window !== 'undefined' && window.__currentScheduleData
      ? window.__currentScheduleData
      : null;
  safeInitVisuals(initialVisualData);
});

function handleRootTabKeydown(event) {
  const { key } = event;
  if (event.altKey || event.ctrlKey || event.metaKey) {
    return;
  }
  const button = event.currentTarget;
  if (!(button instanceof HTMLElement)) {
    return;
  }
  const tabKey =
    (button.dataset.rootTab || button.dataset.tab || '').toLowerCase();
  if (!tabKey) {
    return;
  }
  if (key === 'ArrowRight' || key === 'ArrowLeft') {
    event.preventDefault();
    const currentIndex = tabOrder.indexOf(tabKey);
    if (currentIndex === -1) {
      return;
    }
    const delta = key === 'ArrowRight' ? 1 : -1;
    const nextIndex = (currentIndex + delta + tabOrder.length) % tabOrder.length;
    const nextTab = tabOrder[nextIndex];
    dispatchIntent({
      type: INTENT_TYPES.NAVIGATE_TAB,
      payload: { tab: nextTab, focusPanel: true },
    });
    return;
  }
  if (key === 'Home') {
    event.preventDefault();
    dispatchIntent({
      type: INTENT_TYPES.NAVIGATE_TAB,
      payload: { tab: tabOrder[0], focusPanel: true },
    });
    return;
  }
  if (key === 'End') {
    event.preventDefault();
    dispatchIntent({
      type: INTENT_TYPES.NAVIGATE_TAB,
      payload: { tab: tabOrder[tabOrder.length - 1], focusPanel: true },
    });
    return;
  }
  if (key === 'Enter' || key === ' ') {
    event.preventDefault();
    dispatchIntent({
      type: INTENT_TYPES.NAVIGATE_TAB,
      payload: { tab: tabKey, focusPanel: true },
    });
  }
}

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
  { label: 'Go to Visuals', tab: 'visuals' },
  { label: 'Go to Batch', tab: 'batch' },
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
        payload: { tab: action.tab, focusPanel: true },
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
        payload: { tab: targetTab, focusPanel: true },
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
const defaultResultMessage = 'Result JSON will appear here.';

const consoleRuntimePresets = {
  'mk2-quick-test': {
    label: 'Run MK2 quick test',
    script: String.raw`
from datetime import date
from rigs.workforce_rig import WorkforceRig
from modules.unique_events import UniqueDay
from yearly_budget import YearlyBudget

RUNNER_CONFIG = globals().get("RUNNER_CONFIG", {})
EXECUTION_INPUTS = globals().get("EXECUTION_INPUTS", {})


def _build_budget(data):
    if not isinstance(data, dict):
        return None

    year = int(data.get("year") or date.today().year)
    budget = YearlyBudget(
        person_id=data.get("person_id", "console"),
        year=year,
        vacation_days=int(data.get("vacation_days", 20)),
        sick_days_taken=int(data.get("sick_days_taken", 0)),
    )

    for entry in data.get("unique_days", []):
        try:
            unique = UniqueDay(
                date=date.fromisoformat(entry["date"]),
                day_type=entry.get("day_type", "custom"),
                rules=entry.get("rules", {}),
                priority=int(entry.get("priority", 5)),
            )
        except Exception:  # pragma: no cover - defensive in sample script
            continue
        budget.add_unique_day(unique)

    return budget


def main():
    archetype = EXECUTION_INPUTS.get("archetype", "office")
    seed = int(EXECUTION_INPUTS.get("seed", 7))
    start_text = EXECUTION_INPUTS.get("start_date")
    start_date = date.fromisoformat(start_text) if start_text else date.today()

    print(f"Generating MK2 workforce schedule for {archetype} (seed={seed})")

    rig = WorkforceRig()
    profile, templates = rig.select_profile(archetype)
    yearly_budget = _build_budget(EXECUTION_INPUTS.get("yearly_budget"))

    result = rig.generate_complete_week(
        profile,
        start_date,
        seed,
        templates,
        yearly_budget,
    )

    issue_count = len(result.get("issues", []))
    print(f"Issues detected: {issue_count}")
    print(f"Events generated: {len(result.get('events', []))}")

    return result
`.trim(),
    runnerConfig: {
      description: 'Workforce rig quick run using MK2 engine.',
      engine: 'mk2',
      rig: 'workforce',
    },
    inputs: {
      archetype: 'office',
      seed: 7,
    },
  },
  blank: {
    label: 'Blank script',
    script: '# Write your script here\n',
    runnerConfig: {},
    inputs: {},
  },
};

const consoleState = {
  scriptText: '',
  runnerConfigText: '',
  inputsText: '',
  running: false,
};

const consoleRunEndpoint = '/.netlify/functions/tes-runner';

let stdoutOutput;
let stderrOutput;
let resultOutput;
let consoleScriptTextarea;
let consoleConfigTextarea;
let consoleInputsTextarea;
let consoleRunButton;
let consolePresetSelect;
let consoleRunMeta;
let jsonOutputElement;
let initializeRuntimeButton;
let generateButton;
let validateJsonButton;
let runtimeReady = false;
let runtimeLoadingPromise;
let runtimeStatus = 'idle';
let hasShownRuntimeReadyToast = false;

let consoleStructuredContainer;
let consoleStructuredSummary;
let consoleStructuredCopyButton;
let consoleStructuredFailuresDetails;
let consoleStructuredFailuresBody;
let consoleStructuredSysPathDetails;
let consoleStructuredSysPathList;
let currentStructuredConsolePayload = null;
let calendarConfigState = null;

let pyWorker;
try {
  const workerUrl = new URL('./workers/pyRunner.js', import.meta.url);
  workerUrl.searchParams.set('debug', DEBUG ? '1' : '0');
  pyWorker = new Worker(workerUrl, { type: 'module' });
} catch (error) {
  console.error('Failed to initialize runtime worker:', error);
}

let workerMessageId = 0;
const workerPendingRequests = new Map();

if (pyWorker) {
  pyWorker.addEventListener('message', (event) => {
    const { data } = event;
    if (!data) {
      return;
    }
    if (data.type === 'worker-log') {
      handleWorkerLogMessage(data);
      return;
    }
    if (data.type === 'worker-unhandled') {
      handleWorkerUnhandledMessage(data);
      return;
    }
    if (typeof data.id === 'undefined') {
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

function updateGenerateButtonDisabledForRuntime() {
  if (!generateButton) {
    return;
  }
  const shouldDisable =
    isGeneratingCalendar || runtimeStatus === 'loading' || runtimeStatus === 'error';
  generateButton.disabled = shouldDisable;
  updateRuntimeButtonState(generateButton);
}

function setGenerateButtonState(loading) {
  isGeneratingCalendar = Boolean(loading);
  if (!generateButton) {
    return;
  }
  generateButton.textContent = isGeneratingCalendar
    ? GENERATE_BUTTON_LOADING_LABEL
    : GENERATE_BUTTON_DEFAULT_LABEL;
  updateGenerateButtonDisabledForRuntime();
}

function handleRandomizeSeedToggleChange() {
  if (!randomizeSeedToggle) {
    return;
  }
  randomizeSeed = randomizeSeedToggle.checked;
  persistRandomizeSeedPreference(randomizeSeed);
  updateRandomizeSeedToggleUI();
}

function prepareCalendarGeneration({ snapshot, seedValue } = {}) {
  const configSnapshot =
    snapshot && typeof snapshot === 'object'
      ? snapshot
      : typeof getConfigSnapshot === 'function'
      ? getConfigSnapshot()
      : {};

  const variantId = configSnapshot.variant || 'mk1';
  const rigId = configSnapshot.rig || 'default';
  const config = calendarConfigState || {};
  const archetype = config?.common?.archetype || '';
  const weekStartValue = configSnapshot.week_start || '';

  let effectiveSeed =
    typeof seedValue !== 'undefined' ? seedValue : configSnapshot.seed || '';
  if (typeof effectiveSeed !== 'string') {
    effectiveSeed =
      effectiveSeed === null || typeof effectiveSeed === 'undefined'
        ? ''
        : String(effectiveSeed);
  }

  const seedNumber = Number.parseInt(effectiveSeed, 10);
  const normalizedSeed = Number.isFinite(seedNumber) ? seedNumber : effectiveSeed;

  const workerArgs = {
    class: 'calendar',
    variant: variantId,
    rig: rigId,
    archetype,
    week_start: weekStartValue,
    seed: normalizedSeed,
  };

  let yearlyBudget = null;
  if (variantId === 'mk2' && rigId === 'workforce') {
    const budgetText = config?.mk2?.workforce?.budgetText || '';
    if (budgetText && budgetText.trim()) {
      try {
        yearlyBudget = JSON.parse(budgetText);
      } catch (parseError) {
        throw { error: 'Invalid yearly budget JSON.', stdout: '', stderr: '' };
      }
    }
  }

  if (yearlyBudget !== null) {
    workerArgs.yearly_budget = yearlyBudget;
  }

  const inputsSnapshot = {
    archetype,
    week_start: weekStartValue,
    seed: effectiveSeed,
  };
  if (yearlyBudget !== null) {
    inputsSnapshot.budget = true;
  }

  return {
    runnerFn: RUNNER_FN_MAP[variantId]?.[rigId] || 'mock_run',
    workerArgs,
    variantId,
    rigId,
    archetype,
    weekStart: weekStartValue,
    seedValue: effectiveSeed,
    normalizedSeed,
    inputsSnapshot,
  };
}

async function handleGenerate(event) {
  if (event && typeof event.preventDefault === 'function') {
    event.preventDefault();
  }
  if (isGeneratingCalendar) {
    return;
  }

  let randomizedSeedText = '';
  if (randomizeSeed) {
    randomizedSeedText = String(Math.floor(Math.random() * 1_000_000_000));
    let appliedSeed = null;
    if (calendarConfigController && typeof calendarConfigController.setSeed === 'function') {
      appliedSeed = calendarConfigController.setSeed(randomizedSeedText, {
        markUserEdited: true,
        persist: true,
      });
      if (typeof appliedSeed === 'string' && appliedSeed.trim().length > 0) {
        randomizedSeedText = appliedSeed.trim();
      }
    }
    if (!appliedSeed && calendarConfigState && calendarConfigState.common) {
      calendarConfigState.common.seed = randomizedSeedText;
      updateSeedIndicator(randomizedSeedText);
    }
  }

  const snapshot = typeof getConfigSnapshot === 'function' ? getConfigSnapshot() : {};
  let seedValue = snapshot.seed || randomizedSeedText;

  updateSeedIndicator(seedValue);

  setGenerateButtonState(true);
  showVisualsOverlay('Generating schedule…', { loading: true });
  calendarHistoryState.activeId = null;
  calendarHistoryState.currentRun = null;
  renderCalendarRunHistory();

  beginConsoleRun('Generating payload…', { autoSwitch: false });

  try {
    const generationConfig = prepareCalendarGeneration({ snapshot, seedValue });
    seedValue = generationConfig.seedValue;
    updateSeedIndicator(seedValue);
    const normalizedSeed = generationConfig.normalizedSeed;
    const variantId = generationConfig.variantId;
    const rigId = generationConfig.rigId;
    const archetype = generationConfig.archetype;
    const weekStartValue = generationConfig.weekStart;
    const inputsSnapshot = { ...(generationConfig.inputsSnapshot || {}) };

    const { result = null, stdout = '', stderr = '', fallback = false } =
      await sendWorkerMessage('run', {
        fn: generationConfig.runnerFn,
        args: generationConfig.workerArgs,
      });

    renderConsoleOutputs({ stdout, stderr });
    if (fallback) {
      appendConsoleLog('Pyodide import failed → mock used');
    }

    if (!result || typeof result !== 'object') {
      appendConsoleLog('error: No result returned from worker.');
      showVisualsOverlay('No result returned from worker.', { loading: false });
      dispatchIntent({
        type: INTENT_TYPES.SHOW_TOAST,
        payload: {
          message: 'Generation failed',
          description: 'No result returned from worker.',
          intent: 'error',
          duration: 4000,
        },
      });
      return;
    }

    setJsonPayload(result, {
      variant: variantId,
      rig: rigId,
      weekStart: result.week_start || weekStartValue,
    });
    updateJsonActionsState();
    hideVisualsOverlay();

    const eventsCount = Array.isArray(result.events) ? result.events.length : 0;
    inputsSnapshot.seed = seedValue;

    appendActivityBalanceSnapshot(result);

    recordCalendarHistoryEntry({
      archetype,
      seed: normalizedSeed,
      variant: variantId,
      rig: rigId,
      weekStart:
        typeof result.week_start === 'string' && result.week_start
          ? result.week_start
          : weekStartValue,
      rawResult: result,
      summary: computeCalendarHistorySummary(result.events),
      timestamp: new Date().toISOString(),
    });

    addRunHistoryEntry({
      kind: 'generate',
      ts: Date.now(),
      class: 'calendar',
      variant: variantId,
      rig: rigId,
      week_start:
        typeof result.week_start === 'string' && result.week_start
          ? result.week_start
          : weekStartValue,
      label: 'Generated schedule',
      seed: normalizedSeed,
      payload: result,
      inputs: inputsSnapshot,
      resultSummary: { events: eventsCount },
    });

    appendConsoleLog('Run completed');
  } catch (error) {
    const summary = formatStructuredErrorSummary(error);
    renderConsoleOutputs({
      stdout: error?.stdout || '',
      stderr: error?.stderr || summary,
      structured: error,
    });
    const description =
      summary && summary.length > 0
        ? summary
        : typeof error?.error === 'string' && error.error
        ? error.error
        : error instanceof Error && error.message
        ? error.message
        : 'Generation failed.';
    console.error('Generation failed:', error);
    showVisualsOverlay(description, { loading: false });
    dispatchIntent({
      type: INTENT_TYPES.SHOW_TOAST,
      payload: {
        message: 'Generation failed',
        description,
        intent: 'error',
        duration: 5000,
      },
    });
  } finally {
    setGenerateButtonState(false);
  }
}

function setBatchSize(size) {
  const numeric = Number.parseInt(size, 10);
  if (!Number.isFinite(numeric) || numeric <= 0) {
    return;
  }
  batchState.size = numeric;
  batchState.sizeButtons.forEach((button, value) => {
    const isActive = value === numeric;
    button.classList.toggle('is-active', isActive);
    button.setAttribute('aria-pressed', isActive ? 'true' : 'false');
  });
}

function setBatchScaleMode(mode) {
  const normalized = mode === 'absolute' ? 'absolute' : 'proportional';
  if (batchState.scaleMode === normalized) {
    updateBatchControlsState();
    return;
  }
  batchState.scaleMode = normalized;
  renderBatchResults();
  updateBatchControlsState();
}

function updateBatchControlsState() {
  batchState.sizeButtons.forEach((button) => {
    button.disabled = batchState.isRunning;
  });
  batchState.modeButtons.forEach((button, mode) => {
    const isActive = mode === batchState.scaleMode;
    button.classList.toggle('is-active', isActive);
    button.setAttribute('aria-pressed', isActive ? 'true' : 'false');
    button.disabled = batchState.isRunning && mode !== batchState.scaleMode;
  });
  if (batchState.runButton) {
    batchState.runButton.disabled = batchState.isRunning;
    batchState.runButton.textContent = batchState.isRunning ? 'Running…' : 'Run batch';
    batchState.runButton.setAttribute('aria-busy', batchState.isRunning ? 'true' : 'false');
  }
}

function updateBatchSummary() {
  if (!batchState.summary) {
    return;
  }
  if (batchState.isRunning) {
    const target = batchState.targetRuns;
    const completed = Math.min(batchState.completedRuns, target);
    batchState.summary.textContent =
      target > 0 ? `Running batch… ${completed}/${target}` : 'Running batch…';
    return;
  }
  if (batchState.lastRunCount > 0) {
    const count = batchState.lastRunCount;
    batchState.summary.textContent = `Last batch: ${count} run${count === 1 ? '' : 's'}`;
    return;
  }
  batchState.summary.textContent = 'Run a batch to begin.';
}

function getBatchSegmentLabel(segment, percentValue) {
  if (segment.percentage >= 0.3) {
    return `${segment.label} · ${percentValue}%`;
  }
  if (segment.percentage >= 0.18) {
    return `${percentValue}%`;
  }
  return '';
}

function renderBatchResults() {
  if (!batchState.stack || !batchState.empty) {
    return;
  }
  const results = Array.isArray(batchState.results) ? batchState.results : [];
  batchState.stack.innerHTML = '';
  const hasResults = results.length > 0;
  batchState.stack.hidden = !hasResults;
  const emptyMessage = batchState.isRunning ? 'Running batch…' : 'Run a batch to see results.';
  batchState.empty.textContent = emptyMessage;
  batchState.empty.hidden = hasResults;
  if (!hasResults) {
    return;
  }

  const maxTotalMinutes = results.reduce(
    (max, run) => Math.max(max, Number.isFinite(run.totalMinutes) ? run.totalMinutes : 0),
    0
  );
  const fragment = document.createDocumentFragment();
  results
    .slice()
    .reverse()
    .forEach((run) => {
      const row = document.createElement('div');
      row.className = 'batch-results__row';
      row.dataset.index = String(run.index || 0);

      const labelWrapper = document.createElement('div');
      labelWrapper.className = 'batch-results__label';

      const badge = document.createElement('span');
      badge.className = 'batch-results__run';
      badge.textContent = `Run #${run.index || 0}`;
      labelWrapper.append(badge);

      const duration = Number.isFinite(run.totalMinutes)
        ? formatDuration(Math.round(run.totalMinutes))
        : '';
      if (duration) {
        const meta = document.createElement('span');
        meta.className = 'batch-results__duration';
        meta.textContent = duration;
        labelWrapper.append(meta);
      }

      const bar = document.createElement('div');
      bar.className = 'batch-results__bar';

      const track = document.createElement('div');
      track.className = 'batch-results__track';
      const scale =
        batchState.scaleMode === 'absolute' && maxTotalMinutes > 0
          ? Math.max(0, Math.min(1, (run.totalMinutes || 0) / maxTotalMinutes))
          : 1;
      track.style.setProperty('--batch-row-scale', String(scale));
      track.setAttribute('role', 'list');

      const segments = Array.isArray(run.segments) ? run.segments : [];
      segments.forEach((segment) => {
        const element = document.createElement('div');
        element.className = 'activity-share__segment batch-results__segment';
        element.style.setProperty('--segment-color', segment.color || '#6366f1');
        element.style.setProperty(
          '--segment-text-color',
          computeSegmentTextColor(segment.color)
        );
        element.style.flexGrow = String(segment.minutes || 0);
        element.setAttribute('role', 'listitem');
        const total = run.totalMinutes || 0;
        const percentValue = total > 0 ? Math.round((segment.minutes / total) * 100) : 0;
        const labelText = getBatchSegmentLabel(segment, percentValue);
        if (labelText) {
          const label = document.createElement('span');
          label.className = 'batch-results__segment-label';
          label.textContent = labelText;
          element.append(label);
        }
        const durationLabel = formatDuration(Math.round(segment.minutes || 0));
        element.setAttribute(
          'aria-label',
          `${segment.label}: ${durationLabel}${percentValue ? ` (${percentValue}%)` : ''}`
        );
        element.tabIndex = -1;
        track.append(element);
      });

      bar.append(track);
      row.append(labelWrapper, bar);
      fragment.append(row);
    });

  batchState.stack.append(fragment);
}

async function runBatchGenerations(count) {
  const target = Number.parseInt(count, 10);
  if (!Number.isFinite(target) || target <= 0) {
    return;
  }
  if (batchState.isRunning) {
    return;
  }

  batchState.isRunning = true;
  batchState.targetRuns = target;
  batchState.completedRuns = 0;
  batchState.results = [];
  renderBatchResults();
  updateBatchSummary();
  updateBatchControlsState();

  const results = [];

  try {
    await ensureRuntimeLoaded();

    const snapshot = typeof getConfigSnapshot === 'function' ? getConfigSnapshot() : {};

    for (let index = 0; index < target; index += 1) {
      let seedValue = snapshot.seed || '';
      if (randomizeSeed) {
        seedValue = String(Math.floor(Math.random() * 1_000_000_000));
      }

      const generationConfig = prepareCalendarGeneration({ snapshot, seedValue });
      const { result = null } = await sendWorkerMessage('run', {
        fn: generationConfig.runnerFn,
        args: generationConfig.workerArgs,
      });

      if (!result || typeof result !== 'object') {
        throw { error: 'No result returned from worker.', stdout: '', stderr: '' };
      }

      const entry = createBalanceHistoryEntry(result, { runNumber: index + 1 });
      const totalMinutes = entry?.totalMinutes || 0;
      const segments = Array.isArray(entry?.segments)
        ? entry.segments.map((segment) => ({ ...segment }))
        : [];
      const activities = Array.isArray(entry?.activities)
        ? entry.activities.map((activity) => ({
            id: activity.id,
            name: activity.label,
            color: activity.color,
            minutes: activity.minutes,
          }))
        : [];

      results.push({
        index: index + 1,
        totalMinutes,
        segments,
        activities,
      });

      batchState.completedRuns = index + 1;
      updateBatchSummary();

      if (index % 20 === 19) {
        await new Promise((resolve) => setTimeout(resolve, 0));
      }
    }
  } catch (error) {
    console.error('Batch generation failed:', error);
    const summary = formatStructuredErrorSummary(error);
    const description =
      summary && summary.length > 0
        ? summary
        : typeof error?.error === 'string' && error.error
        ? error.error
        : error instanceof Error && error.message
        ? error.message
        : 'Batch generation failed.';
    dispatchIntent({
      type: INTENT_TYPES.SHOW_TOAST,
      payload: {
        message: 'Batch failed',
        description,
        intent: 'error',
        duration: 5000,
      },
    });
  } finally {
    batchState.results = results;
    if (results.length > 0) {
      batchState.lastRunCount = results.length;
    }
    batchState.isRunning = false;
    batchState.targetRuns = 0;
    batchState.completedRuns = 0;
    renderBatchResults();
    updateBatchSummary();
    updateBatchControlsState();
  }
}

function hydrateBatchPanel() {
  const panel = document.querySelector('[data-root-panel="batch"]');
  if (!panel || panel.dataset.batchHydrated === '1') {
    return;
  }
  panel.dataset.batchHydrated = '1';

  batchState.panel = panel;
  batchState.summary = panel.querySelector('[data-batch-summary]');
  batchState.stack = panel.querySelector('[data-batch-stack]');
  batchState.empty = panel.querySelector('[data-batch-empty]');

  batchState.sizeButtons = new Map();
  const sizeButtons = panel.querySelectorAll('[data-batch-size]');
  sizeButtons.forEach((button) => {
    const value = Number.parseInt(button.dataset.batchSize || '', 10);
    if (!Number.isFinite(value) || value <= 0) {
      return;
    }
    batchState.sizeButtons.set(value, button);
    button.type = 'button';
    button.setAttribute('aria-pressed', value === batchState.size ? 'true' : 'false');
    button.addEventListener('click', () => {
      if (batchState.isRunning) {
        return;
      }
      setBatchSize(value);
      updateBatchControlsState();
    });
  });

  batchState.modeButtons = new Map();
  const modeButtons = panel.querySelectorAll('[data-batch-mode]');
  modeButtons.forEach((button) => {
    const mode = button.dataset.batchMode === 'absolute' ? 'absolute' : 'proportional';
    batchState.modeButtons.set(mode, button);
    button.type = 'button';
    button.setAttribute('aria-pressed', mode === batchState.scaleMode ? 'true' : 'false');
    button.addEventListener('click', () => {
      if (batchState.scaleMode === mode) {
        return;
      }
      setBatchScaleMode(mode);
    });
  });

  const runButton = panel.querySelector('[data-batch-run]');
  if (runButton instanceof HTMLButtonElement) {
    batchState.runButton = runButton;
    runButton.addEventListener('click', () => {
      runBatchGenerations(batchState.size);
    });
  }

  setBatchSize(batchState.size);
  setBatchScaleMode(batchState.scaleMode);
  renderBatchResults();
  updateBatchSummary();
  updateBatchControlsState();
}

function setConsoleOutputContent(element, text, defaultMessage) {
  if (!element) {
    return;
  }
  const content = text && text.length > 0 ? text : defaultMessage;
  if ('value' in element) {
    element.value = content;
  } else {
    element.textContent = content;
  }
  if (typeof element.scrollHeight === 'number' && typeof element.scrollTop === 'number') {
    element.scrollTop = element.scrollHeight;
  }
}

function getConsoleOutputContent(element, defaultMessage) {
  if (!element) {
    return '';
  }
  const value = 'value' in element ? element.value || '' : element.textContent || '';
  return value && value !== defaultMessage ? value : '';
}

function setConsoleResult(value) {
  if (!resultOutput) {
    return;
  }
  let text = '';
  if (typeof value === 'string') {
    text = value;
  } else if (value && typeof value === 'object') {
    try {
      text = JSON.stringify(value, null, 2);
    } catch (error) {
      text = String(value);
    }
  } else if (typeof value !== 'undefined' && value !== null) {
    text = String(value);
  }
  setConsoleOutputContent(resultOutput, text, defaultResultMessage);
}

function setConsoleRunMeta(message) {
  if (!consoleRunMeta) {
    return;
  }
  consoleRunMeta.textContent = message || '';
}

function updateConsoleRunButtonState() {
  if (!consoleRunButton) {
    return;
  }
  const hasScript = consoleState.scriptText.trim().length > 0;
  const isRunning = consoleState.running;
  consoleRunButton.disabled = isRunning || !hasScript;
  consoleRunButton.textContent = isRunning ? 'Running…' : 'Run';
}

function loadConsolePreset(presetId) {
  const preset = consoleRuntimePresets[presetId];
  if (!preset) {
    return;
  }
  const scriptText = typeof preset.script === 'string' ? preset.script : '';
  const configText = JSON.stringify(preset.runnerConfig ?? {}, null, 2);
  const inputsText = JSON.stringify(preset.inputs ?? {}, null, 2);

  if (consoleScriptTextarea) {
    consoleScriptTextarea.value = scriptText;
  }
  if (consoleConfigTextarea) {
    consoleConfigTextarea.value = configText;
  }
  if (consoleInputsTextarea) {
    consoleInputsTextarea.value = inputsText;
  }

  consoleState.scriptText = scriptText;
  consoleState.runnerConfigText = configText;
  consoleState.inputsText = inputsText;
  updateConsoleRunButtonState();
}

function parseConsoleJson(rawText, label) {
  const trimmed = typeof rawText === 'string' ? rawText.trim() : '';
  if (!trimmed) {
    return { ok: true, value: {} };
  }
  try {
    return { ok: true, value: JSON.parse(trimmed) };
  } catch (error) {
    return {
      ok: false,
      error: `${label} JSON error: ${error?.message || 'Unable to parse value.'}`,
    };
  }
}

function formatElapsedMs(ms) {
  if (!Number.isFinite(ms)) {
    return '';
  }
  if (ms < 1000) {
    return `${ms.toFixed(0)}ms`;
  }
  const seconds = ms / 1000;
  if (seconds >= 10) {
    return `${seconds.toFixed(1)}s`;
  }
  return `${seconds.toFixed(2)}s`;
}

async function handleConsoleRun() {
  if (consoleState.running) {
    return;
  }
  const script = consoleState.scriptText.trim();
  if (!script) {
    renderConsoleOutputs({ stdout: '', stderr: 'Script is required.' });
    setConsoleRunMeta('Run blocked: missing script');
    return;
  }

  const configParse = parseConsoleJson(consoleState.runnerConfigText, 'Runner config');
  if (!configParse.ok) {
    renderConsoleOutputs({ stdout: '', stderr: configParse.error });
    setConsoleResult(null);
    setConsoleRunMeta('Input parsing failed');
    if (consoleConfigTextarea) {
      consoleConfigTextarea.focus();
    }
    return;
  }

  const inputsParse = parseConsoleJson(consoleState.inputsText, 'Execution inputs');
  if (!inputsParse.ok) {
    renderConsoleOutputs({ stdout: '', stderr: inputsParse.error });
    setConsoleResult(null);
    setConsoleRunMeta('Input parsing failed');
    if (consoleInputsTextarea) {
      consoleInputsTextarea.focus();
    }
    return;
  }

  consoleState.running = true;
  updateConsoleRunButtonState();
  beginConsoleRun('Sending request…');
  setConsoleRunMeta('Running…');

  const requestPayload = {
    script,
    runnerConfig: configParse.value,
    inputs: inputsParse.value,
  };

  const start = typeof performance !== 'undefined' ? performance.now() : Date.now();

  try {
    const response = await fetch(consoleRunEndpoint, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(requestPayload),
    });

    const elapsedRaw = (typeof performance !== 'undefined' ? performance.now() : Date.now()) - start;
    const elapsedMs = Number.isFinite(elapsedRaw) ? Math.max(0, elapsedRaw) : null;

    let responseBody = null;
    let text = '';
    try {
      text = await response.text();
      responseBody = text ? JSON.parse(text) : {};
    } catch (error) {
      renderConsoleOutputs({ stdout: '', stderr: 'Failed to parse server response.' });
      setConsoleResult(null);
      setConsoleRunMeta(
        `Status ${response.status} • ${elapsedMs !== null ? formatElapsedMs(elapsedMs) : '—'}`
      );
      return;
    }

    const structuredPayload =
      responseBody && typeof responseBody.structured === 'object'
        ? responseBody.structured
        : null;
    const bridgeStderr = typeof responseBody.bridgeStderr === 'string' ? responseBody.bridgeStderr : '';

    const combinedStderr = (() => {
      const base = typeof responseBody.stderr === 'string' ? responseBody.stderr : '';
      if (bridgeStderr && base) {
        return `${base}\n${bridgeStderr}`;
      }
      return base || bridgeStderr;
    })();

    const stdoutText = typeof responseBody.stdout === 'string' ? responseBody.stdout : '';

    if (response.ok) {
      renderConsoleOutputs({ stdout: stdoutText, stderr: combinedStderr, structured: structuredPayload });

      let resultValue = null;
      if (typeof responseBody.result !== 'undefined') {
        resultValue = responseBody.result;
      } else if (typeof responseBody.resultJSON === 'string') {
        try {
          resultValue = JSON.parse(responseBody.resultJSON);
        } catch (error) {
          resultValue = responseBody.resultJSON;
        }
      }
      setConsoleResult(resultValue);

      const parts = [`Status ${response.status}`];
      if (elapsedMs !== null) {
        parts.push(formatElapsedMs(elapsedMs));
      }
      if (typeof responseBody.pythonBinary === 'string' && responseBody.pythonBinary) {
        parts.push(responseBody.pythonBinary);
      }
      setConsoleRunMeta(parts.join(' • '));
    } else {
      const errorMessage =
        typeof responseBody.error === 'string' && responseBody.error
          ? responseBody.error
          : `Run failed with status ${response.status}`;
      const stderrText = combinedStderr || errorMessage;
      renderConsoleOutputs({ stdout: stdoutText, stderr: stderrText, structured: structuredPayload });
      setConsoleResult(null);
      const parts = [`Status ${response.status}`];
      if (elapsedMs !== null) {
        parts.push(formatElapsedMs(elapsedMs));
      }
      setConsoleRunMeta(`${parts.join(' • ')} • error`);
    }
  } catch (error) {
    renderConsoleOutputs({
      stdout: '',
      stderr: error?.message || 'Request failed.',
    });
    setConsoleResult(null);
    setConsoleRunMeta('Request failed');
  } finally {
    consoleState.running = false;
    updateConsoleRunButtonState();
  }
}

function applyConsoleIndicatorVisible(isVisible) {
  if (!consoleIndicator) {
    return;
  }
  consoleIndicator.style.opacity = isVisible ? '1' : '0';
}

function beginConsoleRun(message, { autoSwitch = true } = {}) {
  pendingAutoSwitch = Boolean(autoSwitch);
  setConsoleOutputContent(stdoutOutput, message, defaultStdoutMessage);
  setConsoleOutputContent(stderrOutput, '', defaultStderrMessage);
  setConsoleResult(null);
  setConsoleRunMeta('Running…');
  updateConsoleStructuredPayload(null);
  setJsonValidationBadge('clear');
  if (currentTab === 'console') {
    dispatchIntent({
      type: INTENT_TYPES.APP_STATUS,
      payload: { channel: 'console-indicator', visible: false },
    });
  }
}

function renderConsoleOutputs({ stdout, stderr, structured } = {}) {
  const structuredPayload = structured && typeof structured === 'object' ? structured : null;
  const summary = structuredPayload ? formatStructuredErrorSummary(structuredPayload) : '';

  const stdoutText = typeof stdout === 'string' && stdout ? stdout : '';
  setConsoleOutputContent(stdoutOutput, stdoutText, defaultStdoutMessage);

  let stderrText = typeof stderr === 'string' && stderr ? stderr : '';
  if (structuredPayload) {
    const fallback = summary
      || (typeof structuredPayload.message === 'string' && structuredPayload.message)
      || (typeof structuredPayload.error === 'string' && structuredPayload.error)
      || '';
    if (!stderrText && fallback) {
      stderrText = fallback;
    }
  }

  setConsoleOutputContent(stderrOutput, stderrText, defaultStderrMessage);

  updateConsoleStructuredPayload(structuredPayload);

  if (currentTab !== 'console') {
    const hasOutput = Boolean(stdoutText) || Boolean(stderrText) || Boolean(structuredPayload);
    dispatchIntent({
      type: INTENT_TYPES.APP_STATUS,
      payload: { channel: 'console-indicator', visible: hasOutput },
    });
  }

  if ((stdoutText && stdoutText.length > 0) || (stderrText && stderrText.length > 0) || structuredPayload) {
    if (pendingAutoSwitch && currentTab !== 'console') {
      dispatchIntent({
        type: INTENT_TYPES.NAVIGATE_TAB,
        payload: { tab: 'console' },
      });
    }
  }
  pendingAutoSwitch = false;
}

function appendConsoleLog(message) {
  if (!stdoutOutput) {
    return;
  }
  const logText = typeof message === 'string' ? message.trim() : String(message ?? '');
  if (!logText) {
    return;
  }
  const previousStdout = getConsoleOutputContent(stdoutOutput, defaultStdoutMessage);
  const mergedStdout = previousStdout ? `${previousStdout}\n${logText}` : logText;
  const previousStderr = getConsoleOutputContent(stderrOutput, defaultStderrMessage);
  renderConsoleOutputs({ stdout: mergedStdout, stderr: previousStderr });
}

function formatStructuredErrorSummary(payload) {
  if (!payload || typeof payload !== 'object') {
    return '';
  }
  const parts = [];
  const stage = typeof payload.stage === 'string' && payload.stage ? payload.stage : '';
  const type = typeof payload.type === 'string' && payload.type ? payload.type : '';
  const failCount = Number.isFinite(payload.failCount)
    ? payload.failCount
    : Array.isArray(payload.failures)
    ? payload.failures.length
    : null;
  const okCount = Number.isFinite(payload.okCount) ? payload.okCount : null;
  const manifestSize = Number.isFinite(payload.manifestSize) ? payload.manifestSize : null;
  const total = Number.isFinite(manifestSize)
    ? manifestSize
    : Number.isFinite(okCount) && Number.isFinite(failCount)
    ? okCount + failCount
    : null;

  if (stage) {
    parts.push(stage);
  } else if (type) {
    parts.push(type);
  }

  if (Number.isFinite(failCount)) {
    let failSummary = `${failCount} failed`;
    if (Number.isFinite(total)) {
      failSummary += ` of ${total}`;
    }
    parts.push(failSummary);
  } else if (typeof payload.message === 'string' && payload.message) {
    parts.push(payload.message);
  }

  if (payload.base) {
    parts.push(`base=${payload.base}`);
  }

  if (!stage && type) {
    parts.push(type);
  }

  return parts.join(' • ');
}

function updateConsoleStructuredPayload(payload) {
  if (!consoleStructuredContainer) {
    currentStructuredConsolePayload = null;
    return;
  }

  const structured = payload && typeof payload === 'object' ? payload : null;
  currentStructuredConsolePayload = structured;

  if (!structured) {
    consoleStructuredContainer.hidden = true;
    if (consoleStructuredSummary) {
      consoleStructuredSummary.textContent = '';
    }
    if (consoleStructuredCopyButton) {
      consoleStructuredCopyButton.disabled = true;
    }
    if (consoleStructuredFailuresDetails) {
      consoleStructuredFailuresDetails.hidden = true;
      consoleStructuredFailuresDetails.open = false;
    }
    if (consoleStructuredFailuresBody) {
      consoleStructuredFailuresBody.innerHTML = '';
    }
    if (consoleStructuredSysPathDetails) {
      consoleStructuredSysPathDetails.hidden = true;
      consoleStructuredSysPathDetails.open = false;
    }
    if (consoleStructuredSysPathList) {
      consoleStructuredSysPathList.innerHTML = '';
    }
    return;
  }

  consoleStructuredContainer.hidden = false;

  const summary = formatStructuredErrorSummary(structured);
  if (consoleStructuredSummary) {
    const fallbackMessage =
      summary || structured.message || structured.error || 'Runtime error encountered.';
    consoleStructuredSummary.textContent = fallbackMessage;
  }

  if (consoleStructuredCopyButton) {
    consoleStructuredCopyButton.disabled = false;
  }

  if (consoleStructuredFailuresDetails && consoleStructuredFailuresBody) {
    if (Array.isArray(structured.failures) && structured.failures.length > 0) {
      consoleStructuredFailuresDetails.hidden = false;
      consoleStructuredFailuresBody.innerHTML = '';

      const table = document.createElement('table');
      table.className = 'console-structured-table-grid';

      const thead = document.createElement('thead');
      const headerRow = document.createElement('tr');
      ['Path', 'Status', 'URL', 'Error'].forEach((label) => {
        const th = document.createElement('th');
        th.scope = 'col';
        th.textContent = label;
        headerRow.append(th);
      });
      thead.append(headerRow);

      const tbody = document.createElement('tbody');
      structured.failures.forEach((failure) => {
        if (!failure || typeof failure !== 'object') {
          return;
        }
        const row = document.createElement('tr');

        const pathCell = document.createElement('td');
        pathCell.textContent = failure.path || '';
        row.append(pathCell);

        const statusCell = document.createElement('td');
        const statusValue =
          typeof failure.status === 'number'
            ? String(failure.status)
            : typeof failure.status === 'string'
            ? failure.status
            : '';
        statusCell.textContent = statusValue;
        row.append(statusCell);

        const urlCell = document.createElement('td');
        urlCell.textContent = failure.finalURL || failure.url || '';
        row.append(urlCell);

        const errorCell = document.createElement('td');
        errorCell.textContent = failure.error || failure.reason || '';
        row.append(errorCell);

        tbody.append(row);
      });

      table.append(thead, tbody);
      consoleStructuredFailuresBody.append(table);
    } else {
      consoleStructuredFailuresDetails.hidden = true;
      consoleStructuredFailuresDetails.open = false;
      consoleStructuredFailuresBody.innerHTML = '';
    }
  }

  if (consoleStructuredSysPathDetails && consoleStructuredSysPathList) {
    const sysEntries = Array.isArray(structured.sysPath)
      ? structured.sysPath
      : Array.isArray(structured.sys_path)
      ? structured.sys_path
      : [];

    if (sysEntries.length > 0) {
      consoleStructuredSysPathDetails.hidden = false;
      consoleStructuredSysPathList.innerHTML = '';
      sysEntries.forEach((entry) => {
        const item = document.createElement('li');
        item.textContent = typeof entry === 'string' ? entry : String(entry ?? '');
        consoleStructuredSysPathList.append(item);
      });
    } else {
      consoleStructuredSysPathDetails.hidden = true;
      consoleStructuredSysPathDetails.open = false;
      consoleStructuredSysPathList.innerHTML = '';
    }
  }
}

async function handleCopyStructuredPayload() {
  if (!currentStructuredConsolePayload) {
    return;
  }

  try {
    await copyTextToClipboard(JSON.stringify(currentStructuredConsolePayload, null, 2));
    dispatchIntent({
      type: INTENT_TYPES.SHOW_TOAST,
      payload: {
        message: 'Details copied',
        intent: 'success',
        duration: 2200,
      },
    });
  } catch (error) {
    dispatchIntent({
      type: INTENT_TYPES.SHOW_TOAST,
      payload: {
        message: 'Copy failed',
        description:
          error && error.message ? error.message : 'Unable to copy details to clipboard.',
        intent: 'error',
        duration: 4000,
      },
    });
  }
}

function deserializeWorkerLogArg(value) {
  if (!value || typeof value !== 'object') {
    if (typeof value === 'bigint') {
      return `${value.toString()}n`;
    }
    return value;
  }

  if ('__error' in value) {
    const error = new Error(value.message || '');
    error.name = typeof value.name === 'string' && value.name ? value.name : 'Error';
    if (typeof value.stack === 'string' && value.stack) {
      error.stack = value.stack;
    }
    return error;
  }

  if (value.__type === 'function') {
    return `[Function ${value.name || 'anonymous'}]`;
  }

  if (value.__type === 'symbol') {
    const description = typeof value.description === 'string' ? value.description : '';
    return description ? `Symbol(${description})` : 'Symbol()';
  }

  if (value.__type === 'bigint') {
    return `${value.value || '0'}n`;
  }

  return value;
}

function handleWorkerLogMessage(message) {
  if (!DEBUG) {
    return;
  }
  const level = typeof message?.level === 'string' ? message.level : 'log';
  const args = Array.isArray(message?.args)
    ? message.args.map((arg) => deserializeWorkerLogArg(arg))
    : [];

  if (level === 'groupEnd') {
    if (typeof console.groupEnd === 'function') {
      console.groupEnd();
    }
    return;
  }

  if (level === 'group' || level === 'groupCollapsed') {
    const fn =
      level === 'groupCollapsed'
        ? typeof console.groupCollapsed === 'function'
          ? console.groupCollapsed
          : console.group
        : typeof console.group === 'function'
        ? console.group
        : console.log;
    try {
      fn.apply(console, args);
    } catch (error) {
      console.log(...args);
    }
    return;
  }

  if (level === 'table') {
    if (typeof console.table === 'function') {
      console.table(...args);
    } else {
      console.log(...args);
    }
    return;
  }

  const target = typeof console[level] === 'function' ? console[level] : console.log;
  try {
    target.apply(console, args);
  } catch (error) {
    console.log(...args);
  }
}

function handleWorkerUnhandledMessage(message) {
  if (!DEBUG) {
    return;
  }

  const level = message?.kind === 'error' ? 'error' : 'warn';
  const payload = {
    kind: message?.kind || 'error',
    message: message?.message || '',
  };

  if (typeof message?.filename === 'string' && message.filename) {
    payload.filename = message.filename;
  }
  if (typeof message?.lineno === 'number') {
    payload.lineno = message.lineno;
  }
  if (typeof message?.colno === 'number') {
    payload.colno = message.colno;
  }
  if (message?.error) {
    payload.error = deserializeWorkerLogArg(message.error);
  }
  if (message?.reason) {
    payload.reason = deserializeWorkerLogArg(message.reason);
  }

  const target = typeof console[level] === 'function' ? console[level] : console.log;
  try {
    target.call(console, '[worker]', payload);
  } catch (error) {
    console.log('[worker]', payload);
  }
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
        handleRuntimeLoadSuccess();
        return result;
      })
      .catch((error) => {
        dispatchIntent({
          type: INTENT_TYPES.APP_STATUS,
          payload: { channel: 'runtime', status: 'error', error },
        });
        handleRuntimeLoadFailure(error);
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
    runtimeStatus = status;
    if (status === 'ready') {
      runtimeReady = true;
      if (initializeRuntimeButton) {
        initializeRuntimeButton.textContent = 'Runtime Ready';
        initializeRuntimeButton.disabled = true;
        updateRuntimeButtonState(initializeRuntimeButton);
      }
      setGenerateButtonState(isGeneratingCalendar);
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
      if (initializeRuntimeButton) {
        initializeRuntimeButton.textContent = 'Initializing…';
        initializeRuntimeButton.disabled = true;
        updateRuntimeButtonState(initializeRuntimeButton);
      }
      setGenerateButtonState(isGeneratingCalendar);
    } else if (status === 'error') {
      runtimeReady = false;
      hasShownRuntimeReadyToast = false;
      if (initializeRuntimeButton) {
        initializeRuntimeButton.textContent = 'Initialize Runtime';
        initializeRuntimeButton.disabled = false;
        updateRuntimeButtonState(initializeRuntimeButton);
      }
      setGenerateButtonState(isGeneratingCalendar);
    }
  }
});

function handleRuntimeLoadSuccess() {
  if (initializeRuntimeButton) {
    initializeRuntimeButton.textContent = 'Runtime Ready';
    initializeRuntimeButton.disabled = true;
    updateRuntimeButtonState(initializeRuntimeButton);
  }
  setGenerateButtonState(isGeneratingCalendar);
}

function handleRuntimeLoadFailure(error) {
  if (initializeRuntimeButton) {
    initializeRuntimeButton.textContent = 'Initialize Runtime';
    initializeRuntimeButton.disabled = false;
    updateRuntimeButtonState(initializeRuntimeButton);
  }
  setGenerateButtonState(isGeneratingCalendar);
  hasShownRuntimeReadyToast = false;
  const summary = formatStructuredErrorSummary(error);
  const stderrMessage =
    typeof error?.stderr === 'string' && error.stderr
      ? error.stderr
      : summary || error?.error || 'Failed to initialize Pyodide runtime.';
  renderConsoleOutputs({ stdout: error?.stdout || '', stderr: stderrMessage, structured: error });
  const toastDescription = summary || (typeof error?.error === 'string' ? error.error : stderrMessage);
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

function hydrateGlobalActions() {
  const actionsRoot = document.querySelector('[data-global-actions]');
  if (!actionsRoot) {
    return;
  }
  const button = actionsRoot.querySelector('[data-global-action="generate"]');
  if (!(button instanceof HTMLElement)) {
    return;
  }
  seedIndicatorElement = actionsRoot.querySelector('[data-current-seed]') || seedIndicatorElement;
  if (!actionsRoot.dataset.randomizeSeedHydrated) {
    randomizeSeed = readRandomizeSeedPreference();
    actionsRoot.dataset.randomizeSeedHydrated = '1';
  }
  const toggle = actionsRoot.querySelector('#randomize-seed-toggle');
  if (toggle !== randomizeSeedToggle) {
    if (randomizeSeedToggle) {
      randomizeSeedToggle.removeEventListener('change', handleRandomizeSeedToggleChange);
    }
    randomizeSeedToggle = toggle instanceof HTMLInputElement ? toggle : null;
    if (randomizeSeedToggle) {
      randomizeSeedToggle.addEventListener('change', handleRandomizeSeedToggleChange);
    }
  }
  updateRandomizeSeedToggleUI();
  if (generateButton && generateButton !== button) {
    generateButton.removeEventListener('click', handleGenerate);
  }
  generateButton = button;
  styleRuntimeButton(generateButton);
  setGenerateButtonState(isGeneratingCalendar);
  if (!button.dataset.generateBound) {
    button.addEventListener('click', handleGenerate);
    button.dataset.generateBound = '1';
  }
  updateSeedIndicator();
}

function hydrateConfigPanel() {
  if (!configPanel || configPanel.dataset.hydrated === '1') {
    return;
  }
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
    validateJsonButton =
      configActions.querySelector('[data-config-action="validate-json"]') ||
      null;
    if (!validateJsonButton) {
      validateJsonButton = document.createElement('button');
      validateJsonButton.type = 'button';
      validateJsonButton.className = 'secondary-action';
      validateJsonButton.dataset.configAction = 'validate-json';
      validateJsonButton.textContent = 'Validate';
      if (
        initializeRuntimeButton &&
        initializeRuntimeButton.parentElement === configActions
      ) {
        configActions.insertBefore(validateJsonButton, initializeRuntimeButton);
      } else {
        configActions.append(validateJsonButton);
      }
    }
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
  calendarConfigState = calendarConfig;
  calendarConfigController = {
    setSeed: (value, options) => setCalendarSeed(value, options),
    getSeed: () => (calendarConfig.common.seed ? String(calendarConfig.common.seed) : ''),
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
    updateSeedIndicator(calendarConfig.common.seed);
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
    updateSeedIndicator(calendarConfig.common.seed);
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

  function setCalendarSeed(nextSeed, { markUserEdited = true, persist = true } = {}) {
    const parsedSeed = Number.parseInt(String(nextSeed), 10);
    if (!Number.isFinite(parsedSeed)) {
      return '';
    }
    calendarConfig.common.seed = String(parsedSeed);
    commonSeedUserEdited = Boolean(markUserEdited);
    if (persist) {
      persistCalendarCommon();
    }
    syncCommonInputs();
    syncCommonStateToChips();
    return calendarConfig.common.seed;
  }

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
        setCalendarSeed(computeDeterministicSeed(), { markUserEdited: false, persist: true });
        updateDerivedFromFoundation();
        return;
      }
      const numericSeed = Number.parseInt(value, 10);
      if (!Number.isFinite(numericSeed)) {
        seedInput.value = calendarConfig.common.seed || computeDeterministicSeed();
        updateSeedIndicator(calendarConfig.common.seed);
        return;
      }
      setCalendarSeed(numericSeed, { markUserEdited: true, persist: true });
      updateDerivedFromFoundation();
    });
  }

  if (seedResetButton) {
    seedResetButton.addEventListener('click', () => {
      setCalendarSeed(computeDeterministicSeed(), { markUserEdited: false, persist: true });
      updateDerivedFromFoundation();
    });
  }

  if (seedRandomButton) {
    seedRandomButton.addEventListener('click', () => {
      const randomSeed = Math.floor(Math.random() * 1_000_000_000);
      setCalendarSeed(randomSeed, { markUserEdited: true, persist: true });
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

  getConfigSnapshot = () => {
    const activeVariant = cfg.variant || '';
    const activeRig = activeVariant ? cfg.rig[activeVariant] || '' : '';
    const weekValue = calendarConfig.common.weekStart || '';
    let seedValue = '';
    if (typeof calendarConfig.common.seed === 'number') {
      seedValue = String(calendarConfig.common.seed);
    } else if (calendarConfig.common.seed) {
      seedValue = String(calendarConfig.common.seed);
    }
    const hasBudget =
      activeVariant === 'mk2' &&
      activeRig === 'workforce' &&
      typeof calendarConfig.mk2.workforce.budgetText === 'string' &&
      calendarConfig.mk2.workforce.budgetText.trim().length > 0;
    return {
      classId: cfg.class || 'calendar',
      variant: activeVariant,
      rig: activeRig,
      archetype: calendarConfig.common.archetype || '',
      week_start: weekValue || '',
      seed: seedValue,
      hasBudget,
    };
  };

  applyClass(cfg.class, { updateStorage: false });

  if (initializeRuntimeButton) {
    styleRuntimeButton(initializeRuntimeButton);
    initializeRuntimeButton.textContent = 'Initialize Runtime';
    initializeRuntimeButton.disabled = runtimeStatus === 'loading';
    updateRuntimeButtonState(initializeRuntimeButton);
    initializeRuntimeButton.addEventListener('click', async () => {
      if (runtimeReady || runtimeStatus === 'loading') {
        return;
      }
      initializeRuntimeButton.disabled = true;
      initializeRuntimeButton.textContent = 'Initializing…';
      updateRuntimeButtonState(initializeRuntimeButton);
      beginConsoleRun('Initializing runtime…');
      try {
        await ensureRuntimeLoaded();
      } catch (error) {
        console.error('Runtime initialization failed:', error);
      }
    });
  }

  if (initializeRuntimeButton && runtimeReady) {
    initializeRuntimeButton.textContent = 'Runtime Ready';
    initializeRuntimeButton.disabled = true;
    updateRuntimeButtonState(initializeRuntimeButton);
  }

  if (validateJsonButton) {
    styleRuntimeButton(validateJsonButton);
    validateJsonButton.textContent = 'Validate';
    validateJsonButton.disabled = false;
    updateRuntimeButtonState(validateJsonButton);
    validateJsonButton.addEventListener('click', () => {
      if (!jsonOutputElement) {
        return;
      }
      const raw = jsonOutputElement.textContent || '';
      const trimmed = raw.trim();
      if (!trimmed || trimmed === DEFAULT_JSON_PLACEHOLDER.trim()) {
        dispatchIntent({
          type: INTENT_TYPES.SHOW_TOAST,
          payload: {
            message: 'No JSON to validate',
            intent: 'info',
            duration: 2200,
          },
        });
        return;
      }
      try {
        const parsed = JSON.parse(raw);
        const validation = validateWebV1Calendar(parsed);
        setJsonValidationBadge(validation.ok ? 'ok' : 'err');
        if (validation.ok) {
          appendConsoleLog('Validation passed: payload is web_v1_calendar.');
        } else {
          const issueCount = validation.errors.length;
          const summary = `Validation failed: ${issueCount} issue${
            issueCount === 1 ? '' : 's'
          }.`;
          appendConsoleLog(summary);
        }
      } catch (error) {
        setJsonValidationBadge('err');
        appendConsoleLog('Validation failed: unable to parse JSON.');
      }
    });
  }

  configPanel.dataset.hydrated = '1';
}


function hydrateConsolePanel() {
  if (!consolePanel || consolePanel.dataset.consoleHydrated === '1') {
    return;
  }

  const consoleContainer = document.createElement('div');
  consoleContainer.className = 'console-pane';

  const controlsSection = document.createElement('section');
  controlsSection.className = 'console-controls';

  const presetRow = document.createElement('div');
  presetRow.className = 'console-runtime-row';

  consolePresetSelect = document.createElement('select');
  consolePresetSelect.className = 'console-select';
  consolePresetSelect.setAttribute('aria-label', 'Runtime preset');

  for (const [presetId, preset] of Object.entries(consoleRuntimePresets)) {
    const option = document.createElement('option');
    option.value = presetId;
    option.textContent = preset?.label || presetId;
    consolePresetSelect.append(option);
  }

  const loadPresetButton = document.createElement('button');
  loadPresetButton.type = 'button';
  loadPresetButton.className = 'console-load-button';
  loadPresetButton.textContent = 'Load preset';

  presetRow.append(consolePresetSelect, loadPresetButton);

  const scriptField = document.createElement('label');
  scriptField.className = 'console-field';
  const scriptLabel = document.createElement('span');
  scriptLabel.className = 'console-field-label';
  scriptLabel.textContent = 'Script';
  consoleScriptTextarea = document.createElement('textarea');
  consoleScriptTextarea.className = 'console-textarea console-textarea--script';
  consoleScriptTextarea.spellcheck = false;
  consoleScriptTextarea.setAttribute('aria-label', 'Console script');
  scriptField.append(scriptLabel, consoleScriptTextarea);

  const configField = document.createElement('label');
  configField.className = 'console-field';
  const configLabel = document.createElement('span');
  configLabel.className = 'console-field-label';
  configLabel.textContent = 'Runner config JSON';
  consoleConfigTextarea = document.createElement('textarea');
  consoleConfigTextarea.className = 'console-textarea console-textarea--json';
  consoleConfigTextarea.spellcheck = false;
  consoleConfigTextarea.setAttribute('aria-label', 'Runner config JSON');
  configField.append(configLabel, consoleConfigTextarea);

  const inputsField = document.createElement('label');
  inputsField.className = 'console-field';
  const inputsLabel = document.createElement('span');
  inputsLabel.className = 'console-field-label';
  inputsLabel.textContent = 'Execution inputs';
  consoleInputsTextarea = document.createElement('textarea');
  consoleInputsTextarea.className = 'console-textarea console-textarea--json';
  consoleInputsTextarea.spellcheck = false;
  consoleInputsTextarea.setAttribute('aria-label', 'Execution inputs JSON');
  inputsField.append(inputsLabel, consoleInputsTextarea);

  const fieldGrid = document.createElement('div');
  fieldGrid.className = 'console-field-grid';
  fieldGrid.append(configField, inputsField);

  const actionsRow = document.createElement('div');
  actionsRow.className = 'console-actions';
  consoleRunButton = document.createElement('button');
  consoleRunButton.type = 'button';
  consoleRunButton.className = 'console-run-button';
  consoleRunButton.textContent = 'Run';
  actionsRow.append(consoleRunButton);

  controlsSection.append(presetRow, scriptField, fieldGrid, actionsRow);

  const stdoutSection = document.createElement('section');
  stdoutSection.className = 'console-stream';
  const stdoutHeader = document.createElement('h3');
  stdoutHeader.className = 'console-stream-title';
  stdoutHeader.textContent = 'Stdout';
  stdoutOutput = document.createElement('textarea');
  stdoutOutput.className = 'console-output';
  stdoutOutput.readOnly = true;
  stdoutOutput.spellcheck = false;
  stdoutOutput.setAttribute('aria-label', 'Stdout output');
  stdoutSection.append(stdoutHeader, stdoutOutput);

  const stderrSection = document.createElement('section');
  stderrSection.className = 'console-stream';
  const stderrHeader = document.createElement('h3');
  stderrHeader.className = 'console-stream-title';
  stderrHeader.textContent = 'Stderr';
  stderrOutput = document.createElement('textarea');
  stderrOutput.className = 'console-output';
  stderrOutput.readOnly = true;
  stderrOutput.spellcheck = false;
  stderrOutput.setAttribute('aria-label', 'Stderr output');
  stderrSection.append(stderrHeader, stderrOutput);

  const resultSection = document.createElement('section');
  resultSection.className = 'console-stream';
  const resultHeader = document.createElement('h3');
  resultHeader.className = 'console-stream-title';
  resultHeader.textContent = 'Result';
  resultOutput = document.createElement('textarea');
  resultOutput.className = 'console-output';
  resultOutput.readOnly = true;
  resultOutput.spellcheck = false;
  resultOutput.setAttribute('aria-label', 'Result payload');
  consoleRunMeta = document.createElement('div');
  consoleRunMeta.className = 'console-meta';
  resultSection.append(resultHeader, resultOutput, consoleRunMeta);

  consoleStructuredContainer = document.createElement('section');
  consoleStructuredContainer.className = 'console-structured';
  consoleStructuredContainer.hidden = true;

  const structuredHeader = document.createElement('div');
  structuredHeader.className = 'console-structured-header';

  consoleStructuredSummary = document.createElement('div');
  consoleStructuredSummary.className = 'console-structured-summary';
  consoleStructuredSummary.textContent = '';

  consoleStructuredCopyButton = document.createElement('button');
  consoleStructuredCopyButton.type = 'button';
  consoleStructuredCopyButton.className = 'console-structured-copy';
  consoleStructuredCopyButton.textContent = 'Copy details';
  consoleStructuredCopyButton.disabled = true;
  consoleStructuredCopyButton.addEventListener('click', () => {
    handleCopyStructuredPayload();
  });

  structuredHeader.append(consoleStructuredSummary, consoleStructuredCopyButton);

  consoleStructuredFailuresDetails = document.createElement('details');
  consoleStructuredFailuresDetails.className = 'console-structured-details';
  consoleStructuredFailuresDetails.hidden = true;
  const failuresSummary = document.createElement('summary');
  failuresSummary.textContent = 'Failures';
  consoleStructuredFailuresBody = document.createElement('div');
  consoleStructuredFailuresBody.className = 'console-structured-table';
  consoleStructuredFailuresDetails.append(failuresSummary, consoleStructuredFailuresBody);

  consoleStructuredSysPathDetails = document.createElement('details');
  consoleStructuredSysPathDetails.className = 'console-structured-details';
  consoleStructuredSysPathDetails.hidden = true;
  const sysPathSummary = document.createElement('summary');
  sysPathSummary.textContent = 'sys.path';
  consoleStructuredSysPathList = document.createElement('ul');
  consoleStructuredSysPathList.className = 'console-structured-syspath';
  consoleStructuredSysPathDetails.append(sysPathSummary, consoleStructuredSysPathList);

  consoleStructuredContainer.append(
    structuredHeader,
    consoleStructuredFailuresDetails,
    consoleStructuredSysPathDetails
  );

  consoleContainer.append(
    controlsSection,
    stdoutSection,
    stderrSection,
    resultSection,
    consoleStructuredContainer
  );

  consolePanel.append(consoleContainer);

  loadPresetButton.addEventListener('click', () => {
    loadConsolePreset(consolePresetSelect.value);
  });

  consoleScriptTextarea.addEventListener('input', () => {
    consoleState.scriptText = consoleScriptTextarea.value;
    updateConsoleRunButtonState();
  });

  consoleConfigTextarea.addEventListener('input', () => {
    consoleState.runnerConfigText = consoleConfigTextarea.value;
  });

  consoleInputsTextarea.addEventListener('input', () => {
    consoleState.inputsText = consoleInputsTextarea.value;
  });

  consoleRunButton.addEventListener('click', () => {
    handleConsoleRun();
  });

  const defaultPresetId =
    consoleRuntimePresets['mk2-quick-test'] !== undefined
      ? 'mk2-quick-test'
      : Object.keys(consoleRuntimePresets)[0];
  if (defaultPresetId) {
    consolePresetSelect.value = defaultPresetId;
    loadConsolePreset(defaultPresetId);
  } else {
    updateConsoleRunButtonState();
  }

  setConsoleOutputContent(stdoutOutput, '', defaultStdoutMessage);
  setConsoleOutputContent(stderrOutput, '', defaultStderrMessage);
  setConsoleResult(null);
  setConsoleRunMeta('Ready.');
  updateConsoleStructuredPayload(null);

  consolePanel.dataset.consoleHydrated = '1';
}

function hydrateJsonPanel() {
  if (!jsonPanel || jsonPanel.dataset.jsonHydrated === '1') {
    return;
  }
  const jsonContainer = document.createElement('div');
  jsonContainer.className = 'json-pane';

  const jsonToolbar = document.createElement('div');
  jsonToolbar.className = 'json-toolbar';
  jsonSummaryElement = document.createElement('span');
  jsonSummaryElement.className = 'json-summary';
  jsonSummaryElement.hidden = true;

  const jsonActions = document.createElement('div');
  jsonActions.className = 'json-actions';

  copyJsonButton = document.createElement('button');
  copyJsonButton.type = 'button';
  copyJsonButton.className = 'json-button';
  copyJsonButton.textContent = 'Copy';
  copyJsonButton.disabled = true;

  saveJsonButton = document.createElement('button');
  saveJsonButton.type = 'button';
  saveJsonButton.className = 'json-button';
  saveJsonButton.textContent = 'Save';
  saveJsonButton.disabled = true;

  jsonActions.append(copyJsonButton, saveJsonButton);
  jsonToolbar.append(jsonSummaryElement, jsonActions);

  jsonOutputElement = document.createElement('pre');
  jsonOutputElement.className = 'json-output';
  jsonOutputElement.textContent = DEFAULT_JSON_PLACEHOLDER;

  jsonContainer.append(jsonToolbar, jsonOutputElement);
  jsonPanel.append(jsonContainer);

  updateJsonActionsState();
  updateJsonSummaryDisplay();

  copyJsonButton.addEventListener('click', () => {
    copyCurrentJsonToClipboard();
  });

  saveJsonButton.addEventListener('click', () => {
    saveCurrentJsonToFile();
  });

  jsonPanel.dataset.jsonHydrated = '1';
  setJsonValidationBadge('clear');
}

function hydrateFixturesPanel() {
  if (!fixturesPanel || fixturesPanel.dataset.fixturesHydrated === '1') {
    return;
  }
  const fixturesContainer = document.createElement('div');
  fixturesContainer.className = 'fixtures-pane';

  const fixturesActions = document.createElement('div');
  fixturesActions.className = 'fixtures-actions';

  const loadFixtureButton = document.createElement('button');
  loadFixtureButton.type = 'button';
  loadFixtureButton.className = 'fixtures-load';
  loadFixtureButton.textContent = 'Load fixture';

  const fileInput = document.createElement('input');
  fileInput.type = 'file';
  fileInput.accept = '.json,application/json';
  fileInput.hidden = true;

  fixturesActions.append(loadFixtureButton);

  const historySection = document.createElement('section');
  historySection.className = 'run-history-section';

  const historyTitle = document.createElement('h3');
  historyTitle.className = 'run-history-heading';
  historyTitle.textContent = 'Run History';

  runHistoryListElement = document.createElement('ul');
  runHistoryListElement.className = 'run-history-list';

  historySection.append(historyTitle, runHistoryListElement);

  fixturesContainer.append(fixturesActions, historySection, fileInput);
  fixturesPanel.append(fixturesContainer);

  loadFixtureButton.addEventListener('click', () => {
    fileInput.click();
  });

  fileInput.addEventListener('change', () => {
    const [file] = fileInput.files || [];
    if (!file) {
      return;
    }
    const reader = new FileReader();
    reader.addEventListener('load', () => {
      try {
        const text =
          typeof reader.result === 'string'
            ? reader.result
            : String(reader.result ?? '');
        const parsed = JSON.parse(text);
        if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
          throw new Error('Fixture JSON must be an object.');
        }
        const snapshot = typeof getConfigSnapshot === 'function' ? getConfigSnapshot() : {};
        setJsonPayload(parsed, {
          variant: snapshot.variant,
          rig: snapshot.rig,
          weekStart: typeof parsed.week_start === 'string' ? parsed.week_start : undefined,
        });
        const validation = validateWebV1Calendar(parsed);
        setJsonValidationBadge(validation.ok ? 'ok' : 'err');
        dispatchIntent({
          type: INTENT_TYPES.NAVIGATE_TAB,
          payload: { tab: 'json', focusPanel: true },
        });
        dispatchIntent({
          type: INTENT_TYPES.SHOW_TOAST,
          payload: {
            message: 'Fixture loaded',
            description: file.name || undefined,
            intent: 'success',
            duration: 2200,
          },
        });
        const eventCount = Array.isArray(parsed.events) ? parsed.events.length : 0;
        addRunHistoryEntry({
          kind: 'fixture',
          ts: Date.now(),
          class: 'calendar',
          variant: snapshot.variant || '',
          rig: snapshot.rig || '',
          week_start: typeof parsed.week_start === 'string' ? parsed.week_start : '',
          label: file.name || 'Fixture',
          payload: parsed,
          resultSummary: { events: eventCount },
        });
      } catch (error) {
        setJsonValidationBadge('err');
        dispatchIntent({
          type: INTENT_TYPES.SHOW_TOAST,
          payload: {
            message: 'Invalid fixture',
            description:
              error && error.message ? error.message : 'Unable to parse JSON fixture.',
            intent: 'error',
            duration: 4000,
          },
        });
      }
    });
    reader.addEventListener('error', () => {
      dispatchIntent({
        type: INTENT_TYPES.SHOW_TOAST,
        payload: {
          message: 'Fixture load failed',
          description: reader.error?.message || 'Unable to read fixture file.',
          intent: 'error',
          duration: 4000,
        },
      });
    });
    reader.readAsText(file);
    fileInput.value = '';
  });

  renderRunHistory();
  fixturesPanel.dataset.fixturesHydrated = '1';
}

function hydrateLogsPanel() {
  if (!logsPanel) {
    return;
  }

  let historyHost = logsPanel.querySelector('[data-history-host]');

  if (!historyHost) {
    const logsContainer = document.createElement('div');
    logsContainer.className = 'logs-pane';

    historyHost = document.createElement('section');
    historyHost.className = 'logs-history';
    historyHost.dataset.historyHost = '1';

    const logsStream = document.createElement('section');
    logsStream.className = 'logs-stream';

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

    logsStream.append(logsToolbar, logsOutput);

    logsContainer.append(historyHost, logsStream);
    logsPanel.append(logsContainer);
  }

  ensureCalendarHistoryPanel(historyHost);

  logsPanel.dataset.logsHydrated = '1';
}
