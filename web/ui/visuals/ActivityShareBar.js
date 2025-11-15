import { formatDuration } from './useUrchinLayout.js';

function toHexChannel(value) {
  const channel = Number.parseInt(value, 16);
  if (Number.isNaN(channel)) {
    return 0;
  }
  return channel;
}

export function computeSegmentTextColor(background) {
  if (typeof background !== 'string') {
    return '#0f172a';
  }
  let hex = background.trim();
  if (hex.startsWith('#')) {
    hex = hex.slice(1);
  }
  if (hex.length === 3) {
    hex = hex
      .split('')
      .map((char) => char + char)
      .join('');
  }
  if (hex.length !== 6) {
    return '#0f172a';
  }
  const r = toHexChannel(hex.slice(0, 2));
  const g = toHexChannel(hex.slice(2, 4));
  const b = toHexChannel(hex.slice(4, 6));
  const luminance = (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255;
  return luminance > 0.6 ? '#0f172a' : '#f8fafc';
}

export function prepareActivityShareSegments(activities) {
  const filtered = Array.isArray(activities)
    ? activities.filter((activity) => Number.isFinite(activity?.minutes) && activity.minutes > 0)
    : [];
  const totalMinutes = filtered.reduce((sum, activity) => sum + activity.minutes, 0);
  if (totalMinutes <= 0) {
    return { totalMinutes: 0, segments: [] };
  }
  const segments = filtered.map((activity) => ({
    id: activity.id ?? activity.label,
    label: activity.label,
    minutes: activity.minutes,
    color: activity.color,
    percentage: activity.minutes / totalMinutes,
  }));
  return { totalMinutes, segments };
}

export class ActivityShareBar {
  constructor(container) {
    this.root = container;
    this.root.classList.add('radial-urchin__share');
    this.root.setAttribute('role', 'group');
    this.root.setAttribute('aria-label', 'Activity balance overview');

    this.historyAvailable = false;
    this.historyOpen = false;
    this.historyCount = 0;
    this.toggleHandler = null;

    this.header = document.createElement('div');
    this.header.className = 'activity-share__header';
    this.title = document.createElement('span');
    this.title.className = 'activity-share__title';
    this.title.textContent = 'Activity balance';
    this.total = document.createElement('span');
    this.total.className = 'activity-share__total';
    this.total.textContent = '—';
    this.header.append(this.title, this.total);

    this.track = document.createElement('div');
    this.track.className = 'activity-share__track';
    this.track.setAttribute('role', 'list');
    this.track.hidden = true;
    this.track.tabIndex = -1;
    this.track.addEventListener('mouseleave', () => {
      this.hideTooltip();
    });
    this.track.addEventListener('click', () => {
      if (this.canToggleHistory()) {
        this.toggleHandler();
      }
    });
    this.track.addEventListener('keydown', (event) => {
      if (!this.canToggleHistory()) {
        return;
      }
      if (event.key === 'Enter' || event.key === ' ') {
        event.preventDefault();
        this.toggleHandler();
      }
    });

    this.empty = document.createElement('p');
    this.empty.className = 'activity-share__empty';
    this.empty.textContent = 'Select activities to see their balance.';
    this.empty.hidden = false;

    this.tooltip = document.createElement('div');
    this.tooltip.className = 'activity-share__tooltip';
    this.tooltip.hidden = true;
    this.tooltip.setAttribute('role', 'dialog');
    this.tooltip.setAttribute('aria-live', 'polite');
    this.tooltip.setAttribute('aria-hidden', 'true');

    this.historyHint = document.createElement('p');
    this.historyHint.className = 'activity-share__hint';
    this.historyHint.hidden = true;

    this.root.append(this.header, this.track, this.historyHint, this.empty, this.tooltip);

    this.currentSegments = [];
    this.boundHideTooltip = this.hideTooltip.bind(this);
  }

  update(segments, totalMinutes = 0) {
    this.hideTooltip();
    const hasSegments = Array.isArray(segments) && segments.length > 0 && totalMinutes > 0;
    this.track.innerHTML = '';
    this.currentSegments = hasSegments ? segments : [];
    this.total.textContent = hasSegments ? formatDuration(Math.round(totalMinutes)) : '—';
    this.track.hidden = !hasSegments;
    this.empty.hidden = hasSegments;
    this.updateHistoryAffordance();
    if (!hasSegments) {
      return;
    }

    segments.forEach((segment, index) => {
      const element = document.createElement('div');
      element.className = 'activity-share__segment';
      element.style.setProperty('--segment-color', segment.color || '#6366f1');
      element.style.setProperty('--segment-text-color', computeSegmentTextColor(segment.color));
      element.style.flexGrow = String(segment.minutes);
      element.setAttribute('role', 'listitem');
      const percentValue = Math.round(segment.percentage * 100);
      const labelText = this.getSegmentLabel(segment, percentValue);
      if (labelText) {
        const label = document.createElement('span');
        label.className = 'activity-share__segment-label';
        label.textContent = labelText;
        element.append(label);
      }
      element.setAttribute(
        'aria-label',
        `${segment.label}: ${formatDuration(Math.round(segment.minutes))} (${percentValue}%)`,
      );
      element.dataset.index = String(index);
      element.addEventListener('mouseenter', (event) => {
        this.showTooltip(event, segment);
      });
      element.addEventListener('mousemove', (event) => {
        this.positionTooltip(event);
      });
      element.addEventListener('mouseleave', this.boundHideTooltip);
      this.track.append(element);
    });
  }

  getSegmentLabel(segment, percentValue) {
    if (segment.percentage >= 0.18) {
      return `${segment.label} · ${percentValue}%`;
    }
    if (segment.percentage >= 0.1) {
      return `${percentValue}%`;
    }
    return '';
  }

  showTooltip(event, segment) {
    const percentValue = Math.round(segment.percentage * 100);
    const durationLabel = formatDuration(Math.round(segment.minutes));
    this.tooltip.innerHTML = `<strong>${segment.label}</strong><span>${durationLabel}</span><span>${percentValue}%</span>`;
    this.tooltip.hidden = false;
    this.tooltip.setAttribute('aria-hidden', 'false');
    this.positionTooltip(event);
  }

  positionTooltip(event) {
    if (this.tooltip.hidden) {
      return;
    }
    const rootRect = this.root.getBoundingClientRect();
    const x = event.clientX - rootRect.left;
    const y = event.clientY - rootRect.top;
    this.tooltip.style.left = `${x}px`;
    this.tooltip.style.top = `${y}px`;
  }

  hideTooltip() {
    this.tooltip.hidden = true;
    this.tooltip.setAttribute('aria-hidden', 'true');
  }

  setToggleHandler(handler) {
    this.toggleHandler = typeof handler === 'function' ? handler : null;
    this.updateHistoryAffordance();
  }

  setHistoryState({ open, available, count } = {}) {
    if (typeof open === 'boolean') {
      this.historyOpen = open;
    }
    if (typeof available === 'boolean') {
      this.historyAvailable = available;
    }
    if (typeof count === 'number') {
      this.historyCount = count;
    }
    this.updateHistoryAffordance();
  }

  canToggleHistory() {
    return Boolean(this.toggleHandler && this.historyAvailable && this.currentSegments.length > 0);
  }

  updateHistoryAffordance() {
    const canToggle = this.canToggleHistory();
    this.track.classList.toggle('is-interactive', canToggle);
    this.track.tabIndex = canToggle ? 0 : -1;
    this.track.setAttribute('aria-expanded', this.historyOpen ? 'true' : 'false');
    this.root.classList.toggle('has-history', Boolean(this.historyAvailable));
    this.root.classList.toggle('is-history-open', Boolean(this.historyOpen));

    if (this.historyHint) {
      const shouldShowHint = canToggle || (this.historyAvailable && this.historyOpen);
      this.historyHint.hidden = !shouldShowHint;
      if (shouldShowHint) {
        const labelParts = [];
        if (this.historyOpen) {
          labelParts.push('History expanded');
          labelParts.push('Click to collapse');
        } else if (this.historyCount > 0) {
          labelParts.push(`View balance history (${this.historyCount})`);
        } else {
          labelParts.push('Click bar to view balance history');
        }
        this.historyHint.textContent = labelParts.join(' · ');
      }
    }
  }
}
