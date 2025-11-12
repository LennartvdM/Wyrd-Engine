const BASE_COLORS = [
  '#6750A4',
  '#386A20',
  '#00677D',
  '#7D5260',
  '#815600',
  '#0B7285',
  '#4E36B1',
  '#B02A37',
  '#00796B',
  '#9C4146',
  '#4C6EF5',
  '#FF6F61',
  '#5C940D',
  '#FF8F00',
  '#2B8A3E',
  '#00A6FB',
  '#C77DFF',
  '#FFB300',
];

const HIGH_CONTRAST_COLORS = [
  '#FFFFFF',
  '#F4B400',
  '#F45D01',
  '#4CAF50',
  '#039BE5',
  '#E91E63',
  '#8E24AA',
  '#3949AB',
  '#00897B',
  '#FB8C00',
];

const DARK_SURFACE = '#1C1B1F';
const LIGHT_SURFACE = '#FDF8FD';

function hashLabel(label) {
  let hash = 0;
  for (let i = 0; i < label.length; i += 1) {
    hash = (hash * 31 + label.charCodeAt(i)) & 0xffffffff;
  }
  return Math.abs(hash);
}

export function mapLabelToColor(label, { highContrast = false } = {}) {
  const palette = highContrast ? HIGH_CONTRAST_COLORS : BASE_COLORS;
  if (!label) {
    return palette[0];
  }
  const hash = hashLabel(label);
  return palette[hash % palette.length];
}

export function resolveSurface(isDark) {
  return isDark ? DARK_SURFACE : LIGHT_SURFACE;
}

export function resolveStateLayer(color, opacity = 0.12) {
  const normalized = opacity < 0 ? 0 : opacity > 1 ? 1 : opacity;
  const alpha = Math.round(normalized * 255)
    .toString(16)
    .padStart(2, '0');
  return `${color}${alpha}`;
}
