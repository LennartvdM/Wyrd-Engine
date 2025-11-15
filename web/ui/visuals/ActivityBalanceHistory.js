import { formatDuration } from './useUrchinLayout.js';
import { computeSegmentTextColor } from './ActivityShareBar.js';

export class ActivityBalanceHistory {
  constructor(container) {
    this.root = document.createElement('div');
    this.root.className = 'activity-balance-history';
    this.root.hidden = true;
    this.root.setAttribute('role', 'region');
    this.root.setAttribute('aria-label', 'Activity balance history');

    this.header = document.createElement('div');
    this.header.className = 'activity-balance-history__header';

    this.title = document.createElement('span');
    this.title.className = 'activity-balance-history__title';
    this.title.textContent = 'Balance history';

    this.meta = document.createElement('span');
    this.meta.className = 'activity-balance-history__hint';
    this.meta.textContent = 'Most recent on top';

    this.header.append(this.title, this.meta);

    this.stack = document.createElement('div');
    this.stack.className = 'activity-balance-history__stack';

    this.empty = document.createElement('p');
    this.empty.className = 'activity-balance-history__empty';
    this.empty.textContent = 'Run generator to build balance history.';

    this.tooltip = document.createElement('div');
    this.tooltip.className = 'activity-balance-history__tooltip';
    this.tooltip.hidden = true;
    this.tooltip.setAttribute('role', 'dialog');
    this.tooltip.setAttribute('aria-live', 'polite');
    this.tooltip.setAttribute('aria-hidden', 'true');

    this.boundHideTooltip = this.hideTooltip.bind(this);

    this.root.append(this.header, this.stack, this.empty, this.tooltip);

    container.append(this.root);

    this.entries = [];
  }

  setEntries(entries) {
    this.entries = Array.isArray(entries) ? entries.slice() : [];
    this.render();
  }

  setOpen(open) {
    const shouldShow = Boolean(open);
    if (!shouldShow) {
      this.hideTooltip();
    }
    this.root.hidden = !shouldShow;
    this.root.setAttribute('aria-hidden', shouldShow ? 'false' : 'true');
  }

  render() {
    this.hideTooltip();
    this.stack.innerHTML = '';
    const hasEntries = this.entries.length > 0;
    this.stack.hidden = !hasEntries;
    this.empty.hidden = hasEntries;

    if (!hasEntries) {
      return;
    }

    const fragment = document.createDocumentFragment();
    const displayEntries = this.entries.slice().reverse();
    displayEntries.forEach((entry, index) => {
      const runNumber = Number.isFinite(entry?.runNumber)
        ? entry.runNumber
        : this.entries.length - index;
      const badge = document.createElement('span');
      badge.className = 'activity-balance-history__run';
      badge.textContent = entry.label || `Run #${runNumber}`;
      if (entry.timestampLabel) {
        badge.title = entry.timestampLabel;
      }

      const meta = document.createElement('span');
      meta.className = 'activity-balance-history__run-meta';
      meta.textContent = entry.timestampLabel || '';
      if (!meta.textContent) {
        meta.hidden = true;
      }

      const labelWrapper = document.createElement('div');
      labelWrapper.className = 'activity-balance-history__run-wrapper';
      labelWrapper.append(badge);
      if (!meta.hidden) {
        labelWrapper.append(meta);
      }

      const bar = document.createElement('div');
      bar.className = 'activity-balance-history__bar';
      bar.setAttribute('role', 'list');
      bar.dataset.index = String(runNumber);
      bar.addEventListener('mouseleave', this.boundHideTooltip);

      entry.segments.forEach((segment, segmentIndex) => {
        const element = document.createElement('div');
        element.className = 'activity-share__segment activity-balance-history__segment';
        element.style.setProperty('--segment-color', segment.color || '#6366f1');
        element.style.setProperty('--segment-text-color', computeSegmentTextColor(segment.color));
        element.style.flexGrow = String(segment.minutes);
        element.dataset.entryIndex = String(runNumber);
        element.dataset.segmentIndex = String(segmentIndex);
        element.setAttribute('role', 'listitem');

        const percentValue = Math.round(segment.percentage * 100);
        const labelText = this.getSegmentLabel(segment, percentValue);
        if (labelText) {
          const label = document.createElement('span');
          label.className = 'activity-balance-history__segment-label';
          label.textContent = labelText;
          element.append(label);
        }

        element.addEventListener('mouseenter', (event) => {
          this.showTooltip(event, entry, segment);
        });
        element.addEventListener('mousemove', (event) => {
          this.positionTooltip(event);
        });
        element.addEventListener('mouseleave', this.boundHideTooltip);

        bar.append(element);
      });

      const row = document.createElement('div');
      row.className = 'activity-balance-history__row';
      row.dataset.index = String(runNumber);
      row.append(labelWrapper, bar);

      fragment.append(row);
    });

    this.stack.append(fragment);
  }

  getSegmentLabel(segment, percentValue) {
    if (segment.percentage >= 0.3) {
      return `${segment.label} · ${percentValue}%`;
    }
    if (segment.percentage >= 0.18) {
      return `${percentValue}%`;
    }
    return '';
  }

  showTooltip(event, entry, segment) {
    const percentValue = Math.round(segment.percentage * 100);
    const durationLabel = formatDuration(Math.round(segment.minutes));
    const headerParts = [];
    if (entry.label) {
      headerParts.push(`<strong>${entry.label}</strong>`);
    }
    if (entry.timestampLabel) {
      headerParts.push(`<span class="meta">${entry.timestampLabel}</span>`);
    }
    const header = headerParts.join('');
    this.tooltip.innerHTML = `${header}<span>${segment.label}</span><span>${durationLabel}</span><span>${percentValue}%</span>`;
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
}
