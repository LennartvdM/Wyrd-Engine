import type { Schedule } from './useUrchinLayout';

export type UrchinMode = 'day-rings' | 'agent-rings';

export interface RadialUrchinProps {
  data: Schedule | null;
  mode?: UrchinMode;
  selectedAgent?: string;
  onSelect?: (activity: Schedule['events'][number] | null) => void;
}

export interface RadialUrchinHandle {
  exportSVG(): string;
  exportPNG(): Promise<Blob | null>;
  setScrub(minutes: number): void;
}

export { RadialUrchin, createRadialUrchin } from './RadialUrchin.js';
export type { Schedule, ScheduleEvent } from './useUrchinLayout';
export { mapLabelToColor } from './palette.js';
