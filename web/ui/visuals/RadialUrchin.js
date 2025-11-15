import {
  computeUrchinLayout,
  computeLabelTotals,
  findNearestArc,
  formatDuration,
  minutesToTime,
} from './useUrchinLayout.js';
import { ActivityShareBar, prepareActivityShareSegments } from './ActivityShareBar.js';
import { ActivityBalanceHistory } from './ActivityBalanceHistory.js';
import { mapLabelToColor, resolveSurface, resolveStateLayer } from './palette.js';

const FULL_DAY_MINUTES = 24 * 60;
const TAU = Math.PI * 2;

const MODE_LABELS = {
  'day-rings': 'Ring by Day',
  'agent-rings': 'Ring by Agent',
};

const SPEED_OPTIONS = [
  { label: '0.5×', value: 0.5 },
  { label: '1×', value: 1 },
  { label: '2×', value: 2 },
];

const HOVER_DELAY = 180;

export const MAX_HISTORY_ROWS = 50;
export const MAX_HISTORY_ENTRIES = MAX_HISTORY_ROWS;

export function extractScheduleTimestamp(schedule) {
  if (!schedule || typeof schedule !== 'object') {
    return null;
  }
  if (typeof schedule.generatedAt === 'string') {
    return schedule.generatedAt;
  }
  const meta = schedule.metadata && typeof schedule.metadata === 'object' ? schedule.metadata : null;
  if (meta) {
    if (typeof meta.generatedAt === 'string') {
      return meta.generatedAt;
    }
    if (typeof meta.timestamp === 'string') {
      return meta.timestamp;
    }
  }
  return null;
}

