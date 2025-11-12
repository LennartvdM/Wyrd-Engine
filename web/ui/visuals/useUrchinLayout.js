import { mapLabelToColor } from './palette.js';

const FULL_DAY_MINUTES = 24 * 60;
const TAU = Math.PI * 2;

function parseTimeToMinutes(value) {
  if (typeof value !== 'string') {
    return 0;
  }
  const [hours, minutes] = value.split(':').map((part) => Number.parseInt(part, 10));
  if (!Number.isFinite(hours) || !Number.isFinite(minutes)) {
    return 0;
  }
  return (hours * 60 + minutes) % FULL_DAY_MINUTES;
}

function normaliseDuration(start, end) {
  if (end >= start) {
    return end - start;
  }
  return FULL_DAY_MINUTES - start + end;
}

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function minutesToAngle(minutes) {
  return (minutes / FULL_DAY_MINUTES) * TAU - Math.PI / 2;
}

function computeRingKey(event, mode) {
  if (mode === 'agent-rings') {
    if (event.agent) {
      return { key: event.agent, label: event.agent, sortKey: event.agent.toLowerCase() };
    }
    if (event.metadata && typeof event.metadata.agent === 'string') {
      const label = event.metadata.agent;
      return { key: label, label, sortKey: label.toLowerCase() };
    }
    if (event.activity) {
      return { key: event.activity, label: event.activity, sortKey: event.activity.toLowerCase() };
    }
  }
  const label = event.date || 'Unknown';
  return { key: label, label, sortKey: label };
}

function normaliseEvents(events) {
  return events
    .map((event, index) => ({
      ...event,
      _index: index,
    }))
    .filter((event) => typeof event.start === 'string' && typeof event.end === 'string');
}

export function groupEventsByRing(events, mode) {
  const grouped = new Map();
  events.forEach((event) => {
    const ring = computeRingKey(event, mode);
    if (!grouped.has(ring.key)) {
      grouped.set(ring.key, { key: ring.key, label: ring.label, sortKey: ring.sortKey, events: [] });
    }
    grouped.get(ring.key).events.push(event);
  });
  return Array.from(grouped.values()).sort((a, b) => a.sortKey.localeCompare(b.sortKey));
}

export function computeLabelTotals(events) {
  const totals = new Map();
  events.forEach((event) => {
    const label = event.label || event.activity || 'Activity';
    const start = parseTimeToMinutes(event.start);
    const end = parseTimeToMinutes(event.end);
    const duration = normaliseDuration(start, end);
    const previous = totals.get(label) || 0;
    totals.set(label, previous + duration);
  });
  return Array.from(totals.entries())
    .map(([label, minutes]) => ({ label, minutes }))
    .sort((a, b) => b.minutes - a.minutes);
}

