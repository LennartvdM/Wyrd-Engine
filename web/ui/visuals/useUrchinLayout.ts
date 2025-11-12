export interface ScheduleEvent {
  date: string;
  start: string;
  end: string;
  label: string;
  activity?: string;
  agent?: string;
  metadata?: Record<string, unknown>;
}

export interface Schedule {
  schema_version: string;
  week_start: string;
  events: ScheduleEvent[];
  metadata?: Record<string, unknown>;
}

export interface LabelTotal {
  label: string;
  minutes: number;
}

export interface UrchinArc {
  id: string;
  label: string;
  startMinutes: number;
  duration: number;
  innerRadius: number;
  outerRadius: number;
  color: string;
  ringIndex: number;
  ringKey: string;
  event: ScheduleEvent;
}

export interface UrchinLayout {
  arcs: UrchinArc[];
  rings: Array<{
    key: string;
    label: string;
    index: number;
    innerRadius: number;
    outerRadius: number;
  }>;
  totals: LabelTotal[];
  maxRadius: number;
  mode: 'day-rings' | 'agent-rings';
}

export { computeUrchinLayout, computeLabelTotals, groupEventsByRing, findNearestArc, formatDuration, minutesToTime } from './useUrchinLayout.js';