export function formatHistoryTimestamp(value) {
  if (!value || typeof value !== 'string') {
    return '';
  }
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return '';
  }
  try {
    return date.toLocaleString(undefined, {
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  } catch (error) {
    return '';
  }
}

export function computeScheduleSignature(schedule) {
  if (!schedule || typeof schedule !== 'object') {
    return null;
  }

  const timestamp = extractScheduleTimestamp(schedule);
  if (timestamp) {
    return `timestamp:${timestamp}`;
  }

  const events = Array.isArray(schedule.events) ? schedule.events : [];
  if (!events.length) {
    return null;
  }

  const parts = events.map((event) => {
    const label = event?.label || event?.activity || '';
    const start = typeof event?.start === 'string' ? event.start : '';
    const end = typeof event?.end === 'string' ? event.end : '';
    const agent =
      typeof event?.agent === 'string'
        ? event.agent
        : typeof event?.metadata?.agent === 'string'
        ? event.metadata.agent
        : '';
    return `${label}|${start}|${end}|${agent}`;
  });

  return `events:${parts.join(';')}`;
}

export function createBalanceHistoryEntry(schedule, options = {}) {
  if (!schedule || typeof schedule !== 'object') {
    return null;
  }
  const events = Array.isArray(schedule.events) ? schedule.events : [];
  if (events.length === 0) {
    return null;
  }
  const totals = computeLabelTotals(events);
  if (!Array.isArray(totals) || totals.length === 0) {
    return null;
  }

  const highContrast = Boolean(options.highContrast);
  const activities = totals.map(({ label, minutes }) => ({
    id: label,
    label,
    minutes,
    color: mapLabelToColor(label, { highContrast }),
  }));
  const { segments, totalMinutes } = prepareActivityShareSegments(activities);
  if (!segments.length || !(totalMinutes > 0)) {
    return null;
  }

  const runNumber = Number.isFinite(options.runNumber) ? options.runNumber : 1;
  const timestamp = extractScheduleTimestamp(schedule);
  const entry = {
    id: options.id || `${runNumber}-${Date.now()}`,
    runNumber,
    label: options.label || `Run #${runNumber}`,
    timestamp,
    timestampLabel: formatHistoryTimestamp(timestamp),
    totalMinutes,
    segments: segments.map((segment) => ({ ...segment })),
    activities: activities.map((activity) => ({ ...activity })),
  };

  if (options.signature) {
    entry.signature = options.signature;
  }

  return entry;
}

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function moduloMinutes(minutes) {
  const wrapped = minutes % FULL_DAY_MINUTES;
  return wrapped < 0 ? wrapped + FULL_DAY_MINUTES : wrapped;
}

function describeSegmentPath(cx, cy, innerR, outerR, startAngle, endAngle) {
  const largeArc = endAngle - startAngle > Math.PI ? 1 : 0;
  const startOuterX = cx + outerR * Math.cos(startAngle);
  const startOuterY = cy + outerR * Math.sin(startAngle);
  const endOuterX = cx + outerR * Math.cos(endAngle);
  const endOuterY = cy + outerR * Math.sin(endAngle);
  const startInnerX = cx + innerR * Math.cos(endAngle);
  const startInnerY = cy + innerR * Math.sin(endAngle);
  const endInnerX = cx + innerR * Math.cos(startAngle);
  const endInnerY = cy + innerR * Math.sin(startAngle);

  return [
    'M',
    startOuterX,
    startOuterY,
    'A',
    outerR,
    outerR,
    0,
    largeArc,
    1,
    endOuterX,
    endOuterY,
    'L',
    startInnerX,
    startInnerY,
    'A',
    innerR,
    innerR,
    0,
    largeArc,
    0,
    endInnerX,
    endInnerY,
    'Z',
  ].join(' ');
}

function ensureElement(parent, selector, factory) {
  let element = parent.querySelector(selector);
  if (!element) {
    element = factory();
    parent.append(element);
  }
  return element;
}

function buildTooltipContent(arc) {
  if (!arc) {
    return '';
  }
  const startMinutes = moduloMinutes(arc.segmentStart ?? arc.startMinutes);
  const endMinutes = moduloMinutes(startMinutes + (arc.segmentDuration ?? arc.duration));
  const startTime = minutesToTime(startMinutes);
  const endTime = minutesToTime(endMinutes);
  const duration = formatDuration(Math.round((arc.segmentDuration ?? arc.duration)));
  const lines = [`<strong>${arc.label}</strong>`, `${startTime} – ${endTime}`, `${duration}`];
  if (arc.event?.activity && arc.event.activity !== arc.label) {
    lines.push(`<span class="meta">Activity · ${arc.event.activity}</span>`);
  }
  if (arc.event?.agent) {
    lines.push(`<span class="meta">Agent · ${arc.event.agent}</span>`);
  } else if (arc.event?.metadata?.agent) {
    lines.push(`<span class="meta">Agent · ${arc.event.metadata.agent}</span>`);
  }
  if (arc.event?.metadata?.note) {
    lines.push(`<span class="meta">${arc.event.metadata.note}</span>`);
  }
  return lines.map((line) => `<p>${line}</p>`).join('');
}

function getElementRect(element) {
  const rect = element.getBoundingClientRect();
  return {
    left: rect.left,
    top: rect.top,
    width: rect.width,
    height: rect.height,
  };
}

export class RadialUrchin {
  constructor(root, props = {}) {
    this.root = root;
    this.props = { data: props.data ?? null, mode: props.mode ?? 'day-rings', selectedAgent: props.selectedAgent, onSelect: props.onSelect ?? (() => {}) };
    this.state = {
      hoverArc: null,
      selectedArc: null,
      focusArc: null,
      scrubMinutes: 8 * 60,
      playing: false,
      playSpeed: 1,
      zoomStart: 0,
      zoomSpan: FULL_DAY_MINUTES,
      highContrast: false,
    };
    this.hiddenLabels = new Set();
    this.visibleArcs = [];
    this.layout = null;
    this.displayArcs = [];
    this.hoverTimer = null;
    this.lastPointer = null;
    this.frameHandle = null;
    this.lastTick = null;
    this.contrastQuery = null;
    this.hasRenderableData = false;
    this.didWarnNoData = false;
    this.didWarnInvalidCenter = false;

    this.metaElement = null;
    this.metaSlot = null;
    this.shareBar = null;
    this.shareContainer = null;
    this.historyView = null;
    this.balanceHistory = [];
    this.totalRunCount = 0;
    this.isHistoryOpen = false;
    this.maxHistoryEntries = MAX_HISTORY_ROWS;

    this.handleResize = this.handleResize.bind(this);
    this.handlePointerMove = this.handlePointerMove.bind(this);
    this.handlePointerLeave = this.handlePointerLeave.bind(this);
    this.handleClick = this.handleClick.bind(this);
    this.handleKeyDown = this.handleKeyDown.bind(this);
    this.handleWheel = this.handleWheel.bind(this);
    this.handleContrastChange = this.handleContrastChange.bind(this);

    this.setupDom();
    this.update(this.props);
  }

  hasValidCenter() {
    const center = this.center;
    return (
      !!center &&
      typeof center.x === 'number' &&
      Number.isFinite(center.x) &&
      typeof center.y === 'number' &&
      Number.isFinite(center.y)
    );
  }

  setupDom() {
    this.root.classList.add('radial-urchin-root');
    this.root.setAttribute('tabindex', '0');
    this.root.addEventListener('keydown', this.handleKeyDown);

    this.container = document.createElement('div');
    this.container.className = 'radial-urchin';
    this.root.append(this.container);

    this.controlBar = document.createElement('div');
    this.controlBar.className = 'radial-urchin__controls visuals-controls-block';
    this.container.append(this.controlBar);

    this.headerRow = document.createElement('div');
    this.headerRow.className = 'radial-urchin__header visuals-header-row';
    this.controlBar.append(this.headerRow);

    this.modeControl = document.createElement('div');
    this.modeControl.className = 'radial-urchin__segmented';
    this.headerRow.append(this.modeControl);

    this.metaSlot = document.createElement('div');
    this.metaSlot.className = 'radial-urchin__meta-slot';
    this.metaSlot.hidden = true;
    this.headerRow.append(this.metaSlot);

    this.modeButtons = new Map();
    Object.entries(MODE_LABELS).forEach(([mode, label]) => {
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'radial-urchin__segment';
      button.textContent = label;
      button.dataset.mode = mode;
      button.addEventListener('click', () => {
        this.setMode(mode);
      });
      this.modeControl.append(button);
      this.modeButtons.set(mode, button);
    });

    this.legendContainer = document.createElement('div');
    this.legendContainer.className = 'radial-urchin__legend chip-row';
    this.controlBar.append(this.legendContainer);

    this.actionsContainer = document.createElement('div');
    this.actionsContainer.className = 'radial-urchin__actions';
    this.controlBar.append(this.actionsContainer);

    this.playButton = document.createElement('button');
    this.playButton.type = 'button';
    this.playButton.className = 'radial-urchin__icon-button';
    this.playButton.innerHTML = '<span class="icon">▶</span>';
    this.playButton.setAttribute('aria-label', 'Play schedule replay');
    this.playButton.addEventListener('click', () => {
      this.togglePlayback();
    });

    this.speedGroup = document.createElement('div');
    this.speedGroup.className = 'radial-urchin__speed';
    SPEED_OPTIONS.forEach((option) => {
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'radial-urchin__speed-option';
      button.textContent = option.label;
      button.dataset.speed = String(option.value);
      button.addEventListener('click', () => {
        this.setSpeed(option.value);
      });
      this.speedGroup.append(button);
    });

    this.scrubSlider = document.createElement('input');
    this.scrubSlider.type = 'range';
    this.scrubSlider.min = '0';
    this.scrubSlider.max = String(FULL_DAY_MINUTES);
    this.scrubSlider.value = String(this.state.scrubMinutes);
    this.scrubSlider.className = 'radial-urchin__scrub';
    this.scrubSlider.setAttribute('aria-label', 'Scrub through the day');
    this.scrubSlider.addEventListener('input', () => {
      const minutes = Number.parseInt(this.scrubSlider.value, 10);
      if (Number.isFinite(minutes)) {
        this.setScrub(minutes, { fromPlayback: false });
      }
    });

    this.zoomResetButton = document.createElement('button');
    this.zoomResetButton.type = 'button';
    this.zoomResetButton.textContent = 'Reset zoom';
    this.zoomResetButton.className = 'radial-urchin__reset';
    this.zoomResetButton.addEventListener('click', () => {
      this.resetZoom();
    });

    this.exportSvgButton = document.createElement('button');
    this.exportSvgButton.type = 'button';
    this.exportSvgButton.textContent = 'Export SVG';
    this.exportSvgButton.className = 'radial-urchin__export';
    this.exportSvgButton.addEventListener('click', () => {
      const payload = this.exportSVG();
      if (!payload) {
        return;
      }
      const blob = new Blob([payload], { type: 'image/svg+xml' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = 'schedule_visual.svg';
      document.body.append(link);
      link.click();
      link.remove();
      window.setTimeout(() => URL.revokeObjectURL(url), 1500);
    });

    this.exportPngButton = document.createElement('button');
    this.exportPngButton.type = 'button';
    this.exportPngButton.textContent = 'Export PNG';
    this.exportPngButton.className = 'radial-urchin__export';
    this.exportPngButton.addEventListener('click', async () => {
      const blob = await this.exportPNG();
      if (!blob) {
        return;
      }
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = 'schedule_visual.png';
      document.body.append(link);
      link.click();
      link.remove();
      window.setTimeout(() => URL.revokeObjectURL(url), 1500);
    });

    this.actionsContainer.append(
      this.playButton,
      this.speedGroup,
      this.scrubSlider,
      this.zoomResetButton,
      this.exportSvgButton,
      this.exportPngButton,
    );

    this.shareContainer = document.createElement('div');
    this.container.append(this.shareContainer);
    this.shareBar = new ActivityShareBar(this.shareContainer);
    this.shareBar.setToggleHandler(() => {
      this.toggleBalanceHistory();
    });

    this.historyView = new ActivityBalanceHistory(this.container);

    this.canvasWrapper = document.createElement('div');
    this.canvasWrapper.className = 'radial-urchin__stage visuals-canvas-block';
    this.container.append(this.canvasWrapper);

    this.canvas = document.createElement('canvas');
    this.canvas.className = 'radial-urchin__canvas';
    this.canvasWrapper.append(this.canvas);

    this.overlay = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    this.overlay.setAttribute('class', 'radial-urchin__overlay');
    this.canvasWrapper.append(this.overlay);

    this.selectionPath = document.createElementNS('http://www.w3.org/2000/svg', 'path');
    this.selectionPath.setAttribute('class', 'radial-urchin__selection');
    this.overlay.append(this.selectionPath);

    this.hoverPath = document.createElementNS('http://www.w3.org/2000/svg', 'path');
    this.hoverPath.setAttribute('class', 'radial-urchin__hover');
    this.overlay.append(this.hoverPath);

    this.scrubLine = document.createElementNS('http://www.w3.org/2000/svg', 'line');
    this.scrubLine.setAttribute('class', 'radial-urchin__scrub-line');
    this.overlay.append(this.scrubLine);

    this.tooltip = document.createElement('div');
    this.tooltip.className = 'radial-urchin__tooltip';
    this.tooltip.setAttribute('role', 'dialog');
    this.tooltip.setAttribute('aria-live', 'polite');
    this.tooltip.hidden = true;
    this.canvasWrapper.append(this.tooltip);

    this.tooltipMeta = ensureElement(this.tooltip, '.radial-urchin__tooltip-body', () => {
      const body = document.createElement('div');
      body.className = 'radial-urchin__tooltip-body';
      return body;
    });

    this.tooltipActions = ensureElement(this.tooltip, '.radial-urchin__tooltip-actions', () => {
      const actions = document.createElement('div');
      actions.className = 'radial-urchin__tooltip-actions';
      return actions;
    });

    this.tooltipPinButton = document.createElement('button');
    this.tooltipPinButton.type = 'button';
    this.tooltipPinButton.textContent = 'Select';
    this.tooltipPinButton.addEventListener('click', () => {
      if (this.state.hoverArc) {
        this.setSelection(this.state.hoverArc);
      }
    });

    this.tooltipActions.append(this.tooltipPinButton);

    this.liveRegion = document.createElement('div');
    this.liveRegion.className = 'radial-urchin__live';
    this.liveRegion.setAttribute('aria-live', 'polite');
    this.liveRegion.setAttribute('aria-atomic', 'true');
    this.liveRegion.textContent = '';
    this.container.append(this.liveRegion);

    this.canvas.addEventListener('pointermove', this.handlePointerMove);
    this.canvas.addEventListener('pointerleave', this.handlePointerLeave);
    this.canvas.addEventListener('click', this.handleClick);
    this.canvas.addEventListener('wheel', this.handleWheel, { passive: false });

    this.resizeObserver = new ResizeObserver(this.handleResize);
    this.resizeObserver.observe(this.canvasWrapper);

    this.offscreen = document.createElement('canvas');

    if (typeof window !== 'undefined' && window.matchMedia) {
      try {
        this.contrastQuery = window.matchMedia('(prefers-contrast: more)');
        this.state.highContrast = Boolean(this.contrastQuery.matches);
        if (typeof this.contrastQuery.addEventListener === 'function') {
          this.contrastQuery.addEventListener('change', this.handleContrastChange);
        } else if (typeof this.contrastQuery.addListener === 'function') {
          this.contrastQuery.addListener(this.handleContrastChange);
        }
      } catch (error) {
        this.contrastQuery = null;
      }
    }

    this.updateHistoryUi({ refreshEntries: true });
  }

  updateHistoryUi({ refreshEntries = false } = {}) {
    const hasEntries = Array.isArray(this.balanceHistory) && this.balanceHistory.length > 0;
    const open = this.isHistoryOpen && hasEntries;

    if (refreshEntries && this.historyView) {
      this.historyView.setEntries(this.balanceHistory);
    }
    if (this.historyView) {
      this.historyView.setOpen(open);
    }
    if (this.shareBar) {
      this.shareBar.setHistoryState({
        open,
        available: hasEntries,
        count: this.balanceHistory.length,
      });
    }
    if (this.container) {
      this.container.classList.toggle('radial-urchin--history-open', open);
    }
    if (this.canvasWrapper) {
      this.canvasWrapper.classList.toggle('radial-urchin__stage--tray', open);
    }
  }

  toggleBalanceHistory(force) {
    const hasEntries = Array.isArray(this.balanceHistory) && this.balanceHistory.length > 0;
    const next = typeof force === 'boolean' ? force : !this.isHistoryOpen;
    if (next && !hasEntries) {
      return;
    }
    if (this.isHistoryOpen === next) {
      return;
    }
    this.isHistoryOpen = next;
    this.updateHistoryUi();
  }

  setBalanceHistory(entries, totalRunCount) {
    const next = Array.isArray(entries) ? entries.slice(-this.maxHistoryEntries) : [];
    this.balanceHistory = next.map((entry) => ({
      ...entry,
      segments: Array.isArray(entry.segments)
        ? entry.segments.map((segment) => ({ ...segment }))
        : [],
      activities: Array.isArray(entry.activities)
        ? entry.activities.map((activity) => ({ ...activity }))
        : [],
    }));
    if (Number.isFinite(totalRunCount)) {
      this.totalRunCount = totalRunCount;
    } else if (this.balanceHistory.length > 0) {
      const latest = this.balanceHistory[this.balanceHistory.length - 1];
      if (latest && Number.isFinite(latest.runNumber)) {
        this.totalRunCount = latest.runNumber;
      } else {
        this.totalRunCount = this.balanceHistory.length;
      }
    } else {
      this.totalRunCount = 0;
    }
    this.updateHistoryUi({ refreshEntries: true });
  }

  appendBalanceHistoryEntry(entry, totalRunCount) {
    if (!entry || typeof entry !== 'object') {
      return;
    }
    const normalized = {
      ...entry,
      segments: Array.isArray(entry.segments)
        ? entry.segments.map((segment) => ({ ...segment }))
        : [],
      activities: Array.isArray(entry.activities)
        ? entry.activities.map((activity) => ({ ...activity }))
        : [],
    };
    const next =
      this.balanceHistory.length >= this.maxHistoryEntries
        ? [...this.balanceHistory.slice(1), normalized]
        : [...this.balanceHistory, normalized];
    this.balanceHistory = next;
    if (Number.isFinite(totalRunCount)) {
      this.totalRunCount = totalRunCount;
    } else if (Number.isFinite(normalized.runNumber)) {
      const previousTotal = Number.isFinite(this.totalRunCount) ? this.totalRunCount : 0;
      this.totalRunCount = Math.max(previousTotal, normalized.runNumber);
    } else {
      const previousTotal = Number.isFinite(this.totalRunCount) ? this.totalRunCount : 0;
      this.totalRunCount = previousTotal + 1;
    }
    this.updateHistoryUi({ refreshEntries: true });
  }

  captureBalanceSnapshot(schedule, signature) {
    const nextRunNumber = (Number.isFinite(this.totalRunCount) ? this.totalRunCount : 0) + 1;
    const entry = createBalanceHistoryEntry(schedule, {
      runNumber: nextRunNumber,
      highContrast: this.state.highContrast,
      signature,
    });
    if (!entry) {
      return;
    }
    this.appendBalanceHistoryEntry(entry, nextRunNumber);
  }

  getRunMetaSlot() {
    return this.metaSlot || null;
  }

  attachRunMeta(element) {
    if (!this.metaSlot) {
      return;
    }
    if (!(element instanceof HTMLElement)) {
      this.detachRunMeta();
      this.metaSlot.hidden = true;
      return;
    }
    if (this.metaElement !== element || element.parentElement !== this.metaSlot) {
      this.detachRunMeta();
      this.metaElement = element;
      this.metaSlot.append(element);
    }
    this.metaSlot.hidden = Boolean(element.hidden);
  }

  detachRunMeta() {
    if (this.metaElement && this.metaElement.parentElement === this.metaSlot) {
      this.metaSlot.removeChild(this.metaElement);
    }
    this.metaElement = null;
    if (this.metaSlot) {
      this.metaSlot.hidden = true;
    }
  }

  destroy() {
    this.detachRunMeta();
    this.stopPlayback();
    if (this.resizeObserver) {
      this.resizeObserver.disconnect();
    }
    if (this.contrastQuery) {
      if (typeof this.contrastQuery.removeEventListener === 'function') {
        this.contrastQuery.removeEventListener('change', this.handleContrastChange);
      } else if (typeof this.contrastQuery.removeListener === 'function') {
        this.contrastQuery.removeListener(this.handleContrastChange);
      }
    }
    this.root.removeEventListener('keydown', this.handleKeyDown);
  }

  update(props = {}) {
    this.props = { ...this.props, ...props };
    const payload = this.props.data;
    const hasEvents =
      payload &&
      typeof payload === 'object' &&
      Array.isArray(payload.events) &&
      payload.events.length > 0;

    if (!hasEvents) {
      this.layout = null;
      this.hasRenderableData = false;
      this.rebuildDisplayArcs();
      this.updateLegend();
      this.refreshModeButtons();
      this.render();
      if (this.isHistoryOpen) {
        this.isHistoryOpen = false;
      }
      this.updateHistoryUi();
      return;
    }

    try {
      this.layout = computeUrchinLayout(this.props.data, {
        mode: this.state.mode ?? this.props.mode,
        includeLabels: (label) => !this.hiddenLabels.has(label),
        highContrast: this.state.highContrast,
      });
      this.hasRenderableData = true;
      this.didWarnNoData = false;
    } catch (error) {
      console.error('[RadialUrchin] failed to compute layout:', error);
      this.layout = null;
      this.hasRenderableData = false;
    }

    this.updateLegend();
    this.refreshModeButtons();
    this.rebuildDisplayArcs();
    this.render();
  }

  handleContrastChange(event) {
    this.state.highContrast = Boolean(event.matches);
    this.update({});
  }

  refreshModeButtons() {
    this.modeButtons.forEach((button, mode) => {
      const active = mode === this.getMode();
      button.classList.toggle('is-active', active);
      button.setAttribute('aria-pressed', active ? 'true' : 'false');
    });
    Array.from(this.speedGroup.children).forEach((button) => {
      const speedValue = Number.parseFloat(button.dataset.speed || '1');
      const active = Math.abs(speedValue - this.state.playSpeed) < 0.01;
      button.classList.toggle('is-active', active);
    });
    this.playButton.classList.toggle('is-active', this.state.playing);
    this.playButton.innerHTML = this.state.playing
      ? '<span class="icon">❚❚</span>'
      : '<span class="icon">▶</span>';
  }

  getMode() {
    return this.state.mode || this.props.mode || 'day-rings';
  }

  setMode(mode) {
    if (mode === this.getMode()) {
      return;
    }
    this.state.mode = mode;
    this.update({ mode });
  }

  updateLegend() {
    this.legendContainer.innerHTML = '';
    if (!this.layout?.totals?.length) {
      const empty = document.createElement('p');
      empty.className = 'radial-urchin__legend-empty';
      empty.textContent = 'No activities available. Run generator to populate schedule.';
      this.legendContainer.append(empty);
      return;
    }
    const fragment = document.createDocumentFragment();
    this.layout.totals.forEach(({ label, minutes }) => {
      const chip = document.createElement('label');
      chip.className = 'radial-urchin__chip';
      chip.style.setProperty('--chip-color', mapLabelToColor(label, { highContrast: this.state.highContrast }));
      const checkbox = document.createElement('input');
      checkbox.type = 'checkbox';
      checkbox.checked = !this.hiddenLabels.has(label);
      checkbox.addEventListener('change', () => {
        if (checkbox.checked) {
          this.hiddenLabels.delete(label);
        } else {
          this.hiddenLabels.add(label);
        }
        this.update({});
      });
      const text = document.createElement('span');
      text.textContent = `${label} · ${formatDuration(Math.round(minutes))}`;
      chip.append(checkbox, text);
      fragment.append(chip);
    });
    this.legendContainer.append(fragment);
  }

  rebuildDisplayArcs() {
    if (!this.layout) {
      this.displayArcs = [];
      this.visibleArcs = [];
      this.updateShareBar();
      return;
    }
    const zoom = this.getZoom();
    const scale = this.computeRadiusScale();
    const visible = [];
    const arcs = [];
    this.layout.arcs.forEach((arc) => {
      if (this.hiddenLabels.has(arc.label)) {
        return;
      }
      const agentMatch = this.isAgentMatch(arc.event);
      const segments = this.computeSegments(arc, zoom);
      segments.forEach((segment, index) => {
        const startAngle = this.mapMinutesToAngle(segment.startRelative);
        const endAngle = this.mapMinutesToAngle(segment.startRelative + segment.duration);
        const displayArc = {
          ...arc,
          id: index === 0 ? arc.id : `${arc.id}:${index}`,
          startAngle,
          endAngle,
          segmentStart: moduloMinutes(segment.absoluteStart),
          segmentDuration: segment.duration,
          centerAngle: startAngle + (endAngle - startAngle) / 2,
          agentMatch,
          innerRadius: arc.innerRadius * scale,
          outerRadius: arc.outerRadius * scale,
        };
        arcs.push(displayArc);
        visible.push(displayArc);
      });
    });
    this.displayArcs = arcs;
    this.visibleArcs = visible.sort((a, b) => {
      if (a.ringIndex === b.ringIndex) {
        return a.startMinutes - b.startMinutes;
      }
      return a.ringIndex - b.ringIndex;
    });
    this.displayMaxRadius = (this.layout?.maxRadius || 160) * scale;
    this.updateShareBar();
  }

  computeVisibleActivityTotals() {
    if (!Array.isArray(this.visibleArcs) || this.visibleArcs.length === 0) {
      return [];
    }
    const totals = new Map();
    this.visibleArcs.forEach((arc) => {
      const duration = Number.isFinite(arc.segmentDuration)
        ? arc.segmentDuration
        : Number.isFinite(arc.duration)
          ? arc.duration
          : 0;
      if (!(duration > 0)) {
        return;
      }
      const label = arc.label || arc.event?.activity || 'Activity';
      if (!totals.has(label)) {
        totals.set(label, {
          id: label,
          label,
          minutes: 0,
          color: arc.color || mapLabelToColor(label, { highContrast: this.state.highContrast }),
        });
      }
      const entry = totals.get(label);
      entry.minutes += duration;
    });
    return Array.from(totals.values()).sort((a, b) => b.minutes - a.minutes);
  }

  updateShareBar() {
    if (!this.shareBar) {
      return;
    }
    const totals = this.computeVisibleActivityTotals();
    const { segments, totalMinutes } = prepareActivityShareSegments(totals);
    this.shareBar.update(segments, totalMinutes);
    const hasSegments = segments.length > 0 && totalMinutes > 0;
    if (!hasSegments && this.isHistoryOpen) {
      this.isHistoryOpen = false;
    }
    this.updateHistoryUi();
  }

  computeSegments(arc, zoom) {
    const windowStart = zoom.start;
    const windowEnd = zoom.start + zoom.span;
    const baseOffsets = zoom.span >= FULL_DAY_MINUTES ? [0] : [-FULL_DAY_MINUTES, 0, FULL_DAY_MINUTES];
    const segments = [];
    baseOffsets.forEach((offset) => {
      const start = arc.startMinutes + offset;
      const end = start + arc.duration;
      const clippedStart = Math.max(start, windowStart);
      const clippedEnd = Math.min(end, windowEnd);
      if (clippedEnd > clippedStart) {
        segments.push({
          absoluteStart: clippedStart,
          absoluteEnd: clippedEnd,
          startRelative: clippedStart - zoom.start,
          duration: clippedEnd - clippedStart,
        });
      }
    });
    return segments;
  }

  mapMinutesToAngle(relativeMinutes) {
    const zoom = this.getZoom();
    if (zoom.span >= FULL_DAY_MINUTES) {
      const normalized = moduloMinutes(relativeMinutes + zoom.start);
      return (normalized / FULL_DAY_MINUTES) * TAU - Math.PI / 2;
    }
    const clamped = clamp(relativeMinutes, 0, zoom.span);
    const angle = (clamped / zoom.span) * TAU - Math.PI / 2;
    return angle;
  }

  computeRadiusScale() {
    if (!this.layout) {
      return 1;
    }
    if (!this.canvasRect) {
      this.canvasRect = getElementRect(this.canvas);
    }
    const width = this.canvasRect?.width || this.canvas.width || 0;
    const height = this.canvasRect?.height || this.canvas.height || 0;
    const minSide = Math.min(width, height);
    if (!minSide) {
      return 1;
    }
    const maxRadius = this.layout.maxRadius || 160;
    const padding = 32;
    const usable = minSide / 2 - padding;
    if (usable <= 0) {
      return 1;
    }
    return usable / maxRadius;
  }

  getZoom() {
    return { start: this.state.zoomStart ?? 0, span: this.state.zoomSpan ?? FULL_DAY_MINUTES };
  }

  resetZoom() {
    this.state.zoomStart = 0;
    this.state.zoomSpan = FULL_DAY_MINUTES;
    this.rebuildDisplayArcs();
    this.render();
  }

  handleWheel(event) {
    if (!this.canvasRect) {
      return;
    }
    event.preventDefault();
    const { left, top, width, height } = this.canvasRect;
    const centerX = width / 2;
    const centerY = height / 2;
    const x = event.clientX - left - centerX;
    const y = event.clientY - top - centerY;
    const angle = Math.atan2(y, x);

    const current = this.getZoom();
    let span = current.span * (1 + event.deltaY * 0.0015);
    span = clamp(span, 120, FULL_DAY_MINUTES);

    const angleRatio = (angle + Math.PI / 2) / TAU;
    const focusMinutes = moduloMinutes((angleRatio < 0 ? angleRatio + 1 : angleRatio) * current.span + current.start);

    const newStart = moduloMinutes(focusMinutes - span * 0.5);

    this.state.zoomSpan = span;
    this.state.zoomStart = newStart;
    this.rebuildDisplayArcs();
    this.render();
  }

  handleResize(entries) {
    if (!entries || entries.length === 0) {
      return;
    }
    const entry = entries[0];
    const width = entry.contentRect?.width ?? this.canvasWrapper.clientWidth;
    const height = entry.contentRect?.height ?? this.canvasWrapper.clientHeight;
    const devicePixelRatio = window.devicePixelRatio || 1;
    this.canvas.width = Math.round(width * devicePixelRatio);
    this.canvas.height = Math.round(height * devicePixelRatio);
    this.canvas.style.width = `${width}px`;
    this.canvas.style.height = `${height}px`;
    this.offscreen.width = this.canvas.width;
    this.offscreen.height = this.canvas.height;
    this.overlay.setAttribute('viewBox', `0 0 ${width} ${height}`);
    this.overlay.setAttribute('width', width);
    this.overlay.setAttribute('height', height);
    this.center = { x: width / 2, y: height / 2 };
    this.didWarnInvalidCenter = false;
    this.canvasRect = getElementRect(this.canvas);
    this.rebuildDisplayArcs();
    this.render();
  }

  render() {
    if (!this.canvas || !this.canvas.width) {
      return;
    }
    const ctx = this.offscreen.getContext('2d');
    const mainCtx = this.canvas.getContext('2d');
    if (!ctx || !mainCtx) {
      return;
    }

    if (!this.hasValidCenter()) {
      if (!this.didWarnInvalidCenter) {
        console.warn('[RadialUrchin] invalid center point, skipping render', this.center);
        this.didWarnInvalidCenter = true;
      }
      this.updateSelectionOverlay();
      this.updateScrubOverlay();
      return;
    }
    this.didWarnInvalidCenter = false;

    if (!this.hasRenderableData || !this.layout || !Array.isArray(this.layout.arcs) || this.layout.arcs.length === 0) {
      ctx.clearRect(0, 0, this.offscreen.width, this.offscreen.height);
      mainCtx.clearRect(0, 0, this.canvas.width, this.canvas.height);
      if (!this.didWarnNoData) {
        console.warn('[RadialUrchin] no data to render, skipping');
        this.didWarnNoData = true;
      }
      this.updateSelectionOverlay();
      this.updateScrubOverlay();
      return;
    }

    ctx.clearRect(0, 0, this.offscreen.width, this.offscreen.height);
    const dpr = window.devicePixelRatio || 1;
    ctx.save();
    ctx.scale(dpr, dpr);
    const center = this.center;

    ctx.translate(center.x, center.y);
    ctx.lineWidth = 1;
    ctx.lineCap = 'butt';
    ctx.lineJoin = 'round';

    this.displayArcs.forEach((arc) => {
      const color = arc.color || mapLabelToColor(arc.label, { highContrast: this.state.highContrast });
      ctx.globalAlpha = arc.agentMatch ? 1 : 0.25;
      ctx.beginPath();
      ctx.fillStyle = resolveStateLayer(color, 0.24);
      ctx.strokeStyle = color;
      ctx.moveTo(0, 0);
      ctx.arc(0, 0, arc.outerRadius, arc.startAngle, arc.endAngle, false);
      ctx.arc(0, 0, arc.innerRadius, arc.endAngle, arc.startAngle, true);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
    });

    ctx.restore();
    ctx.globalAlpha = 1;

    mainCtx.clearRect(0, 0, this.canvas.width, this.canvas.height);
    mainCtx.drawImage(this.offscreen, 0, 0);

    this.updateSelectionOverlay();
    this.updateScrubOverlay();
  }

  isAgentMatch(event) {
    const target = typeof this.props.selectedAgent === 'string' ? this.props.selectedAgent.trim() : '';
    if (!target) {
      return true;
    }
    const normalized = target.toLowerCase();
    const agent =
      (typeof event?.agent === 'string' && event.agent) ||
      (event?.metadata && typeof event.metadata.agent === 'string' ? event.metadata.agent : '');
    if (!agent) {
      return false;
    }
    return agent.toLowerCase() === normalized;
  }

  handlePointerMove(event) {
    if (!this.canvasRect) {
      this.canvasRect = getElementRect(this.canvas);
    }
    const { left, top, width, height } = this.canvasRect;
    const x = event.clientX - left - width / 2;
    const y = event.clientY - top - height / 2;
    this.lastPointer = { x, y };
    if (this.hoverTimer) {
      window.clearTimeout(this.hoverTimer);
      this.hoverTimer = null;
    }
    this.hoverTimer = window.setTimeout(() => {
      this.processHoverAtPoint({ x, y });
    }, HOVER_DELAY);
  }

  handlePointerLeave() {
    if (this.hoverTimer) {
      window.clearTimeout(this.hoverTimer);
      this.hoverTimer = null;
    }
    this.state.hoverArc = null;
    this.hoverPath.setAttribute('d', '');
    this.hideTooltip();
  }

  processHoverAtPoint(point) {
    if (!this.hasValidCenter()) {
      this.state.hoverArc = null;
      this.hoverPath.setAttribute('d', '');
      this.hideTooltip();
      return;
    }
    const center = this.center;
    const layout = {
      arcs: this.displayArcs.map((arc) => ({
        ...arc,
        innerRadius: arc.innerRadius,
        outerRadius: arc.outerRadius,
      })),
    };
    const hovered = findNearestArc(layout, point, { tolerance: 12 });
    if (!hovered) {
      this.state.hoverArc = null;
      this.hoverPath.setAttribute('d', '');
      this.hideTooltip();
      return;
    }
    this.state.hoverArc = hovered;
    const path = describeSegmentPath(
      center.x,
      center.y,
      hovered.innerRadius,
      hovered.outerRadius,
      hovered.startAngle,
      hovered.endAngle,
    );
    this.hoverPath.setAttribute('d', path);
    this.showTooltip(hovered);
  }

  handleClick() {
    if (this.state.hoverArc) {
      this.setSelection(this.state.hoverArc);
    }
  }

  handleKeyDown(event) {
    if (event.key === 'Escape') {
      this.clearSelection();
      return;
    }
    if (!['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'].includes(event.key)) {
      return;
    }
    event.preventDefault();
    if (this.visibleArcs.length === 0) {
      return;
    }
    const current = this.state.selectedArc || this.state.hoverArc || this.visibleArcs[0];
    let target = current;
    if (event.key === 'ArrowRight') {
      target = this.findAdjacentArc(current, +1);
    } else if (event.key === 'ArrowLeft') {
      target = this.findAdjacentArc(current, -1);
    } else if (event.key === 'ArrowUp') {
      target = this.findRingShift(current, -1);
    } else if (event.key === 'ArrowDown') {
      target = this.findRingShift(current, +1);
    }
    if (target) {
      this.setSelection(target);
    }
  }

  findAdjacentArc(current, delta) {
    if (!current) {
      return null;
    }
    const arcs = this.visibleArcs.filter((arc) => arc.ringKey === current.ringKey);
    const index = arcs.findIndex((arc) => arc.id === current.id);
    if (index === -1) {
      return arcs[0] || null;
    }
    const nextIndex = (index + delta + arcs.length) % arcs.length;
    return arcs[nextIndex];
  }

  findRingShift(current, delta) {
    if (!current) {
      return null;
    }
    const rings = Array.from(new Set(this.visibleArcs.map((arc) => arc.ringKey)));
    const ringIndex = rings.indexOf(current.ringKey);
    if (ringIndex === -1) {
      return null;
    }
    const nextRing = rings[clamp(ringIndex + delta, 0, rings.length - 1)];
    const candidates = this.visibleArcs
      .filter((arc) => arc.ringKey === nextRing)
      .sort((a, b) => Math.abs(a.startMinutes - current.startMinutes) - Math.abs(b.startMinutes - current.startMinutes));
    return candidates[0] || null;
  }

  setSelection(arc) {
    this.state.selectedArc = arc;
    if (typeof this.props.onSelect === 'function') {
      this.props.onSelect(arc.event ?? null);
    }
    const message = arc
      ? `${arc.label}, ${minutesToTime(arc.startMinutes)} to ${minutesToTime(arc.startMinutes + arc.duration)}`
      : 'Selection cleared';
    this.liveRegion.textContent = message;
    this.updateSelectionOverlay();
  }

  clearSelection() {
    this.state.selectedArc = null;
    this.updateSelectionOverlay();
  }

  showTooltip(arc) {
    if (!arc) {
      this.hideTooltip();
      return;
    }
    const html = buildTooltipContent(arc);
    this.tooltipMeta.innerHTML = html;
    this.tooltip.hidden = false;
    if (!this.hasValidCenter()) {
      this.hideTooltip();
      return;
    }
    const center = this.center;
    const angle = arc.centerAngle;
    const radius = (arc.innerRadius + arc.outerRadius) / 2;
    const x = center.x + Math.cos(angle) * radius;
    const y = center.y + Math.sin(angle) * radius;
    this.tooltip.style.left = `${x + 12}px`;
    this.tooltip.style.top = `${y + 12}px`;
  }

  hideTooltip() {
    this.tooltip.hidden = true;
  }

  updateSelectionOverlay() {
    const arc = this.state.selectedArc;
    if (!arc || !this.hasValidCenter()) {
      this.selectionPath.setAttribute('d', '');
      return;
    }
    const center = this.center;
    const path = describeSegmentPath(
      center.x,
      center.y,
      arc.innerRadius,
      arc.outerRadius,
      arc.startAngle,
      arc.endAngle,
    );
    this.selectionPath.setAttribute('d', path);
  }

  updateScrubOverlay() {
    if (!this.hasValidCenter()) {
      this.scrubLine.setAttribute('x1', '0');
      this.scrubLine.setAttribute('y1', '0');
      this.scrubLine.setAttribute('x2', '0');
      this.scrubLine.setAttribute('y2', '0');
      return;
    }
    const center = this.center;
    const minutes = this.state.scrubMinutes;
    const angle = this.mapMinutesToAngle(minutes - this.getZoom().start);
    const radius = this.displayMaxRadius ?? (this.layout?.maxRadius ?? 160);
    const x2 = center.x + Math.cos(angle) * radius;
    const y2 = center.y + Math.sin(angle) * radius;
    this.scrubLine.setAttribute('x1', String(center.x));
    this.scrubLine.setAttribute('y1', String(center.y));
    this.scrubLine.setAttribute('x2', String(x2));
    this.scrubLine.setAttribute('y2', String(y2));
  }

  setScrub(minutes, { fromPlayback = false } = {}) {
    const normalized = moduloMinutes(minutes);
    this.state.scrubMinutes = normalized;
    this.scrubSlider.value = String(normalized);
    this.updateScrubOverlay();
    if (fromPlayback) {
      const arc = this.findArcAtMinutes(normalized);
      if (arc) {
        this.showTooltip(arc);
      }
    }
  }

  findArcAtMinutes(minutes) {
    return this.displayArcs.find((arc) => {
      const start = moduloMinutes(arc.startMinutes);
      const end = moduloMinutes(arc.startMinutes + arc.duration);
      if (start <= end) {
        return minutes >= start && minutes <= end;
      }
      return minutes >= start || minutes <= end;
    });
  }

  togglePlayback() {
    if (this.state.playing) {
      this.stopPlayback();
    } else {
      this.startPlayback();
    }
  }

  setSpeed(speed) {
    this.state.playSpeed = speed;
    this.refreshModeButtons();
  }

  startPlayback() {
    this.state.playing = true;
    this.refreshModeButtons();
    this.lastTick = performance.now();
    const tick = (timestamp) => {
      if (!this.state.playing) {
        return;
      }
      const deltaMs = timestamp - this.lastTick;
      this.lastTick = timestamp;
      const deltaMinutes = (deltaMs / 60000) * this.state.playSpeed * (this.getZoom().span / FULL_DAY_MINUTES);
      this.setScrub(this.state.scrubMinutes + deltaMinutes, { fromPlayback: true });
      this.frameHandle = window.requestAnimationFrame(tick);
    };
    this.frameHandle = window.requestAnimationFrame(tick);
  }

  stopPlayback() {
    this.state.playing = false;
    if (this.frameHandle) {
      window.cancelAnimationFrame(this.frameHandle);
      this.frameHandle = null;
    }
    this.refreshModeButtons();
  }

  exportSVG() {
    if (!this.layout) {
      return '';
    }
    const width = this.canvasRect?.width || 512;
    const height = this.canvasRect?.height || 512;
    const cx = width / 2;
    const cy = height / 2;
    const arcs = this.displayArcs
      .map((arc) => {
        const path = describeSegmentPath(cx, cy, arc.innerRadius, arc.outerRadius, arc.startAngle, arc.endAngle);
        const fill = resolveStateLayer(
          arc.color || mapLabelToColor(arc.label, { highContrast: this.state.highContrast }),
          0.24,
        );
        const stroke = arc.color || mapLabelToColor(arc.label, { highContrast: this.state.highContrast });
        return `<path d="${path}" fill="${fill}" stroke="${stroke}" stroke-width="1" />`;
      })
      .join('');
    return `<?xml version="1.0" encoding="UTF-8"?><svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}"><rect width="100%" height="100%" fill="${resolveSurface(false)}"/>${arcs}</svg>`;
  }

  async exportPNG() {
    if (!this.canvas) {
      return null;
    }
    return new Promise((resolve) => {
      this.canvas.toBlob((blob) => {
        resolve(blob);
      }, 'image/png');
    });
  }
}

function hasRenderableEvents(data) {
  return (
    data &&
    typeof data === 'object' &&
    Array.isArray(data.events) &&
    data.events.length > 0
  );
}

export function createRadialUrchin(root, props) {
  if (!(root instanceof HTMLElement)) {
    console.warn('[RadialUrchin] invalid mount element, skipping');
    return null;
  }

  const payload = props?.data;
  if (!hasRenderableEvents(payload)) {
    console.info('[RadialUrchin] no data at create time, not rendering yet');
    return null;
  }

  try {
    return new RadialUrchin(root, props);
  } catch (error) {
    console.error('[RadialUrchin] failed to initialize:', error);
    return null;
  }
}