export function computeUrchinLayout(schedule, options = {}) {
  const mode = options.mode || 'day-rings';
  const ringWidth = options.ringWidth || 34;
  const ringGap = options.ringGap || 12;
  const baseRadius = options.baseRadius || 48;
  const includeLabels = options.includeLabels ?? (() => true);
  const highContrast = Boolean(options.highContrast);

  const events = normaliseEvents(Array.isArray(schedule?.events) ? schedule.events : []);
  const totals = computeLabelTotals(events);

  const grouped = groupEventsByRing(events, mode);
  const ringEntries = [];
  const arcs = [];

  grouped.forEach((group, ringIndex) => {
    const innerRadius = baseRadius + ringIndex * (ringWidth + ringGap);
    const outerRadius = innerRadius + ringWidth;
    const ringArcs = [];

    group.events
      .map((event) => {
        const label = event.label || event.activity || 'Activity';
        const startMinutes = parseTimeToMinutes(event.start);
        const endMinutes = parseTimeToMinutes(event.end);
        const duration = normaliseDuration(startMinutes, endMinutes);
        return {
          id: `${group.key}:${event._index}`,
          event,
          ringKey: group.key,
          ringIndex,
          label,
          startMinutes,
          endMinutes,
          duration,
          color: mapLabelToColor(label, { highContrast }),
          innerRadius,
          outerRadius,
          startAngle: minutesToAngle(startMinutes),
          endAngle: minutesToAngle((startMinutes + duration) % FULL_DAY_MINUTES),
        };
      })
      .sort((a, b) => a.startMinutes - b.startMinutes)
      .forEach((arc) => {
        if (!includeLabels(arc.label)) {
          return;
        }
        // Ensure arcs respect direction when wrapping past midnight.
        let endAngle = arc.endAngle;
        if (arc.duration > 0 && arc.startMinutes + arc.duration >= FULL_DAY_MINUTES) {
          endAngle = arc.startAngle + (arc.duration / FULL_DAY_MINUTES) * TAU;
        }
        const normalizedArc = {
          ...arc,
          startAngle: arc.startAngle,
          endAngle,
          centerAngle: arc.startAngle + (endAngle - arc.startAngle) / 2,
        };
        arcs.push(normalizedArc);
        ringArcs.push(normalizedArc);
      });

    ringEntries.push({
      key: group.key,
      label: group.label,
      index: ringIndex,
      innerRadius,
      outerRadius,
      arcs: ringArcs,
    });
  });

  const maxRadius = ringEntries.length
    ? ringEntries[ringEntries.length - 1].outerRadius + ringGap
    : baseRadius + ringWidth;

  return {
    arcs,
    rings: ringEntries,
    totals,
    maxRadius,
    mode,
  };
}

export function findNearestArc(layout, point, options = {}) {
  if (!layout || !Array.isArray(layout.arcs)) {
    return null;
  }
  const tolerance = clamp(options.tolerance ?? 8, 2, 40);
  const { x, y } = point;
  const radius = Math.sqrt(x * x + y * y);
  const angle = Math.atan2(y, x);
  const normalizedAngle = angle < -Math.PI / 2 ? angle + TAU : angle;

  let best = null;
  let bestScore = Infinity;

  layout.arcs.forEach((arc) => {
    if (radius < arc.innerRadius - tolerance || radius > arc.outerRadius + tolerance) {
      return;
    }
    let { startAngle, endAngle } = arc;
    if (endAngle < startAngle) {
      endAngle += TAU;
    }
    let targetAngle = normalizedAngle;
    let adjustedAngle = targetAngle;
    if (targetAngle < startAngle) {
      adjustedAngle = startAngle;
    } else if (targetAngle > endAngle) {
      adjustedAngle = endAngle;
    }
    const angleDist = Math.abs(targetAngle - adjustedAngle);
    const radialCenter = (arc.innerRadius + arc.outerRadius) / 2;
    const radialDist = Math.abs(radius - radialCenter);
    const score = angleDist * radialCenter + radialDist * 0.5;
    if (score < bestScore) {
      best = { arc, angle: targetAngle, radius, score };
      bestScore = score;
    }
  });

  if (!best) {
    return null;
  }

  const withinTolerance = Math.sqrt(best.score) <= tolerance;
  if (!withinTolerance) {
    return null;
  }

  return best.arc;
}

export function formatDuration(minutes) {
  const hours = Math.floor(minutes / 60);
  const remainder = minutes % 60;
  if (hours === 0) {
    return `${remainder}m`;
  }
  if (remainder === 0) {
    return `${hours}h`;
  }
  return `${hours}h ${remainder}m`;
}

export function minutesToTime(minutes) {
  const normalized = ((minutes % FULL_DAY_MINUTES) + FULL_DAY_MINUTES) % FULL_DAY_MINUTES;
  const hours = Math.floor(normalized / 60);
  const mins = normalized % 60;
  return `${String(hours).padStart(2, '0')}:${String(mins).padStart(2, '0')}`;
}
