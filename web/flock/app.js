// flock — browser interface.
// Draws one person's day, the population's day, and what an agent sees.

const CATEGORIES = [
  { key: 'S', name: 'sleep', css: 'sleep' },
  { key: 'W', name: 'work', css: 'work' },
  { key: 'C', name: 'commute', css: 'commute' },
  { key: 'E', name: 'eating', css: 'eating' },
  { key: 'K', name: 'chores', css: 'chores' },
  { key: 'H', name: 'home', css: 'home' },
  { key: 'O', name: 'out', css: 'out' },
];
const BY_KEY = Object.fromEntries(CATEGORIES.map((c) => [c.key, c]));
const DAY_NAMES = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
const SVG_NS = 'http://www.w3.org/2000/svg';
const MINUTES = 1440;

const $ = (id) => document.getElementById(id);

const state = {
  built: null,
  person: 17,
  day: 1,
  week: 0,
  popDay: 'Tue',
  carpetSort: 'wake',
  blendMode: 'mix',
  dailyCat: 'all',
  stackMode: 'pooled',
  bandRange: '80',
  bandSmooth: false,
  bin: 15,
  week_cache: null,
};

// ---- worker plumbing ------------------------------------------------------

const workerUrl = new URL('./runner.js', import.meta.url);
const pyodideOverride = new URLSearchParams(location.search).get('pyodide');
if (pyodideOverride) workerUrl.searchParams.set('pyodide', pyodideOverride);
const worker = new Worker(workerUrl, { type: 'module' });
const pending = new Map();
let nextId = 1;

worker.onmessage = (event) => {
  const msg = event.data;
  if (msg.type === 'progress') {
    if (msg.stage !== 'ready') setStatus(`${msg.stage}: ${msg.detail}`);
    return;
  }
  const entry = pending.get(msg.id);
  if (!entry) return;
  pending.delete(msg.id);
  msg.ok ? entry.resolve(msg.value) : entry.reject(new Error(msg.error));
};

worker.onerror = (event) => setStatus(event.message || 'worker failed', 'error');

function call(fn, ...args) {
  const id = nextId++;
  return new Promise((resolve, reject) => {
    pending.set(id, { resolve, reject });
    worker.postMessage({ id, fn, args });
  });
}

function setStatus(text, kind) {
  const el = $('status');
  el.textContent = text;
  if (kind) el.dataset.kind = kind;
  else delete el.dataset.kind;
}

// ---- small SVG helpers ----------------------------------------------------

function el(name, attrs = {}, parent = null) {
  const node = document.createElementNS(SVG_NS, name);
  for (const [k, v] of Object.entries(attrs)) node.setAttribute(k, v);
  if (parent) parent.appendChild(node);
  return node;
}

function clear(node) {
  while (node.firstChild) node.removeChild(node.firstChild);
  return node;
}

const tooltip = $('tooltip');
function showTip(event, text) {
  tooltip.textContent = text;
  tooltip.dataset.show = 'true';
  const pad = 14;
  const box = tooltip.getBoundingClientRect();
  let x = event.clientX + pad;
  let y = event.clientY + pad;
  if (x + box.width > window.innerWidth - 8) x = event.clientX - box.width - pad;
  if (y + box.height > window.innerHeight - 8) y = event.clientY - box.height - pad;
  tooltip.style.left = `${Math.max(8, x)}px`;
  tooltip.style.top = `${Math.max(8, y)}px`;
}
function hideTip() { tooltip.dataset.show = 'false'; }
document.addEventListener('scroll', hideTip, true);

function hm(minute) {
  const m = ((minute % MINUTES) + MINUTES) % MINUTES;
  return `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;
}

function legendInto(node) {
  clear(node);
  for (const c of CATEGORIES) {
    const span = document.createElement('span');
    const swatch = document.createElement('i');
    swatch.style.background = `var(--${c.css})`;
    span.append(swatch, document.createTextNode(c.name));
    node.appendChild(span);
  }
}

// ---- day timeline ---------------------------------------------------------

function drawDay(svg, day, { height = 74, labels = true, axis = true } = {}) {
  const width = Math.max(320, svg.parentElement.clientWidth || 900);
  const padL = 0;
  const barTop = 0;
  const barH = height - (axis ? 20 : 0);
  clear(svg);
  svg.setAttribute('viewBox', `0 0 ${width} ${height}`);
  svg.setAttribute('width', width);
  svg.setAttribute('height', height);

  const x = (minute) => padL + (minute / MINUTES) * (width - padL);

  // Rounded outer ends: clip the whole bar rather than each segment.
  const clipId = `clip-${Math.random().toString(36).slice(2)}`;
  const clip = el('clipPath', { id: clipId }, svg);
  el('rect', { x: padL, y: barTop, width: width - padL, height: barH, rx: 4 }, clip);
  const group = el('g', { 'clip-path': `url(#${clipId})` }, svg);

  for (const s of day.segments) {
    const cat = BY_KEY[s.category];
    const x0 = x(s.start);
    const w = Math.max(1, x(s.end) - x0);
    const rect = el('rect', {
      x: x0, y: barTop, width: Math.max(1, w - 2), height: barH,
      fill: `var(--${cat.css})`,
    }, group);
    const detail = s.label ? `${s.activity} (${s.label})` : s.activity;
    const withWho = s.with_ids.length ? `\nwith ${s.with_ids.join(', ')}` : '';
    rect.addEventListener('pointermove', (e) =>
      showTip(e, `${s.text}  ${s.end - s.start} min\n${detail} — ${s.place}${withWho}`));
    rect.addEventListener('pointerleave', hideTip);

    if (labels && w > 52) {
      el('text', {
        x: x0 + 6, y: barTop + barH / 2 + 3.5,
        class: 'seg-label', fill: `var(--ink-${cat.css})`,
      }, group).textContent = s.label || s.activity;
    }
  }

  if (axis) {
    const step = width < 560 ? 6 : 3;             // labels collide on a phone at 3-hour ticks
    for (let h = 0; h <= 24; h += step) {
      const px = x(h * 60);
      el('line', { x1: px, y1: barTop + barH, x2: px, y2: barTop + barH + 4, class: 'grid' }, svg);
      const t = el('text', {
        x: Math.min(width - 2, Math.max(0, px)), y: height - 6, class: 'axis',
        'text-anchor': h === 0 ? 'start' : h === 24 ? 'end' : 'middle',
      }, svg);
      t.textContent = `${String(h % 24).padStart(2, '0')}:00`;
    }
  }
}

function renderDayPanel(day, week) {
  state.week_cache = week;
  const t = day.traits;
  const job = t.employed ? `works at workplace ${t.workplace}, ${t.commute_min} min away` : 'not employed';
  const mates = t.housemates.length ? `lives with ${t.housemates.join(', ')}` : 'lives alone';
  const habits = t.habits.length ? `; ${t.habits.join(', ')}` : '';
  $('person-line').innerHTML =
    `<b>person ${day.person}</b> — ${job}; ${mates}; sleeps about ` +
    `${(t.sleep_need_min / 60).toFixed(1)} h, usually to bed near ${t.bedtime}${habits}`;

  drawDay($('day-chart'), day);
  const asleep = day.minutes.S || 0;
  $('day-caption').textContent =
    `${day.day_name}, week ${day.week} — ${day.segments.length} segments, ${Math.round(asleep / 6) / 10} h asleep`;

  // week strip
  const strip = clear($('week-strip'));
  week.forEach((d, i) => {
    const fig = document.createElement('figure');
    fig.setAttribute('aria-current', String(i === state.day % 7));
    const lbl = document.createElement('div');
    lbl.className = 'lbl';
    lbl.textContent = DAY_NAMES[i];
    const holder = document.createElement('div');
    holder.className = 'chart';
    const svg = document.createElementNS(SVG_NS, 'svg');
    svg.setAttribute('role', 'img');
    svg.setAttribute('aria-label', `${DAY_NAMES[i]} for person ${day.person}`);
    holder.appendChild(svg);
    fig.append(lbl, holder);
    fig.addEventListener('click', () => { state.day = state.week * 7 + i; syncDayButtons(); loadDay(); });
    strip.appendChild(fig);
    drawDay(svg, d, { height: 34, labels: false, axis: false });
  });

  // table view — also the relief for the light-mode contrast warning
  const table = clear($('day-table'));
  table.innerHTML =
    '<thead><tr><th>from</th><th>to</th><th>min</th><th>activity</th><th>place</th><th>with</th></tr></thead>';
  const body = document.createElement('tbody');
  for (const s of day.segments) {
    const cat = BY_KEY[s.category];
    const tr = document.createElement('tr');
    const [from, to] = s.text.split('-');
    tr.innerHTML =
      `<td>${from}</td><td>${to}</td><td class="num">${s.end - s.start}</td>` +
      `<td><i class="swatch" style="background:var(--${cat.css})"></i>${s.activity}${s.label ? ' ' + s.label : ''}</td>` +
      `<td>${s.place}</td><td>${s.with_ids.join(', ') || '—'}</td>`;
    body.appendChild(tr);
  }
  table.appendChild(body);
}


function renderPersonDays(data) {
  if (!data) return;
  const svg = $('pdays-chart');
  const width = Math.max(360, svg.parentElement.clientWidth || 900);
  const padL = 52, padR = 8, padT = 6, padB = 24;
  const plotW = width - padL - padR;
  const rowH = 22, gap = 3;
  const plotH = CATEGORIES.length * rowH + (CATEGORIES.length - 1) * gap;
  const height = plotH + padT + padB;
  clear(svg);
  svg.setAttribute('viewBox', `0 0 ${width} ${height}`);
  svg.setAttribute('width', width);
  svg.setAttribute('height', height);

  const step = 4;                                  // 4-minute columns: 360 across the day
  for (let m = 0; m < MINUTES; m += step) {
    const x = padL + (m / MINUTES) * plotW;
    const w = (step / MINUTES) * plotW + 0.5;
    CATEGORIES.forEach((c, i) => {
      let acc = 0;
      for (let k = 0; k < step; k += 1) acc += data.rows[m + k].shares[c.key] || 0;
      const share = acc / step;
      if (share <= 0) return;
      el('rect', { x, y: padT + i * (rowH + gap), width: w, height: rowH,
                   fill: `var(--${c.css})`, opacity: share.toFixed(3),
                   'shape-rendering': 'crispEdges' }, svg);
    });
  }
  CATEGORIES.forEach((c, i) => {
    const t = el('text', { x: padL - 7, y: padT + i * (rowH + gap) + rowH / 2 + 4,
                           class: 'axis', 'text-anchor': 'end' }, svg);
    t.textContent = c.name;
  });
  for (let h = 0; h <= 24; h += 3) {
    const px = padL + (h / 24) * plotW;
    const t = el('text', { x: Math.min(width - padR, px), y: height - 7, class: 'axis',
                           'text-anchor': h === 0 ? 'start' : h === 24 ? 'end' : 'middle' }, svg);
    t.textContent = String(h % 24).padStart(2, '0');
  }
  $('pdays-note').textContent =
    `Person ${data.person} across ${data.days} ${data.kind}. Full colour means every one of those ` +
    `days; a faded band means only some. Each day is worth ${(100 / data.days).toFixed(0)} %, so ` +
    `more weeks give a finer gradient.`;
}


// ---- one line per day -----------------------------------------------------

function renderDaily(data) {
  if (!data) return;
  const svg = $('daily-chart');
  const width = Math.max(360, svg.parentElement.clientWidth || 900);
  const shown = state.dailyCat === 'all' ? CATEGORIES : CATEGORIES.filter((c) => c.key === state.dailyCat);
  const padL = 66, padR = 10, padT = 8, padB = 26;   // room for the activity name and its scale
  const panelH = shown.length === 1 ? 240 : 66;
  const gap = 16;
  const plotW = width - padL - padR;
  const height = padT + shown.length * panelH + (shown.length - 1) * gap + padB;
  clear(svg);
  svg.setAttribute('viewBox', `0 0 ${width} ${height}`);
  svg.setAttribute('width', width);
  svg.setAttribute('height', height);

  const nb = data.curves.length ? data.curves[0].shares.S.length : 0;
  const x = (b) => padL + ((b + 0.5) / nb) * plotW;

  // Small multiples, one fan per activity. Un-stacked on purpose: on a stacked chart a boundary
  // carries the cumulative spread of everything beneath it, and the top boundary is pinned at
  // 100 %, so the bands there are not each category's own variation. Here they are.
  shown.forEach((c, i) => {
    const top = padT + i * (panelH + gap);
    const series = [];
    for (let b = 0; b < nb; b += 1) {
      const vals = data.curves.map((d) => d.shares[c.key][b] || 0).sort((u, v) => u - v);
      series.push({
        min: vals[0], p10: quantile(vals, 0.1), p25: quantile(vals, 0.25),
        med: quantile(vals, 0.5),
        p75: quantile(vals, 0.75), p90: quantile(vals, 0.9), max: vals[vals.length - 1],
      });
    }
    const peak = Math.max(1e-6, ...series.map((v) => v.max));
    const scale = Math.min(1, Math.ceil(peak * 20) / 20);
    const y = (v) => top + panelH - (v / scale) * panelH;

    el('line', { x1: padL, y1: top + panelH, x2: width - padR, y2: top + panelH, class: 'grid' }, svg);
    // Nested intervals in one hue, lightest outermost: the standard fan.
    for (const [lo, hi, op] of [['min', 'max', 0.14], ['p10', 'p90', 0.28], ['p25', 'p75', 0.45]]) {
      const up = [], dn = [];
      for (let b = 0; b < nb; b += 1) {
        up.push(`${x(b).toFixed(1)},${y(series[b][hi]).toFixed(1)}`);
        dn.push(`${x(b).toFixed(1)},${y(series[b][lo]).toFixed(1)}`);
      }
      el('polygon', { points: up.concat(dn.reverse()).join(' '),
                      fill: `var(--${c.css})`, 'fill-opacity': op }, svg);
    }
    el('polyline', {
      points: series.map((v, b) => `${x(b).toFixed(1)},${y(v.med).toFixed(1)}`).join(' '),
      fill: 'none', stroke: `var(--${c.css})`, 'stroke-width': 1.6, 'stroke-linejoin': 'round',
    }, svg);

    const name = el('text', { x: padL - 8, y: top + 11, class: 'axis', 'text-anchor': 'end' }, svg);
    name.textContent = c.name;
    const top_lbl = el('text', { x: padL - 8, y: top + panelH, class: 'axis', 'text-anchor': 'end' }, svg);
    top_lbl.textContent = '0';
    const max_lbl = el('text', { x: padL - 8, y: top + 24, class: 'axis', 'text-anchor': 'end' }, svg);
    max_lbl.textContent = `${Math.round(scale * 100)}%`;
  });

  const base = padT + shown.length * panelH + (shown.length - 1) * gap;
  for (let h = 0; h <= 24; h += 3) {
    const px = padL + (h / 24) * plotW;
    const t = el('text', { x: Math.min(width - padR, px), y: base + 16, class: 'axis',
                           'text-anchor': h === 0 ? 'start' : h === 24 ? 'end' : 'middle' }, svg);
    t.textContent = String(h % 24).padStart(2, '0');
  }

  $('daily-note').textContent =
    `${data.curves.length} weekdays, ${data.people} people. Median line, then the middle 50 %, ` +
    `the middle 80 % and the full range across days. Each panel is scaled to its own peak ` +
    `(marked at the left), so read the band widths within a panel, not between them.`;
}

// ---- population -----------------------------------------------------------

function aggregate(rows, binMinutes, sourceBin) {
  const per = Math.max(1, Math.round(binMinutes / sourceBin));
  const out = [];
  for (let i = 0; i < rows.length; i += per) {
    const group = rows.slice(i, i + per);
    const minutes = {};
    let total = 0;
    for (const r of group) {
      for (const c of CATEGORIES) {
        const v = r.minutes[c.key] || 0;
        minutes[c.key] = (minutes[c.key] || 0) + v;
        total += v;
      }
    }
    const shares = {};
    for (const c of CATEGORIES) shares[c.key] = total ? minutes[c.key] / total : 0;
    out.push({ minute: group[0].minute, shares, minutes });
  }
  return out;
}




function smooth(series, windowBins) {
  // A centred moving average over the quantile curves. Named plainly because that is what it is:
  // the formal version of this is quantile regression on a spline basis, which estimates a smooth
  // quantile directly instead of smoothing a noisy point estimate. Window is kept well under the
  // width of the meal peaks, which are signal, not noise.
  if (windowBins <= 1) return series;
  const half = Math.floor(windowBins / 2);
  return series.map((_, i) => {
    let sum = 0, n = 0;
    for (let j = Math.max(0, i - half); j <= Math.min(series.length - 1, i + half); j += 1) {
      sum += series[j]; n += 1;
    }
    return sum / n;
  });
}

function quantile(sorted, q) {
  if (!sorted.length) return 0;
  const i = (sorted.length - 1) * q;
  const lo = Math.floor(i), hi = Math.ceil(i);
  return lo === hi ? sorted[lo] : sorted[lo] + (sorted[hi] - sorted[lo]) * (i - lo);
}

// For every bin, the cumulative stack boundary of each day, sorted. Boundary k is the top of
// category k, so the band between boundary k-1 and k is that category's share.
function boundaryStats(data, loQ, hiQ) {
  const nb = data.curves.length ? data.curves[0].shares.S.length : 0;
  const out = [];
  for (let b = 0; b < nb; b += 1) {
    const levels = [];
    for (let k = 0; k < CATEGORIES.length; k += 1) {
      const vals = data.curves.map((d) => {
        let acc = 0;
        for (let j = 0; j <= k; j += 1) acc += d.shares[CATEGORIES[j].key][b] || 0;
        return acc;
      }).sort((x, y) => x - y);
      levels.push({ med: quantile(vals, 0.5), lo: quantile(vals, loQ), hi: quantile(vals, hiQ) });
    }
    out.push(levels);
  }
  return out;
}

function renderStackedBands(svg, data, geom) {
  const { width, height, padL, padR, padT, padB, plotW, plotH } = geom;
  const [loQ, hiQ] = state.bandRange === 'full' ? [0, 1] : [0.1, 0.9];
  const stats = boundaryStats(data, loQ, hiQ);
  const nb = stats.length;
  const win = state.bandSmooth ? Math.max(1, Math.round(15 / data.bin_minutes)) : 1;
  const x = (b) => padL + ((b + 0.5) / nb) * plotW;
  const y = (v) => padT + plotH - v * plotH;
  const col = (k, f) => smooth(stats.map((s) => s[k][f]), win);
  const path = (vals) => vals.map((v, b) => `${x(b).toFixed(1)},${y(v).toFixed(1)}`).join(' ');

  const med = CATEGORIES.map((_, k) => col(k, 'med'));
  for (let k = 0; k < CATEGORIES.length; k += 1) {
    const top = path(med[k]).split(' ');
    const bottom = (k === 0 ? med[k].map(() => 0) : med[k - 1]).map((v, b) =>
      `${x(b).toFixed(1)},${y(v).toFixed(1)}`);
    el('polygon', { points: top.concat(bottom.reverse()).join(' '),
                    fill: `var(--${CATEGORIES[k].css})` }, svg);
  }
  // The envelope: a thin quantile curve on each boundary rather than a soft fill, so the eye has
  // an edge to follow. The top boundary is 100 % by construction and carries no envelope.
  for (let k = 0; k < CATEGORIES.length - 1; k += 1) {
    const lo = col(k, 'lo'), hi = col(k, 'hi');
    el('polygon', { points: path(hi).split(' ').concat(path(lo).split(' ').reverse()).join(' '),
                    fill: 'var(--text-primary)', 'fill-opacity': 0.07 }, svg);
    // Only the two envelope curves: the median is already the edge of the solid region, and
    // drawing a line on it as well is ink for something the reader can see.
    for (const vals of [lo, hi]) {
      el('polyline', { points: path(vals), fill: 'none', stroke: 'var(--text-primary)',
                       'stroke-width': 0.9, 'stroke-opacity': 0.32 }, svg);
    }
  }

  for (let pct = 0; pct <= 100; pct += 25) {
    const t = el('text', { x: padL - 7, y: y(pct / 100) + 3.5, class: 'axis', 'text-anchor': 'end' }, svg);
    t.textContent = `${pct}%`;
  }
  for (let h = 0; h <= 24; h += 3) {
    const px = padL + (h / 24) * plotW;
    const t = el('text', { x: Math.min(width - padR, px), y: height - 8, class: 'axis',
                           'text-anchor': h === 0 ? 'start' : h === 24 ? 'end' : 'middle' }, svg);
    t.textContent = String(h % 24).padStart(2, '0');
  }
  const span = state.bandRange === 'full' ? 'the full range' : 'the 10th to 90th percentile';
  $('pop-note').textContent =
    `${data.curves.length} weekdays, ${data.people} people. Heavy line: the median cumulative ` +
    `boundary. Thin lines: ${span} of that boundary across days, pointwise` +
    (state.bandSmooth ? ', smoothed with a 15-minute moving average — shorter than the meal peaks, which are signal' : '') +
    `. These are boundary levels, so a band's own spread is in the panels below.`;
  renderBandTable(data, stats, loQ, hiQ);
}

function renderBandTable(data, stats, loQ, hiQ) {
  const table = clear($('pop-table'));
  const lo = Math.round(loQ * 100), hi = Math.round(hiQ * 100);
  table.innerHTML = '<thead><tr><th>from</th>' +
    CATEGORIES.map((c) => `<th>${c.name} med</th><th>p${lo}</th><th>p${hi}</th>`).join('') +
    '</tr></thead>';
  const body = document.createElement('tbody');
  const step = Math.max(1, Math.round(15 / data.bin_minutes));
  for (let b = 0; b < stats.length; b += step) {
    const tr = document.createElement('tr');
    const cells = CATEGORIES.map((c, k) => {
      const vals = data.curves.map((d) => d.shares[c.key][b] || 0).sort((x, y) => x - y);
      return `<td class="num">${(quantile(vals, 0.5) * 100).toFixed(1)}</td>` +
             `<td class="num">${(quantile(vals, loQ) * 100).toFixed(1)}</td>` +
             `<td class="num">${(quantile(vals, hiQ) * 100).toFixed(1)}</td>`;
    }).join('');
    tr.innerHTML = `<td>${hm(b * data.bin_minutes)}</td>${cells}`;
    body.appendChild(tr);
  }
  table.appendChild(body);
}

function renderStackedDays(svg, data, geom) {
  const { width, height, padL, padR, padT, padB, plotW, plotH } = geom;
  const nb = data.curves.length ? data.curves[0].shares.S.length : 0;
  // One stack per day, laid over the others. Where every day puts a boundary in the same place the
  // colour reaches full strength; where they disagree the layers only partly cover, so the band
  // fades out over the range the days actually span.
  const alpha = Math.max(0.06, Math.min(0.3, 3 / Math.max(1, data.curves.length)));
  for (const d of data.curves) {
    let lower = new Array(nb).fill(0);
    for (const c of CATEGORIES) {
      const upper = lower.map((v, b) => v + (d.shares[c.key][b] || 0));
      const top = [];
      const bottom = [];
      for (let b = 0; b < nb; b += 1) {
        const x = (padL + ((b + 0.5) / nb) * plotW).toFixed(1);
        top.push(`${x},${(padT + plotH - upper[b] * plotH).toFixed(1)}`);
        bottom.push(`${x},${(padT + plotH - lower[b] * plotH).toFixed(1)}`);
      }
      el('polygon', {
        points: top.concat(bottom.reverse()).join(' '),
        fill: `var(--${c.css})`, 'fill-opacity': alpha.toFixed(3),
      }, svg);
      lower = upper;
    }
  }
  for (let pct = 0; pct <= 100; pct += 25) {                    // labels only: a rule drawn over
    const y = padT + plotH - (pct / 100) * plotH;              // the fills would hide the fading
    const t = el('text', { x: padL - 7, y: y + 3.5, class: 'axis', 'text-anchor': 'end' }, svg);
    t.textContent = `${pct}%`;
  }
  for (let h = 0; h <= 24; h += 3) {
    const px = padL + (h / 24) * plotW;
    const t = el('text', { x: Math.min(width - padR, px), y: height - 8, class: 'axis',
                           'text-anchor': h === 0 ? 'start' : h === 24 ? 'end' : 'middle' }, svg);
    t.textContent = String(h % 24).padStart(2, '0');
  }
  $('pop-note').textContent =
    `${data.curves.length} weekdays, ${data.people} people, one stack drawn per day. A band that ` +
    `fades is one whose boundary lands somewhere different each day.`;
}

function renderPopulation(data) {
  const svg = $('pop-chart');
  const width = Math.max(360, svg.parentElement.clientWidth || 900);
  const height = 320;
  const padL = 38, padR = 8, padT = 8, padB = 26;
  const plotW = width - padL - padR;
  const plotH = height - padT - padB;
  clear(svg);
  svg.setAttribute('viewBox', `0 0 ${width} ${height}`);
  svg.setAttribute('width', width);
  svg.setAttribute('height', height);

  if (state.stackMode !== 'pooled' && dailyCache) {
    const geom = { width, height, padL, padR, padT, padB, plotW, plotH };
    if (state.stackMode === 'days') renderStackedDays(svg, dailyCache, geom);
    else renderStackedBands(svg, dailyCache, geom);
    return;
  }

  const bins = aggregate(data.rows, state.bin, data.bin_minutes);
  const colW = plotW / bins.length;

  for (let pct = 0; pct <= 100; pct += 25) {
    const y = padT + plotH - (pct / 100) * plotH;
    el('line', { x1: padL, y1: y, x2: width - padR, y2: y, class: 'grid' }, svg);
    const t = el('text', { x: padL - 7, y: y + 3.5, class: 'axis', 'text-anchor': 'end' }, svg);
    t.textContent = `${pct}%`;
  }

  bins.forEach((row) => {
    const x0 = padL + (row.minute / MINUTES) * plotW;
    let acc = 0;
    for (const c of CATEGORIES) {
      const share = row.shares[c.key] || 0;
      if (share <= 0) continue;
      const h = share * plotH;
      const y = padT + plotH - (acc + share) * plotH;
      // Contiguous: a surface gap between fills is a bar-chart convention and here it draws a
      // white grid over the very detail this chart exists to show.
      el('rect', {
        x: x0, y, width: colW + 0.5, height: Math.max(0.5, h),
        fill: `var(--${c.css})`, 'shape-rendering': 'crispEdges',
      }, svg);
      acc += share;
    }
    const hit = el('rect', { x: x0, y: padT, width: colW, height: plotH, fill: 'transparent' }, svg);
    const lines = CATEGORIES
      .filter((c) => (row.shares[c.key] || 0) >= 0.005)
      .sort((a, b) => row.shares[b.key] - row.shares[a.key])
      .map((c) => `${c.name.padEnd(8)} ${(row.shares[c.key] * 100).toFixed(1)}%`);
    hit.addEventListener('pointermove', (e) =>
      showTip(e, `${hm(row.minute)}-${hm(row.minute + state.bin)}\n${lines.join('\n')}`));
    hit.addEventListener('pointerleave', hideTip);
  });

  for (let h = 0; h <= 24; h += 3) {
    const px = padL + (h / 24) * plotW;
    const t = el('text', {
      x: Math.min(width - padR, px), y: height - 8, class: 'axis',
      'text-anchor': h === 0 ? 'start' : h === 24 ? 'end' : 'middle',
    }, svg);
    t.textContent = String(h % 24).padStart(2, '0');
  }

  const dayWord = { Mon: 'Monday', Tue: 'Tuesday', Wed: 'Wednesday', Thu: 'Thursday',
                    Fri: 'Friday', Sat: 'Saturday', Sun: 'Sunday' }[data.day_name];
  $('pop-note').textContent =
    `${dayWord}${data.days > 1 ? ` of ${data.days} weeks` : ''} · ${data.people} people · ` +
    `${data.person_days} person-days · ${state.bin}-minute bins`;

  const table = clear($('pop-table'));
  table.innerHTML =
    '<thead><tr><th>from</th>' + CATEGORIES.map((c) => `<th>${c.name}</th>`).join('') + '</tr></thead>';
  const body = document.createElement('tbody');
  for (const row of bins) {
    const tr = document.createElement('tr');
    tr.innerHTML = `<td>${hm(row.minute)}</td>` +
      CATEGORIES.map((c) => `<td class="num">${((row.shares[c.key] || 0) * 100).toFixed(1)}%</td>`).join('');
    body.appendChild(tr);
  }
  table.appendChild(body);
}


// ---- every day, stacked ---------------------------------------------------

function renderCarpet(data) {
  if (!data) return;
  const svg = $('carpet-chart');
  const width = Math.max(360, svg.parentElement.clientWidth || 900);
  const padL = 38, padR = 8, padT = 6, padB = 24;
  const plotW = width - padL - padR;
  const rowH = Math.max(1, Math.min(4, Math.floor(420 / data.rows.length)));
  const plotH = rowH * data.rows.length;
  const height = plotH + padT + padB;
  clear(svg);
  svg.setAttribute('viewBox', `0 0 ${width} ${height}`);
  svg.setAttribute('width', width);
  svg.setAttribute('height', height);

  const order = state.carpetSort === 'wake' ? data.by_wake : data.rows.map((_, i) => i);
  order.forEach((rowIndex, y) => {
    for (const [start, end, cat] of data.rows[rowIndex]) {
      const c = BY_KEY[cat];
      if (!c) continue;
      const x0 = padL + (start / MINUTES) * plotW;
      const x1 = padL + (end / MINUTES) * plotW;
      el('rect', {
        x: x0, y: padT + y * rowH, width: Math.max(0.4, x1 - x0), height: rowH,
        fill: `var(--${c.css})`, 'shape-rendering': 'crispEdges',
      }, svg);
    }
  });

  for (let h = 0; h <= 24; h += 3) {
    const px = padL + (h / 24) * plotW;
    el('line', { x1: px, y1: padT, x2: px, y2: padT + plotH, class: 'grid', opacity: 0.25 }, svg);
    const t = el('text', {
      x: Math.min(width - padR, px), y: height - 7, class: 'axis',
      'text-anchor': h === 0 ? 'start' : h === 24 ? 'end' : 'middle',
    }, svg);
    t.textContent = String(h % 24).padStart(2, '0');
  }
  const lbl = el('text', { x: padL - 7, y: padT + 9, class: 'axis', 'text-anchor': 'end' }, svg);
  lbl.textContent = '1';
  const lbl2 = el('text', { x: padL - 7, y: padT + plotH, class: 'axis', 'text-anchor': 'end' }, svg);
  lbl2.textContent = String(data.rows.length);

  $('carpet-note').textContent =
    `${data.shown} of ${data.available} person-days on ${data.day_name}` +
    (state.carpetSort === 'wake' ? ', sorted by when they woke' : ', in person order');
}


// ---- two other ways to draw the same shares -------------------------------

function rgbOf(cssVar) {
  const probe = document.createElement('span');
  probe.style.color = `var(--${cssVar})`;
  document.body.appendChild(probe);
  const m = getComputedStyle(probe).color.match(/\d+/g).map(Number);
  probe.remove();
  return m;
}

function renderBlend(data) {
  if (!data) return;
  const svg = $('blend-chart');
  const width = Math.max(360, svg.parentElement.clientWidth || 900);
  const padL = 38, padR = 8, padT = 6, padB = 24;
  const plotW = width - padL - padR;
  const rowH = 26, gap = 3;
  const rows = state.blendMode === 'mix' ? 1 : CATEGORIES.length;
  const plotH = rows * rowH + (rows - 1) * gap;
  const height = plotH + padT + padB;
  clear(svg);
  svg.setAttribute('viewBox', `0 0 ${width} ${height}`);
  svg.setAttribute('width', width);
  svg.setAttribute('height', height);

  const rgb = Object.fromEntries(CATEGORIES.map((c) => [c.key, rgbOf(c.css)]));
  const surface = rgbOf('surface-1');
  const bins = aggregate(data.rows, state.bin, data.bin_minutes);
  const colW = plotW / bins.length;

  bins.forEach((row) => {
    const x = padL + (row.minute / MINUTES) * plotW;
    if (state.blendMode === 'mix') {
      // Every column is the mixture of what the population is doing at that minute, so a
      // transition is a colour sliding into another rather than a line between two bands.
      let r = 0, g = 0, b = 0;
      for (const c of CATEGORIES) {
        const w = row.shares[c.key] || 0;
        r += w * rgb[c.key][0]; g += w * rgb[c.key][1]; b += w * rgb[c.key][2];
      }
      el('rect', { x, y: padT, width: colW + 0.5, height: rowH,
                   fill: `rgb(${Math.round(r)} ${Math.round(g)} ${Math.round(b)})`,
                   'shape-rendering': 'crispEdges' }, svg);
    } else {
      CATEGORIES.forEach((c, i) => {
        const share = row.shares[c.key] || 0;
        // Opacity carries the share: one hue per row, more people = stronger.
        el('rect', { x, y: padT + i * (rowH + gap), width: colW + 0.5, height: rowH,
                     fill: `var(--${c.css})`, opacity: Math.min(1, share * 1.6).toFixed(3),
                     'shape-rendering': 'crispEdges' }, svg);
      });
    }
  });

  if (state.blendMode !== 'mix') {
    CATEGORIES.forEach((c, i) => {
      const t = el('text', { x: padL - 7, y: padT + i * (rowH + gap) + rowH / 2 + 4,
                             class: 'axis', 'text-anchor': 'end' }, svg);
      t.textContent = c.name;
    });
  }
  for (let h = 0; h <= 24; h += 3) {
    const px = padL + (h / 24) * plotW;
    const t = el('text', { x: Math.min(width - padR, px), y: height - 7, class: 'axis',
                           'text-anchor': h === 0 ? 'start' : h === 24 ? 'end' : 'middle' }, svg);
    t.textContent = String(h % 24).padStart(2, '0');
  }
  $('blend-note').textContent = state.blendMode === 'mix'
    ? 'One strip: each column is every activity mixed in proportion, so nothing has an edge.'
    : 'One row per activity: stronger colour means more of the population doing it.';
}

// ---- agents ---------------------------------------------------------------

function card(title, rows, big) {
  const div = document.createElement('div');
  div.className = 'card';
  const h = document.createElement('h3');
  h.textContent = title;
  div.appendChild(h);
  if (big) {
    const b = document.createElement('div');
    b.className = 'big';
    b.textContent = big;
    div.appendChild(b);
  }
  const dl = document.createElement('dl');
  for (const [k, v] of rows) {
    const dt = document.createElement('dt');
    dt.textContent = k;
    const dd = document.createElement('dd');
    dd.textContent = v;
    dl.append(dt, dd);
  }
  div.appendChild(dl);
  return div;
}

function agentMinute() {
  return Number($('a-day').value) * MINUTES + Number($('a-time').value);
}

async function doObserve() {
  const person = Number($('a-person').value);
  setStatus('observing…');
  const o = await call('observe', person, agentMinute());
  const cards = clear($('a-cards'));
  cards.appendChild(card('Observation', [
    ['at', `${o.at.day} ${o.at.time}`],
    ['doing', o.activity],
    ['place', o.place],
    ['since', `${o.since.day} ${o.since.time}`],
    ['until', `${o.expected_end.day} ${o.expected_end.time}`],
    ['interruptible', o.interruptible.toFixed(2)],
    ['with', o.with_ids.join(', ') || '—'],
    ['next commitment', o.next_commitment ? `${o.next_commitment.day} ${o.next_commitment.time}` : '—'],
  ]));
  cards.appendChild(card('Free slots offered', o.offers.length
    ? o.offers.map((s, i) => [`offer ${i + 1}`, `${s.start.day} ${s.start.time}-${s.end.time} ${s.place}`])
    : [['none', 'nothing fits in the next day']]));
  state.lastOffer = o.offers[0] || null;
  setStatus('');
}

async function doAsk() {
  const person = Number($('a-person').value);
  setStatus('asking…');
  const r = await call('ask', person, agentMinute());
  const cards = clear($('a-cards'));
  if (r.ignored) {
    cards.appendChild(card('Question', [['asked', `${r.asked_at.day} ${r.asked_at.time}`],
      ['result', 'ignored — too many pings from this agent']], 'no reply'));
  } else if (r.no_reply) {
    cards.appendChild(card('Question', [['asked', `${r.asked_at.day} ${r.asked_at.time}`]], 'no reply in a day'));
  } else {
    cards.appendChild(card('Question', [
      ['asked', `${r.asked_at.day} ${r.asked_at.time}`],
      ['they were', r.was_doing],
      ['interruptible', r.interruptible.toFixed(2)],
      ['replied', `${r.replied_at.day} ${r.replied_at.time}`],
      ['decision', r.decision],
    ], `waited ${r.waited_min} min`));
  }
  setStatus('');
}

async function doInvite() {
  const person = Number($('a-person').value);
  const minute = agentMinute();
  setStatus('inviting…');
  const o = await call('observe', person, minute);
  if (!o.offers.length) {
    clear($('a-cards')).appendChild(card('Invite', [['result', 'no free slot to offer']], '—'));
    setStatus('');
    return;
  }
  const slot = o.offers[0];
  const r = await call('invite', person, minute, slot.start.minute, slot.end.minute, slot.place);
  const rows = [
    ['asked', `${r.asked_at.day} ${r.asked_at.time}`],
    ['slot', `${slot.start.day} ${slot.start.time}-${slot.end.time} ${slot.place}`],
  ];
  if (r.ignored) {
    clear($('a-cards')).appendChild(card('Invite', rows.concat([['result', 'ignored']]), 'no reply'));
  } else if (r.no_reply) {
    clear($('a-cards')).appendChild(card('Invite', rows, 'no reply in a day'));
  } else {
    rows.push(['replied', `${r.replied_at.day} ${r.replied_at.time}`], ['waited', `${r.waited_min} min`]);
    if (r.reason) rows.push(['reason', r.reason]);
    if (r.counter) rows.push(['counter', `${r.counter.start.day} ${r.counter.start.time}-${r.counter.end.time}`]);
    clear($('a-cards')).appendChild(card('Invite', rows, r.decision));
  }
  setStatus('');
}

async function doSwarm() {
  $('a-swarm-out').textContent = 'running…';
  const lines = await call('swarm');
  $('a-swarm-out').textContent = lines.join('\n');
}

// ---- checks ---------------------------------------------------------------

async function runChecks() {
  const people = Number($('c-people').value);
  const weeks = Number($('c-weeks').value);
  $('c-status').textContent = `running ${people} people over ${weeks} week${weeks > 1 ? 's' : ''}…`;
  $('c-run').disabled = true;
  try {
    const rows = await call('checks', Number($('seed').value), people, weeks);
    const passed = rows.filter((r) => r.ok).length;
    $('c-status').textContent = `${passed}/${rows.length} pass`;
    const table = clear($('c-table'));
    table.innerHTML =
      '<thead><tr><th>result</th><th>check</th><th>value</th><th>range</th></tr></thead>';
    const body = document.createElement('tbody');
    for (const r of rows) {
      const tr = document.createElement('tr');
      tr.innerHTML =
        `<td class="${r.ok ? 'ok' : 'fail'}">${r.ok ? '✓ ok' : '✗ FAIL'}</td>` +
        `<td>${r.name}</td><td class="num">${r.value_text}</td>` +
        `<td class="num">${r.lo_text} … ${r.hi_text}</td>`;
      body.appendChild(tr);
    }
    table.appendChild(body);
  } finally {
    $('c-run').disabled = false;
  }
}

// ---- wiring ---------------------------------------------------------------

function syncDayButtons() {
  for (const b of $('daybtns').children) {
    b.setAttribute('aria-pressed', String(Number(b.dataset.day) === state.day % 7));
  }
}

async function loadDay() {
  const person = Math.min(Math.max(1, Number($('person').value) || 1), state.built.people);
  $('person').value = person;
  state.person = person;
  const [day, week, stacked] = await Promise.all([
    call('day', person, state.day),
    call('week', person, state.week),
    call('person_days', person, true),
  ]);
  renderDayPanel(day, week);
  renderPersonDays(stacked);
}

let popCache = null;
let carpetCache = null;
let dailyCache = null;
async function loadPopulation({ refetch = true } = {}) {
  if (refetch || !popCache) {
    setStatus('counting…');
    popCache = await call('histogram', state.popDay);
    carpetCache = await call('carpet', state.popDay, 400);
    dailyCache = await call('daily_curves', 'weekdays');
    setStatus('');
  }
  renderPopulation(popCache);
  renderCarpet(carpetCache);
  renderBlend(popCache);
  renderDaily(dailyCache);
}

async function build() {
  const seed = Number($('seed').value);
  const people = Number($('people').value);
  const weeks = Number($('weeks').value);
  $('run').disabled = true;
  setStatus(`running ${people} people for ${weeks} week${weeks > 1 ? 's' : ''}…`);
  try {
    state.built = await call('build', seed, people, weeks);
    state.week = Math.min(state.week, weeks - 1);
    state.day = Math.min(state.day, weeks * 7 - 1);
    $('person').max = people;
    $('a-person').max = people;

    const wp = clear($('weekpick'));
    for (let w = 0; w < weeks; w += 1) {
      const opt = document.createElement('option');
      opt.value = String(w);
      opt.textContent = `week ${w + 1}`;
      wp.appendChild(opt);
    }
    wp.value = String(state.week);

    const ad = clear($('a-day'));
    for (let d = 0; d < weeks * 7; d += 1) {
      const opt = document.createElement('option');
      opt.value = String(d);
      opt.textContent = `${DAY_NAMES[d % 7]}${weeks > 1 ? ` w${Math.floor(d / 7) + 1}` : ''}`;
      ad.appendChild(opt);
    }
    ad.value = String(Math.min(1, weeks * 7 - 1));

    setStatus(`${state.built.people} people · ${state.built.employed} employed · ` +
      `${state.built.households} households · ${state.built.workplaces} workplaces · ${state.built.days} days`);
    await loadDay();
    if (!$('panel-population').hidden) await loadPopulation();
  } catch (error) {
    setStatus(error.message, 'error');
  } finally {
    $('run').disabled = false;
  }
}

function initTabs() {
  const tabs = [...document.querySelectorAll('[role="tab"]')];
  for (const tab of tabs) {
    tab.addEventListener('click', async () => {
      for (const other of tabs) {
        const on = other === tab;
        other.setAttribute('aria-selected', String(on));
        $(other.getAttribute('aria-controls')).hidden = !on;
      }
      if (tab.id === 'tab-population' && state.built) await loadPopulation();
      if (tab.id === 'tab-day' && state.built) await loadDay();
    });
  }
}

function initDayButtons() {
  const holder = $('daybtns');
  DAY_NAMES.forEach((name, i) => {
    const b = document.createElement('button');
    b.type = 'button';
    b.dataset.day = String(i);
    b.textContent = name;
    b.addEventListener('click', () => {
      state.day = state.week * 7 + i;
      syncDayButtons();
      loadDay();
    });
    holder.appendChild(b);
  });
  syncDayButtons();
}

function initTimes() {
  const sel = $('a-time');
  for (let h = 0; h < 24; h += 1) {
    const opt = document.createElement('option');
    opt.value = String(h * 60);
    opt.textContent = `${String(h).padStart(2, '0')}:00`;
    sel.appendChild(opt);
  }
  sel.value = String(9 * 60);
}

function init() {
  legendInto($('legend-day'));
  legendInto($('legend-pop'));
  initTabs();
  initDayButtons();
  initTimes();

  $('run').addEventListener('click', build);
  $('person').addEventListener('change', loadDay);
  $('person-prev').addEventListener('click', () => {
    $('person').value = Math.max(1, state.person - 1);
    loadDay();
  });
  $('person-next').addEventListener('click', () => {
    $('person').value = Math.min(state.built.people, state.person + 1);
    loadDay();
  });
  $('weekpick').addEventListener('change', (e) => {
    state.week = Number(e.target.value);
    state.day = state.week * 7 + (state.day % 7);
    loadDay();
  });
  DAY_NAMES.forEach((name) => {
    const b = document.createElement('button');
    b.type = 'button';
    b.textContent = name;
    b.setAttribute('aria-pressed', String(name === state.popDay));
    b.addEventListener('click', () => {
      state.popDay = name;
      popCache = null;
      carpetCache = null;
      dailyCache = null;
      for (const other of $('daytype').children) {
        other.setAttribute('aria-pressed', String(other === b));
      }
      loadPopulation();
    });
    $('daytype').appendChild(b);
  });
  for (const b of $('stackmode').children) {
    b.addEventListener('click', () => {
      state.stackMode = b.dataset.stack;
      for (const other of $('stackmode').children) {
        other.setAttribute('aria-pressed', String(other === b));
      }
      $('binsize').hidden = state.stackMode !== 'pooled';
      $('bandrange').hidden = state.stackMode !== 'bands';
      $('bandsmooth').hidden = state.stackMode !== 'bands';
      renderPopulation(popCache);
    });
  }
  $('bandsmooth').addEventListener('click', () => {
    state.bandSmooth = !state.bandSmooth;
    $('bandsmooth').setAttribute('aria-pressed', String(state.bandSmooth));
    renderPopulation(popCache);
  });
  for (const b of $('bandrange').children) {
    b.addEventListener('click', () => {
      state.bandRange = b.dataset.range;
      for (const other of $('bandrange').children) {
        other.setAttribute('aria-pressed', String(other === b));
      }
      renderPopulation(popCache);
    });
  }
  for (const b of $('dailycat').children) {
    b.addEventListener('click', () => {
      state.dailyCat = b.dataset.cat;
      for (const other of $('dailycat').children) {
        other.setAttribute('aria-pressed', String(other === b));
      }
      renderDaily(dailyCache);
    });
  }
  for (const b of $('blendmode').children) {
    b.addEventListener('click', () => {
      state.blendMode = b.dataset.mode;
      for (const other of $('blendmode').children) {
        other.setAttribute('aria-pressed', String(other === b));
      }
      renderBlend(popCache);
    });
  }
  for (const b of $('carpetsort').children) {
    b.addEventListener('click', () => {
      state.carpetSort = b.dataset.sort;
      for (const other of $('carpetsort').children) {
        other.setAttribute('aria-pressed', String(other === b));
      }
      renderCarpet(carpetCache);
    });
  }
  for (const b of $('binsize').children) {
    b.addEventListener('click', () => {
      state.bin = Number(b.dataset.bin);
      for (const other of $('binsize').children) {
        other.setAttribute('aria-pressed', String(other === b));
      }
      loadPopulation({ refetch: false });
    });
  }
  $('a-observe').addEventListener('click', () => doObserve().catch((e) => setStatus(e.message, 'error')));
  $('a-ask').addEventListener('click', () => doAsk().catch((e) => setStatus(e.message, 'error')));
  $('a-invite').addEventListener('click', () => doInvite().catch((e) => setStatus(e.message, 'error')));
  $('a-swarm').addEventListener('click', () => doSwarm().catch((e) => setStatus(e.message, 'error')));
  $('c-run').addEventListener('click', () => runChecks().catch((e) => {
    $('c-status').textContent = e.message;
  }));

  let resizeTimer = null;
  window.addEventListener('resize', () => {
    clearTimeout(resizeTimer);
    resizeTimer = setTimeout(() => {
      if (!state.built) return;
      if (!$('panel-day').hidden) loadDay();
      if (!$('panel-population').hidden) loadPopulation();
    }, 180);
  });

  build();
}

init();
