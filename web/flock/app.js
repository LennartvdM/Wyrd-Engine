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
  bin: 15,
  spread: null,          // set by initSpread: URL first, then localStorage, then the defaults
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

function renderDaily() {
  if (!spreadData) return;
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

  const res = resolveSpread(spreadData.n);
  const nb = spreadData.nb;
  const x = (b) => padL + ((b + 0.5) / nb) * plotW;
  const sp = state.spread;
  // Where n supports no interval there is nothing to take a width of and nothing to be outside of,
  // so the panels fall back to the days themselves rather than drawing seven empty boxes.
  const noBand = Boolean(res.none);
  const ps = noBand && sp.ps === 'width' ? 'peak' : sp.ps;

  // Every panel's series, for every rung of the ladder. Un-stacked on purpose: on a stacked chart
  // a boundary carries the cumulative spread of everything beneath it and the top is pinned at
  // 100 %, so the bands there are not each category's own variation. Here they are.
  const rungs = res.ladder.map((spec) =>
    Object.fromEntries(CATEGORIES.map((c) => [c.key, seriesFor((b) => ownVals(c.key, b), spec)])));
  const outerRung = rungs.length ? rungs[0] : null;

  // 'Interval width' drops the median and plots hi − lo, so all seven share one axis and can be
  // ranked — the comparison the own-peak scale forbids, offered as a setting instead of to the eye.
  const widthOf = (key) => outerRung
    ? outerRung[key].hi.map((v, b) => v - outerRung[key].lo[b]) : new Array(nb).fill(0);
  let sharedWidth = 0;
  if (ps === 'width' && outerRung) {
    for (const c of CATEGORIES) sharedWidth = Math.max(sharedWidth, ...widthOf(c.key));
  }
  const widthScale = Math.max(0.005, Math.ceil(sharedWidth * 200) / 200);

  const opacities = { 1: [0.26], 2: [0.16, 0.4], 3: [0.14, 0.28, 0.45] }[Math.max(1, res.levels)] || [0.26];

  shown.forEach((c, i) => {
    const top = padT + i * (panelH + gap);
    const series = outerRung ? outerRung[c.key] : null;

    let scale;
    if (ps === 'width') scale = widthScale;
    else if (ps === 'shared') scale = 1;
    else {
      let peak = 1e-6;
      for (let b = 0; b < nb; b += 1) {
        if (series) peak = Math.max(peak, series.hi[b]);
        if (sp.dd !== 'off' || !series) {          // the hairlines must fit inside the panel too
          for (const d of spreadData.curves) peak = Math.max(peak, d.shares[c.key][b] || 0);
        }
      }
      scale = Math.min(1, Math.ceil(peak * 20) / 20);
    }
    const y = (v) => top + panelH - (v / scale) * panelH;
    el('line', { x1: padL, y1: top + panelH, x2: width - padR, y2: top + panelH, class: 'grid' }, svg);

    if (ps === 'width') {
      const w = widthOf(c.key);
      const pts = w.map((v, b) => `${x(b).toFixed(1)},${y(v).toFixed(1)}`);
      el('polygon', { points: pts.concat([`${x(nb - 1).toFixed(1)},${y(0).toFixed(1)}`,
                                          `${x(0).toFixed(1)},${y(0).toFixed(1)}`]).join(' '),
                      fill: `var(--${c.css})`, 'fill-opacity': 0.3 }, svg);
      el('polyline', { points: pts.join(' '), fill: 'none', stroke: `var(--${c.css})`,
                       'stroke-width': 1.6, 'stroke-linejoin': 'round' }, svg);
    } else {
      // Nested intervals in one hue, lightest outermost: the standard fan.
      rungs.forEach((rung, r) => {
        const s = rung[c.key];
        const spec = res.ladder[r];
        if (spec.hairline) {
          for (const vals of [s.lo, s.hi]) {
            el('polyline', { points: vals.map((v, b) => `${x(b).toFixed(1)},${y(v).toFixed(1)}`).join(' '),
                             fill: 'none', stroke: `var(--${c.css})`, 'stroke-width': 0.8,
                             'stroke-dasharray': '3 2' }, svg);
          }
          return;
        }
        const up = [], dn = [];
        for (let b = 0; b < nb; b += 1) {
          up.push(`${x(b).toFixed(1)},${y(s.hi[b]).toFixed(1)}`);
          dn.push(`${x(b).toFixed(1)},${y(s.lo[b]).toFixed(1)}`);
        }
        el('polygon', { points: up.concat(dn.reverse()).join(' '),
                        fill: `var(--${c.css})`, 'fill-opacity': opacities[r] ?? 0.26 }, svg);
      });

      // The days themselves, under the interval: the only way to see that a band is not hiding
      // two clumps of days, and the only thing on the page that can name the odd one.
      if (!noBand && sp.dd !== 'off' && spreadData.n > 1) {
        const drawn = sp.dd === 'all'
          ? spreadData.curves.map((_, k) => k)
          : (series ? rankOutside(series.outside) : []);
        for (const k of drawn) {
          const day = spreadData.curves[k].shares[c.key];
          if (sp.dd === 'all' || !series) {
            el('polyline', {
              points: day.map((v, b) => `${x(b).toFixed(1)},${y(v).toFixed(1)}`).join(' '),
              fill: 'none', stroke: 'var(--text-primary)', 'stroke-width': 0.7,
              'stroke-opacity': 0.3 }, svg);
            continue;
          }
          // Only the stretches where the day actually left the interval: with 20 days and an 80 %
          // band every day is outside somewhere, so whole curves would just be "all days" again.
          // A day is rarely odd all day, and this says at which hours it was.
          for (const run of outsideRuns(day, series, x, y)) {
            el('polyline', { points: run, fill: 'none', stroke: 'var(--text-primary)',
                             'stroke-width': 0.9, 'stroke-opacity': 0.75 }, svg);
          }
        }
        if (drawn.length) {
          // How many of the days, before which ones: at 20 days and an 80 % band every day is
          // outside somewhere, and four names read as though those four were the odd ones out.
          const t = el('text', { x: width - padR, y: top + 11, class: 'axis', 'text-anchor': 'end' }, svg);
          t.textContent = sp.dd === 'all'
            ? `all ${spreadData.n} days`
            : `${drawn.length}/${spreadData.n} days leave it — most ` +
              `${dayNamesFor(drawn.slice(0, width < 620 ? 1 : 2), 2)}`;
        }
      }

      if (!noBand && series) {
        el('polyline', {
          points: series.c.map((v, b) => `${x(b).toFixed(1)},${y(v).toFixed(1)}`).join(' '),
          fill: 'none', stroke: `var(--${c.css})`, 'stroke-width': 1.6, 'stroke-linejoin': 'round',
        }, svg);
      } else if (noBand) {
        // No interval: the days as they are. Where removing weekday differences has collapsed the
        // sample onto one curve, one curve is drawn — five copies of it under a label naming five
        // separate days is the picture that started this.
        const idx = res.collapsed ? [0] : spreadData.curves.map((_, j) => j);
        for (const j of idx) {
          el('polyline', {
            points: spreadData.curves[j].shares[c.key]
              .map((v, b) => `${x(b).toFixed(1)},${y(v).toFixed(1)}`).join(' '),
            fill: 'none', stroke: `var(--${c.css})`,
            'stroke-width': idx.length === 1 ? 1.6 : 1,
            'stroke-opacity': idx.length === 1 ? 1 : 0.65, 'stroke-linejoin': 'round',
          }, svg);
        }
        const t = el('text', { x: width - padR, y: top + 11, class: 'axis', 'text-anchor': 'end' }, svg);
        t.textContent = res.collapsed
          ? `${spreadData.n} identical curves — one drawn`
          : `${idx.length} day${idx.length === 1 ? '' : 's'}, no interval`;
      }
    }

    const name = el('text', { x: padL - 8, y: top + 11, class: 'axis', 'text-anchor': 'end' }, svg);
    name.textContent = c.name;
    const zero = el('text', { x: padL - 8, y: top + panelH, class: 'axis', 'text-anchor': 'end' }, svg);
    zero.textContent = '0';
    const cap = el('text', { x: padL - 8, y: top + 24, class: 'axis', 'text-anchor': 'end' }, svg);
    cap.textContent = ps === 'width' ? `${(scale * 100).toFixed(1)}pt` : `${Math.round(scale * 100)}%`;
  });

  const base = padT + shown.length * panelH + (shown.length - 1) * gap;
  for (let h = 0; h <= 24; h += 3) {
    const px = padL + (h / 24) * plotW;
    const t = el('text', { x: Math.min(width - padR, px), y: base + 16, class: 'axis',
                           'text-anchor': h === 0 ? 'start' : h === 24 ? 'end' : 'middle' }, svg);
    t.textContent = String(h % 24).padStart(2, '0');
  }

  const scaleNote = ps === 'width'
    ? 'The y axis is the width of the outermost interval in points — the nested ladder does not ' +
      'apply here — so all seven share one axis and can be ranked, off the chart rather than out ' +
      'of a caption.'
    : ps === 'shared'
      ? 'All seven panels share a 0–100 % axis, so heights compare but a small activity is a flat line.'
      : 'Each panel is scaled to its own peak (marked at the left), so read band widths within a ' +
        'panel, not between them — "Interval width, in points" puts all seven on one axis.';
  const psNote = noBand && sp.ps === 'width'
    ? ' Interval width cannot be plotted with no estimable interval, so the days are drawn instead.'
    : '';
  $('daily-note').textContent =
    `${claimSentence(res, 'panels')} · ${spreadData.people} people. ${scaleNote}${psNote}${sourceNote()}`;
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
  // A centred moving average over exactly `windowBins` bins, applied to one day's curve. An even
  // window has no centre bin, so its two end bins carry half weight: that is what makes a printed
  // 20-minute span really 20 minutes. Without it a window of 2 bins averages bins i-1..i+1, which
  // is 30 minutes — the width the measurement rejected, behind a button that said 15.
  if (windowBins <= 1) return series.slice();
  const half = Math.floor(windowBins / 2);
  const even = windowBins % 2 === 0;
  return series.map((_, i) => {
    let sum = 0, weight = 0;
    for (let j = i - half; j <= i + half; j += 1) {
      if (j < 0 || j >= series.length) continue;
      const w = even && (j === i - half || j === i + half) ? 0.5 : 1;
      sum += series[j] * w;
      weight += w;
    }
    return weight ? sum / weight : series[i];
  });
}

function quantile(sorted, q) {
  if (!sorted.length) return 0;
  const i = (sorted.length - 1) * q;
  const lo = Math.floor(i), hi = Math.ceil(i);
  return lo === hi ? sorted[lo] : sorted[lo] + (sorted[hi] - sorted[lo]) * (i - lo);
}

// ---- the spread control surface -------------------------------------------
//
// One statistic, one set of settings. The median-and-band chart, the seven un-stacked panels and
// the table under them are all drawn from what is chosen here, and every caption on this tab is
// generated from the same object, so a caption can no longer describe a setting the code is not
// using. Nothing here recomputes the simulation: the per-day curves come from the worker once per
// kind of day and everything else is arithmetic in the page.

const SPREAD_DEFAULTS = { days: 'wd', est: 'q', cov: '80', lv: 3, sm: 20, dd: 'out', ps: 'peak' };
const SPREAD_KEY = 'flock.spread.v1';
const DAY_KEYS = DAY_NAMES.map((d) => d.toLowerCase());

// Coverage stops. Under quantiles a stop is a pair of order statistics; under mean it is the
// normal multiple that covers that share of a normal, which is why the same stop reads as a
// percentage in one estimator and as an SD multiple in the other.
const COVERAGE = [
  { id: '50', pct: 50, z: 0.674 },
  { id: '68', pct: 68, z: 0.994 },
  { id: '80', pct: 80, z: 1.282 },
  { id: '90', pct: 90, z: 1.645 },
  { id: '95', pct: 95, z: 1.960 },
  { id: 'range', pct: null, z: null },
];
const SMOOTH_STOPS = [0, 20, 30, 40];        // minutes; 0, 2, 3 and 4 bins of 10 minutes
const BLUNT_STOPS = [30, 40];                // measured to blunt the 12:00 peak

// Named starting points, not opinions the page then defends. "Page default" is the state the page
// ships in — it is not the CLI's demarcation, which is why the CLI has its own preset and its own
// line in the readout about where the two still differ.
const PRESETS = {
  published: { name: 'Page default',
               s: { days: 'wd', est: 'q', cov: '80', lv: 3, sm: 20, dd: 'out', ps: 'peak' } },
  cli:       { name: 'Like flock bands',
               s: { days: 'wd', est: 'q', cov: '80', lv: 1, sm: 0, dd: 'off', ps: 'peak' } },
  short:     { name: 'Short run (n = 5)',
               s: { days: 'wd', est: 'mean', cov: '80', lv: 1, sm: 0, dd: 'all', ps: 'peak' } },
  odd:       { name: 'Which day was odd?',
               s: { days: 'wd', est: 'q', cov: '80', lv: 1, sm: 0, dd: 'all', ps: 'peak' } },
  compare:   { name: 'Compare activities',
               s: { days: 'wd', est: 'q', cov: '80', lv: 1, sm: 20, dd: 'off', ps: 'width' } },
};

// `python -m flock bands` is median and p10–p90 over the weekdays at 15-minute bins with no
// smoothing. The same statistic can be set here, but the run underneath it is not the same run, so
// the readout says where the two part company rather than letting a preset name imply agreement.
function cliNote() {
  const p = PRESETS.cli;
  if (!Object.entries(p.s).every(([k, v]) => String(state.spread[k]) === String(v))) return '';
  const gaps = [];
  if (spreadData && spreadData.binMinutes !== 15) {
    gaps.push(`this page bins at ${spreadData.binMinutes} minutes and the CLI at 15`);
  }
  if (state.built && state.built.weeks !== 4) {
    gaps.push(`the README's line is 4 weeks and this run is ${state.built.weeks}`);
  }
  return 'same statistic as `python -m flock bands` (median, p10–p90, unsmoothed)' +
    (gaps.length ? ` — but ${gaps.join(', and ')}, so the numbers will not match to the decimal` : '');
}

let spreadData = null;          // the current sample: which days, adjusted, smoothed
let loadRepairs = [];           // repairs made to a linked or stored state, shown until touched
let pendingRestore = false;     // a restored state still to be checked against this run's n
let lastPeak = null;            // the smoother's cost at the tallest peak, for the slider
const curveCache = new Map();   // bridge kind -> daily_curves payload

const covById = (id) => COVERAGE.find((c) => c.id === id) || COVERAGE[2];

// The finest tail 20 days can resolve is 1/(n+1); anything finer is min/max wearing a percentage.
function minDaysFor(pct) {
  return Math.max(2, Math.ceil(1 / ((100 - pct) / 200) - 1 - 1e-9));
}

function covLive(id, n, est) {
  if (id === 'range') return est === 'q' && n >= 2;
  if (est === 'mean') return n >= 3;
  return n >= minDaysFor(covById(id).pct);
}

function covWhy(id, n, est) {
  if (id === 'range') return est === 'mean' ? 'a normal has no maximum' : `min–max of ${n} days`;
  if (est === 'mean') return `needs 3 days, this run has ${n}`;
  return `needs ${minDaysFor(covById(id).pct)} days, this run has ${n}`;
}

function covLabel(id, est) {
  if (id === 'range') return 'observed range';
  const c = covById(id);
  return est === 'mean' ? `±${c.z.toFixed(2)} SD` : `${c.pct} %`;
}

function trimNum(x) { return Number(x.toFixed(1)).toString(); }

function edgeLabels(id, est) {
  if (id === 'range') return ['min', 'max'];
  const c = covById(id);
  if (est === 'mean') return [`−${c.z.toFixed(2)} SD`, `+${c.z.toFixed(2)} SD`];
  const lo = (100 - c.pct) / 2;
  return [`p${trimNum(lo)}`, `p${trimNum(100 - lo)}`];
}

function covSpec(id, est) {
  if (id === 'range') return { id, est: 'q', loQ: 0, hiQ: 1, z: null, hairline: true, pct: null };
  const c = covById(id);
  const tail = (100 - c.pct) / 200;
  return { id, est, loQ: tail, hiQ: 1 - tail, z: c.z, hairline: false, pct: c.pct };
}

// What the current settings actually resolve to for this run's n: the outer stop, the ladder of
// nested intervals, and any repair that had to be made. Nothing is honoured that n cannot support.
function resolveSpread(n) {
  const sp = state.spread;
  const est = sp.est;
  const repairs = [];
  if (n < 1) return { n, est, none: 'no days', ladder: [], levels: 0, repairs };
  if (n === 1) return { n, est, none: 'n = 1 day — nothing to spread', ladder: [], levels: 0, repairs };

  // Removing weekday differences subtracts each weekday's own mean. Where a weekday appears once —
  // any single-week run — that mean is the day itself, every curve collapses onto the grand mean
  // and the band is exactly zero wide. n is unchanged and says nothing about it, so it is said
  // here: the sample has n − (number of weekdays) days of free variation, and at zero there is no
  // spread to draw however many curves are nominally in the sample.
  if (sp.days === 'wdc' && spreadData && spreadData.groups) {
    const g = spreadData.groups;
    if (n - g < 1) {
      return { n, est, collapsed: true, ladder: [], levels: 0, repairs,
               none: `${n} days minus ${g} weekday means leaves 0 days of free variation — ` +
                     `every curve is the same curve, so there is no spread at all` };
    }
  }

  let covId = sp.cov;
  if (!covLive(covId, n, est)) {
    const fall = COVERAGE.filter((c) => c.id !== 'range' && covLive(c.id, n, est))
      .sort((a, b) => b.pct - a.pct)[0];
    const to = fall ? fall.id : (covLive('range', n, est) ? 'range' : null);
    if (!to) {
      // Under mean ± SD nothing at all is estimable below three days, and every stop in the list
      // is disabled at once — so the readout has to name the control that gets out of it.
      return { n, est, ladder: [], levels: 0, repairs,
               none: `n = ${n} days supports no interval under ${est === 'mean' ? 'mean ± SD' : 'quantiles'}` +
                     (est === 'mean'
                       ? ` — an SD needs 3 days; "Median + quantiles of the days" gives the observed range at n = ${n}`
                       : '') };
    }
    repairs.push(`${covLabel(covId, est)} ${covWhy(covId, n, est)} — showing ${covLabel(to, est)}`);
    covId = to;
  }

  const outer = covSpec(covId, est);
  const want = Math.max(1, Math.min(3, Number(sp.lv) || 1));
  const below = COVERAGE.filter((c) => c.id !== 'range' && covLive(c.id, n, est) &&
    (covId === 'range' || c.pct < covById(covId).pct));
  // How many rungs this sample could carry at all: the outer stop plus every supported stop inside
  // it. The buttons above that are disabled and say why, rather than accepting a click that the
  // resolver would silently undo.
  const maxLevels = Math.min(3, below.length + 1);
  const inner = (want === 3 ? ['50', '80'] : want === 2 ? ['50'] : [])
    .filter((id) => below.some((c) => c.id === id));
  // Where a nominal rung is the outer stop itself, the next supported stop below takes its place,
  // so three nested bands really draw three: at an outer of 80 % the ladder is 50 / 68 / 80.
  for (const c of [...below].sort((a, b) => b.pct - a.pct)) {
    if (inner.length >= want - 1) break;
    if (!inner.includes(c.id)) inner.push(c.id);
  }
  inner.sort((a, b) => covById(a).pct - covById(b).pct);
  const ladder = inner.map((id) => covSpec(id, est));
  ladder.push(outer);
  ladder.reverse();                       // outermost first: lightest fill drawn first
  if (ladder.length < want) {
    repairs.push(`${want} nested bands need ${want - 1} supported stops inside ` +
      `${covLabel(covId, est)} — this sample has ${ladder.length - 1}, so ${ladder.length} ` +
      `band${ladder.length === 1 ? ' is' : 's are'} drawn`);
  }
  return { n, est, cov: covId, outer, ladder, levels: ladder.length, maxLevels, repairs };
}

// ---- the sample -----------------------------------------------------------

function bridgeKind(days) {
  if (days === 'all7') return 'all';
  if (days === 'one') return state.popDay;
  return 'weekdays';                      // 'wd' and 'wdc' both start from the weekdays
}

// Subtract each weekday's own mean curve and add the grand mean back: n is unchanged, but
// Monday-is-not-Friday structure is gone and what is left is week-to-week irregularity.
function removeWeekdayStructure(curves, nb) {
  const groups = new Map();
  curves.forEach((d, i) => {
    const wd = ((d.day % 7) + 7) % 7;
    if (!groups.has(wd)) groups.set(wd, []);
    groups.get(wd).push(i);
  });
  const out = curves.map((d) => ({ day: d.day, label: d.label, shares: {} }));
  for (const c of CATEGORIES) {
    for (const idx of groups.values()) {
      for (const i of idx) if (!out[i].shares[c.key]) out[i].shares[c.key] = new Array(nb).fill(0);
    }
    for (let b = 0; b < nb; b += 1) {
      let grand = 0;
      for (const d of curves) grand += d.shares[c.key][b] || 0;
      grand /= curves.length;
      for (const idx of groups.values()) {
        let m = 0;
        for (const i of idx) m += curves[i].shares[c.key][b] || 0;
        m /= idx.length;
        for (const i of idx) out[i].shares[c.key][b] = (curves[i].shares[c.key][b] || 0) - m + grand;
      }
    }
  }
  return out;
}

function buildSpreadData() {
  const src = curveCache.get(bridgeKind(state.spread.days));
  if (!src) { spreadData = null; return null; }
  const nb = src.curves.length ? src.curves[0].shares.S.length : 0;
  let curves = src.curves.map((d) => ({
    day: d.day, label: d.label,
    shares: Object.fromEntries(CATEGORIES.map((c) => [c.key, (d.shares[c.key] || []).slice()])),
  }));
  let groups = 0;
  if (state.spread.days === 'wdc' && curves.length) {
    groups = new Set(curves.map((d) => ((d.day % 7) + 7) % 7)).size;
    curves = removeWeekdayStructure(curves, nb);
  }
  const win = Math.max(1, Math.round(state.spread.sm / src.bin_minutes));
  const smoothed = curves.map((d) => ({
    day: d.day, label: d.label,
    shares: Object.fromEntries(CATEGORIES.map((c) => [c.key, smooth(d.shares[c.key], win)])),
  }));
  spreadData = { n: curves.length, raw: curves, curves: smoothed, nb, win, groups,
                 binMinutes: src.bin_minutes, people: src.people, kind: src.kind };
  return spreadData;
}

function meanOf(vals) { return vals.reduce((a, b) => a + b, 0) / vals.length; }

function sdOf(vals, m) {
  if (vals.length < 2) return 0;
  let s = 0;
  for (const v of vals) s += (v - m) * (v - m);
  return Math.sqrt(s / (vals.length - 1));       // the spread of the days, divided by n-1
}

function centreOf(vals, est) {
  if (est === 'mean') return meanOf(vals);
  return quantile([...vals].sort((a, b) => a - b), 0.5);
}

// One bin's interval. Under quantiles the edges are order statistics of the days; under mean they
// are mean ± z·SD, which is estimable where p10 is not and which decomposes on a stacked chart.
function interval(vals, spec) {
  if (!vals.length) return { c: 0, lo: 0, hi: 0 };
  if (spec.est === 'mean') {
    const m = meanOf(vals), sd = sdOf(vals, m);
    return { c: m, lo: m - spec.z * sd, hi: m + spec.z * sd };
  }
  const s = [...vals].sort((a, b) => a - b);
  return { c: quantile(s, 0.5), lo: quantile(s, spec.loQ), hi: quantile(s, spec.hiQ) };
}

// Per-bin values for one activity's own share, and for the cumulative stack boundary above it.
function ownVals(key, b) { return spreadData.curves.map((d) => d.shares[key][b] || 0); }

function cumValsIn(list, k, b) {
  return list.map((d) => {
    let acc = 0;
    for (let j = 0; j <= k; j += 1) acc += d.shares[CATEGORIES[j].key][b] || 0;
    return acc;
  });
}

function cumVals(k, b) { return cumValsIn(spreadData.curves, k, b); }

// A series of intervals over the day, plus which days leave the outermost one anywhere.
function seriesFor(pick, spec) {
  const nb = spreadData.nb;
  const c = [], lo = [], hi = [], outside = new Map();
  for (let b = 0; b < nb; b += 1) {
    const vals = pick(b);
    const iv = interval(vals, spec);
    c.push(iv.c); lo.push(iv.lo); hi.push(iv.hi);
    vals.forEach((v, i) => {
      if (v < iv.lo - 1e-9 || v > iv.hi + 1e-9) outside.set(i, (outside.get(i) || 0) + 1);
    });
  }
  return { c, lo, hi, outside };
}

// The pieces of one day's curve that lie outside an interval, as polyline point strings.
function outsideRuns(day, series, x, y) {
  const runs = [];
  let run = [];
  for (let b = 0; b <= day.length; b += 1) {
    const out = b < day.length &&
      (day[b] < series.lo[b] - 1e-9 || day[b] > series.hi[b] + 1e-9);
    if (out) run.push(`${x(b).toFixed(1)},${y(day[b]).toFixed(1)}`);
    else {
      if (run.length > 1) runs.push(run.join(' '));
      run = [];
    }
  }
  return runs;
}

function rankOutside(map) {
  return [...map.entries()].sort((a, b) => b[1] - a[1] || a[0] - b[0]).map(([i]) => i);
}

function dayNamesFor(indices, limit = 4) {
  const names = indices.map((i) => spreadData.curves[i].label);
  if (!names.length) return 'none';
  if (names.length <= limit) return names.join(', ');
  return `${names.slice(0, limit).join(', ')} and ${names.length - limit} more`;
}

// The share of day-values that actually fall inside the interval: the nominal coverage is a
// promise, this is what the days did. Cells where every day holds the same value — out at 03:00,
// sleep at 15:00, work overnight — are left out of the average. They are n-of-n inside any
// interval, contain no information, and counting them flatters every band; a band of exactly zero
// width used to score 100 %.
function realisedCoverage(spec) {
  let inside = 0, total = 0, cells = 0, varied = 0;
  for (const c of CATEGORIES) {
    for (let b = 0; b < spreadData.nb; b += 1) {
      const vals = ownVals(c.key, b);
      cells += 1;
      if (Math.max(...vals) - Math.min(...vals) < 1e-9) continue;
      varied += 1;
      const iv = interval(vals, spec);
      for (const v of vals) { total += 1; if (v >= iv.lo - 1e-9 && v <= iv.hi + 1e-9) inside += 1; }
    }
  }
  return { frac: total ? inside / total : null, cells, varied };
}

// What the smoother costs at the tallest peak of the run, in points of share. Printed on the
// slider so the trade is read off the control instead of remembered from a caption.
function peakCost() {
  const d = spreadData;
  if (!d || d.win <= 1 || d.n < 1) return null;
  let worst = null;
  for (const c of CATEGORIES) {
    const rawC = [], smC = [];
    for (let b = 0; b < d.nb; b += 1) {
      rawC.push(centreOf(d.raw.map((x) => x.shares[c.key][b] || 0), state.spread.est));
      smC.push(centreOf(d.curves.map((x) => x.shares[c.key][b] || 0), state.spread.est));
    }
    let peak = 0;
    for (let b = 1; b < d.nb; b += 1) if (rawC[b] > rawC[peak]) peak = b;
    const cost = (rawC[peak] - smC[peak]) * 100;
    if (!worst || cost > worst.cost) worst = { cost, cat: c, bin: peak };
  }
  return worst;
}

// ---- the prose ------------------------------------------------------------

// Where the days came from, where that changes what the spread means.
function sourceNote() {
  if (state.spread.days === 'all7') {
    return ' The sample is all seven days, so the spread contains Saturday-versus-Tuesday ' +
           'structure as well as day-to-day irregularity.';
  }
  if (state.spread.days === 'wdc') {
    const g = spreadData ? spreadData.groups : 0;
    const free = spreadData ? spreadData.n - g : 0;
    return ' Between-weekday structure has been subtracted, so what is left is week-to-week ' +
           'variation within a weekday' +
           (g ? ` — ${spreadData.n} days minus ${g} weekday means leaves ${free} day${free === 1 ? '' : 's'} of free variation.` : '.');
  }
  return '';
}

function daysPhrase(n) {
  switch (state.spread.days) {
    case 'one': return `${n} ${state.popDay} day${n === 1 ? '' : 's'}`;
    case 'all7': return `${n} days, all seven`;
    case 'wdc': return `${n} weekdays, weekday differences removed`;
    default: return `${n} weekday${n === 1 ? '' : 's'}`;
  }
}

function smoothPhrase() {
  const sm = state.spread.sm;
  if (!sm) return 'no smoothing';
  return `smoothed ${sm} min per day`;
}

// How many bands the named view actually draws. The three views draw different numbers of
// intervals by design — the stacked chart draws one, the width plot draws none — so the count is
// the one part of the claim that has to be told per view. Everything before it is identical
// everywhere, which is the part that makes it a single source.
function bandPhrase(res, view) {
  const filled = res.ladder.filter((s) => !s.hairline).length;
  const hair = res.ladder.some((s) => s.hairline);
  const fill = `${filled} band${filled === 1 ? '' : 's'}`;
  const nest = hair ? (filled ? `${fill} inside a range hairline pair` : 'the range as a hairline pair')
                    : fill;
  if (view === 'stack') return hair ? 'the range drawn as a hairline pair' : '1 band drawn';
  if (view === 'panels') return state.spread.ps === 'width' ? 'no bands — interval width plotted' : nest;
  const stack = hair ? 'the range as hairlines' : 'the outermost interval';
  if (state.spread.ps === 'width') {
    return `no bands in the panels — interval width plotted instead; the stacked chart draws ${stack}`;
  }
  if (!filled) return 'the range as a hairline pair, in the panels and on the stacked chart';
  return `${nest} in the panels; the stacked chart draws ${stack}`;
}

// The claim sentence: the single source of prose for this tab. Every caption, the table headers,
// the collapsed summary and the second line of a copied link are built from it. `view` is which
// figure is being described — 'settings' for the readout, which describes the controls themselves.
function claimSentence(res, view = 'settings') {
  const n = res.n;
  if (res.none) return `${daysPhrase(n)} · ${res.none}`;
  const est = res.est === 'mean' ? 'mean' : 'median';
  const cov = res.cov === 'range' ? 'observed range (min–max)'
            : res.est === 'mean' ? covLabel(res.cov, 'mean')
            : `middle ${covById(res.cov).pct} %`;
  return `${daysPhrase(n)} · ${est} · ${cov} · ${smoothPhrase()} · ${bandPhrase(res, view)}`;
}

// The stacked-boundary-against-own-spread comparison, measured on the run that is on screen and
// under the settings that are set. These three numbers used to be hard-coded in two captions; they
// disagreed with the page's own "Interval width, in points" view at every run size, and with the
// CLI at all of them.
function stackVsOwnNote(res) {
  if (!spreadData || res.none || !res.outer) {
    return 'With no interval estimable here there is no width to set against the stack.';
  }
  const b = Math.min(spreadData.nb - 1, Math.round((18 * 60) / spreadData.binMinutes));
  const rows = CATEGORIES.map((c, k) => {
    const own = interval(ownVals(c.key, b), res.outer);
    const cum = interval(cumValsIn(spreadData.curves, k, b), res.outer);
    return { c, own: (own.hi - own.lo) * 100, cum: (cum.hi - cum.lo) * 100 };
  });
  const top = [...rows].sort((a, z) => z.own - a.own)[0];
  const wider = rows.filter((r) => r.c !== top.c && r.cum > top.cum + 1e-9)
    .sort((a, z) => z.cum - a.cum)[0];
  const flat = rows.filter((r) => r.c !== top.c && r.own > 0.05 && r.cum < 0.05)
    .sort((a, z) => z.own - a.own)[0];
  return `Measured on this run at ${hm(b * spreadData.binMinutes)}: ${top.c.name} varies most of ` +
    `any activity (${top.own.toFixed(1)} points), ` +
    (wider
      ? `yet its stacked boundary reads ${top.cum.toFixed(1)} — narrower than ${wider.c.name}'s ` +
        `${wider.cum.toFixed(1)}. `
      : `while its stacked boundary reads ${top.cum.toFixed(1)}: a boundary carries what is ` +
        'beneath it, not the activity itself. ') +
    (flat ? `${flat.c.name}'s own ${flat.own.toFixed(1)} shows on the stack as ${flat.cum.toFixed(1)}. ` : '') +
    'The panels rank the seven under "Interval width, in points".';
}

function ordinal(n) {
  const t = n % 100;
  if (t >= 11 && t <= 13) return `${n}th`;
  return `${n}${['th', 'st', 'nd', 'rd'][n % 10] || 'th'}`;
}

function orderStatLine(res) {
  const n = res.n;
  if (n === 1) return 'the single day is drawn as it is: no band, no median and no interval come from one curve';
  if (res.none) return res.none;
  if (res.est === 'mean') {
    const c = covById(res.cov);
    return `edges = mean ± ${c.z.toFixed(2)} × SD of the ${n} days (SD divided by n−1), which ` +
           `assumes the day-to-day distribution at each minute is roughly normal`;
  }
  if (res.cov === 'range') return `edges = the lowest and the highest of the ${n} days; no percentage is claimed`;
  const [loLbl] = edgeLabels(res.cov, 'q');
  const i = (n - 1) * res.outer.loQ;
  const pos = i + 1;
  const exact = Math.abs(i - Math.round(i)) < 1e-9;
  return exact
    ? `${loLbl} = the ${ordinal(Math.round(pos))} lowest of ${n} days exactly`
    : `${loLbl} = the ${pos.toFixed(1)}th lowest of ${n}, interpolated between day ` +
      `${Math.floor(i) + 1} and day ${Math.floor(i) + 2}`;
}

function drawnDaysLine(res) {
  const dd = state.spread.dd;
  if (!spreadData) return 'no day curves drawn';
  if (res.none) {
    // With no interval the panels draw the days themselves, so this says which ones they are.
    if (spreadData.n === 1) return `the one day drawn is ${spreadData.curves[0].label}`;
    if (res.collapsed) {
      return `day curves: ${spreadData.n} identical curves, one drawn — ` +
             `${dayNamesFor(spreadData.curves.map((_, i) => i))} are the same curve after the ` +
             'weekday means come out';
    }
    return `day curves: all ${spreadData.n} drawn, with no interval to be outside of — ` +
           `${dayNamesFor(spreadData.curves.map((_, i) => i))}`;
  }
  if (dd === 'off') return 'day curves: none drawn';
  if (dd === 'all') return `day curves: all ${res.n} drawn — ${dayNamesFor(spreadData.curves.map((_, i) => i))}`;
  const counts = seriesUnionOutside(res.outer);
  const out = rankOutside(counts);
  if (!out.length) return 'outside the band: no day leaves it at any minute';
  const named = out.slice(0, 4)
    .map((i) => `${spreadData.curves[i].label} (${counts.get(i)} bins)`).join(', ');
  // The count comes first: with 20 days and an 80 % band every day leaves it somewhere, and a
  // list of four names reads as though those four were the odd ones out.
  return `outside the band: ${out.length} of ${res.n} days leave it somewhere` +
    (out.length === res.n ? ' — every one of them' : '') + `; most often ${named}` +
    (out.length > 4 ? `, then ${out.length - 4} more` : '') +
    ' — a day counts as outside where it leaves the interval, in any activity';
}

function seriesUnionOutside(spec) {
  const flagged = new Map();
  for (const c of CATEGORIES) {
    for (const [i, k] of seriesFor((b) => ownVals(c.key, b), spec).outside) {
      flagged.set(i, (flagged.get(i) || 0) + k);
    }
  }
  return flagged;
}

// ---- persistence ----------------------------------------------------------

// The link has to carry the figure the claim sentence describes, not only the statistic: the
// weekday and the chart are part of what a reader opens.
function encodeSpread() {
  const sp = state.spread;
  return `d:${sp.days},wd:${state.popDay.toLowerCase()},est:${sp.est},cov:${sp.cov},` +
         `lv:${sp.lv},sm:${sp.sm},dd:${sp.dd},ps:${sp.ps},ch:${state.stackMode}`;
}

// Unknown or malformed keys are ignored and named, so a link from an older build opens instead of
// failing silently, and an absent key falls back to that key's default.
function decodeSpread(text) {
  const out = { ...SPREAD_DEFAULTS };
  const dropped = [];
  let popDay = null;
  let stackMode = null;
  const ok = {
    d: (v) => {
      if (v === 'wd' || v === 'all7' || v === 'wdc' || v === 'one') { out.days = v; return true; }
      // Links from the build that encoded the weekday in this key still open.
      if (DAY_KEYS.includes(v)) { out.days = 'one'; popDay = DAY_NAMES[DAY_KEYS.indexOf(v)]; return true; }
      return false;
    },
    wd: (v) => DAY_KEYS.includes(v) && ((popDay = DAY_NAMES[DAY_KEYS.indexOf(v)]), true),
    ch: (v) => ['pooled', 'days', 'bands'].includes(v) && ((stackMode = v), true),
    est: (v) => (v === 'q' || v === 'mean') && ((out.est = v), true),
    cov: (v) => COVERAGE.some((c) => c.id === v) && ((out.cov = v), true),
    lv: (v) => ['1', '2', '3'].includes(v) && ((out.lv = Number(v)), true),
    sm: (v) => SMOOTH_STOPS.includes(Number(v)) && ((out.sm = Number(v)), true),
    dd: (v) => ['off', 'out', 'all'].includes(v) && ((out.dd = v), true),
    ps: (v) => ['peak', 'shared', 'width'].includes(v) && ((out.ps = v), true),
  };
  for (const part of String(text).split(',')) {
    if (!part) continue;
    const at = part.indexOf(':');
    const k = at < 0 ? part : part.slice(0, at);
    const v = at < 0 ? '' : part.slice(at + 1);
    if (!ok[k] || !ok[k](v)) dropped.push(part);
  }
  return { spread: out, popDay, stackMode, dropped };
}

function currentUrl() {
  const url = new URL(location.href);
  url.searchParams.set('seed', String($('seed').value));
  url.searchParams.set('people', String($('people').value));
  url.searchParams.set('weeks', String($('weeks').value));
  url.searchParams.set('spread', encodeSpread());
  return url;
}

// replaceState, not pushState: Back should leave the page, not walk through twelve nudges.
function persistSpread() {
  try { history.replaceState(null, '', currentUrl().toString()); } catch (e) { /* file:// */ }
  try { localStorage.setItem(SPREAD_KEY, encodeSpread()); } catch (e) { /* private window */ }
}

function initSpread() {
  const params = new URLSearchParams(location.search);
  for (const [key, id] of [['seed', 'seed'], ['people', 'people'], ['weeks', 'weeks']]) {
    const v = params.get(key);
    if (v !== null && v !== '' && Number.isFinite(Number(v))) $(id).value = String(Number(v));
  }
  let text = params.get('spread');
  let fromUrl = text !== null;
  if (!fromUrl) {
    try { text = localStorage.getItem(SPREAD_KEY); } catch (e) { text = null; }
  }
  if (!text) { state.spread = { ...SPREAD_DEFAULTS }; return; }
  const { spread, popDay, stackMode, dropped } = decodeSpread(text);
  state.spread = spread;
  if (popDay) state.popDay = popDay;
  if (stackMode) state.stackMode = stackMode;
  if (dropped.length) {
    loadRepairs.push(`ignored in the ${fromUrl ? 'link' : 'saved settings'}: ${dropped.join(' ')}`);
  }
  pendingRestore = true;
}

function applySpread(patch, { touched = true } = {}) {
  Object.assign(state.spread, patch);
  if (touched) loadRepairs = [];
  persistSpread();
  return refreshSpread();
}

// ---- the control surface --------------------------------------------------

function pressGroup(id, value, attr) {
  for (const b of $(id).children) b.setAttribute('aria-pressed', String(b.dataset[attr] === String(value)));
}

function renderSpreadControls(res) {
  const n = res.n;
  const sp = state.spread;
  pressGroup('sp-days', sp.days, 'days');
  pressGroup('sp-est', sp.est, 'est');
  pressGroup('sp-dd', sp.dd, 'dd');
  pressGroup('sp-ps', sp.ps, 'ps');

  $('sp-days-hint').textContent = sp.days === 'one'
    ? `n decides what this page may claim and which stops below are available at all. The Mon–Sun ` +
      `buttons above pick the weekday this sample is taken over: ${state.popDay}.`
    : 'n decides what this page may claim and which stops below are available at all. The Mon–Sun ' +
      'buttons above do not change this sample — under any setting but "This weekday only" they ' +
      'choose the weekday for the pooled chart and the carpet alone.';

  // n alone overstates what a weekday-adjusted sample holds: subtracting five weekday means from
  // five days leaves nothing, and the chip has to say so where the band is drawn from it.
  const free = spreadData && sp.days === 'wdc' && spreadData.groups
    ? n - spreadData.groups : null;
  $('sp-n').textContent = !spreadData ? 'n = —'
    : free === null ? `n = ${n} day${n === 1 ? '' : 's'}`
    : `n = ${n} − ${spreadData.groups} weekday means = ${free} free`;

  // Coverage stops carry their own reason when n cannot support them: nothing greys silently.
  const sel = $('sp-cov');
  clear(sel);
  for (const c of COVERAGE) {
    const opt = document.createElement('option');
    opt.value = c.id;
    const live = !spreadData || covLive(c.id, n, sp.est);
    opt.disabled = !live;
    const drawnInstead = !res.none && res.cov === c.id && res.cov !== sp.cov;
    opt.textContent = (c.id === 'range'
      ? (live ? `observed range — min–max of ${n} days` : `observed range — ${covWhy(c.id, n, sp.est)}`)
      : `${covLabel(c.id, sp.est)}${live ? '' : ` — ${covWhy(c.id, n, sp.est)}`}`) +
      (drawnInstead ? ' — drawn instead' : '');
    sel.appendChild(opt);
  }
  // The list shows what was asked for, even where n has forced something else: showing the repair
  // as the selection made re-picking it a no-op — the same click, no change event, and a request
  // in state that never got replaced. The repaired stop is labelled in the list and named in full
  // in the readout, and a longer run restores the request.
  sel.value = sp.cov;

  // Nested bands apply to the seven panels; the stacked chart draws the outermost only. A rung this
  // sample cannot carry is disabled and says why, instead of taking the click and drawing fewer.
  for (const b of $('sp-lv').children) {
    const v = Number(b.dataset.lv);
    const cap = res.none ? 3 : (res.maxLevels || 1);
    b.disabled = Boolean(spreadData) && v > cap;
    b.title = b.disabled
      ? `${v} nested bands need ${v - 1} supported stop${v === 2 ? '' : 's'} inside ` +
        `${covLabel(res.cov || sp.cov, sp.est)}; n = ${n} supports ${cap - 1}`
      : '';
  }
  pressGroup('sp-lv', res.none ? sp.lv : Math.min(sp.lv, res.maxLevels || 1), 'lv');

  const idx = Math.max(0, SMOOTH_STOPS.indexOf(sp.sm));
  $('sp-sm').value = String(idx);
  const bins = sp.sm ? Math.round(sp.sm / 10) : 0;
  const cost = lastPeak && lastPeak.cost > 0.0005
    ? ` · −${lastPeak.cost.toFixed(1)} pt at the ${hm(lastPeak.bin * (spreadData ? spreadData.binMinutes : 10))} ${lastPeak.cat.name} peak`
    : '';
  $('sp-sm-out').textContent = sp.sm ? `${sp.sm} min (${bins} bins)${cost}` : 'off';
  // No stop above off is free, and the live cost beside the handle says so at every one of them;
  // the label used to imply that only 30 and 40 cost anything.
  $('sp-sm-hint').textContent = 'off · 20 · 30 · 40 min. Every stop above off costs peak height — ' +
    'the cost at this run\'s tallest peak is beside the handle. ' + (BLUNT_STOPS.includes(sp.sm)
      ? 'This stop blunts the 12:00 peak visibly (measured).'
      : '30 and 40 blunt the 12:00 peak visibly (measured); 20 does not, which is why it is the default.');
  $('sp-sm-hint').classList.toggle('sp-warn', BLUNT_STOPS.includes(sp.sm));

  for (const b of $('sp-presets').children) {
    const p = PRESETS[b.dataset.preset];
    const on = p && Object.entries(p.s).every(([k, v]) => String(state.spread[k]) === String(v));
    b.setAttribute('aria-pressed', String(Boolean(on)));
    b.dataset.suggested = String(b.dataset.preset === 'short' && Boolean(state.built) && state.built.weeks === 1);
  }
}

function line(text, cls) {
  const p = document.createElement('p');
  if (cls) p.className = cls;
  p.textContent = text;
  return p;
}

function renderReadout(res) {
  const box = clear($('sp-readout'));
  const claim = claimSentence(res);
  box.appendChild(line(claim, 'sp-claim'));
  box.appendChild(line(orderStatLine(res)));
  if (spreadData && !res.none) {
    const got = realisedCoverage(res.outer);
    box.appendChild(line(
      got.frac === null
        ? 'realised: — no bin has any spread, so there is nothing for an interval to cover'
        : res.cov === 'range'
          ? `realised: every one of the ${res.n} days lies inside by construction — a range cannot be missed`
          : `realised: ${(got.frac * 100).toFixed(1)} % of day-values fall inside the nominal ` +
            `${covById(res.cov).pct} %${res.est === 'mean' ? ' if normal' : ''}, counted over the ` +
            `${got.varied} of ${got.cells} bin × activity cells where the days differ at all; the ` +
            `other ${got.cells - got.varied} are inside any interval and would only flatter it`));
  } else {
    box.appendChild(line('realised: —'));
  }
  const bins = spreadData ? spreadData.win : 1;
  box.appendChild(line(state.spread.sm
    ? `smoothing ${bins} bins = ${bins * (spreadData ? spreadData.binMinutes : 10)} min per day, ` +
      `applied before the summary` +
      (lastPeak && lastPeak.cost > 0.0005
        ? `; −${lastPeak.cost.toFixed(1)} pt at the ${hm(lastPeak.bin * spreadData.binMinutes)} ${lastPeak.cat.name} peak`
        : '')
    : 'smoothing off — the edges carry their order-statistic noise'));
  box.appendChild(line(drawnDaysLine(res)));
  const cli = cliNote();
  if (cli) box.appendChild(line(cli));
  for (const r of res.repairs) box.appendChild(line(`repaired: ${r}`, 'sp-repair'));
  for (const r of loadRepairs) box.appendChild(line(`on load: ${r}`, 'sp-repair'));
  $('spread-summary').textContent = claim;
}

// Everything downstream of the settings, in one place.
function refreshSpread() {
  if (!state.spread) return;
  lastPeak = spreadData ? peakCost() : null;
  const res = resolveSpread(spreadData ? spreadData.n : 0);
  renderSpreadControls(res);
  renderReadout(res);
  $('fan-note').textContent = stackVsOwnNote(res);
  if (popCache) renderPopulation(popCache);
  if (spreadData) renderDaily();
}

function initSpreadControls() {
  const rerender = () => refreshSpread();
  for (const b of $('sp-days').children) {
    b.addEventListener('click', async () => {
      state.spread.days = b.dataset.days;
      loadRepairs = [];
      persistSpread();
      await ensureCurves();
      rerender();
    });
  }
  for (const b of $('sp-est').children) b.addEventListener('click', () => applySpread({ est: b.dataset.est }));
  for (const b of $('sp-lv').children) b.addEventListener('click', () => applySpread({ lv: Number(b.dataset.lv) }));
  for (const b of $('sp-dd').children) b.addEventListener('click', () => applySpread({ dd: b.dataset.dd }));
  for (const b of $('sp-ps').children) b.addEventListener('click', () => applySpread({ ps: b.dataset.ps }));
  $('sp-cov').addEventListener('change', (e) => applySpread({ cov: e.target.value }));
  $('sp-sm').addEventListener('input', async (e) => {
    state.spread.sm = SMOOTH_STOPS[Number(e.target.value)] ?? 20;
    loadRepairs = [];
    persistSpread();
    buildSpreadData();
    rerender();
  });
  for (const b of $('sp-presets').children) {
    b.addEventListener('click', async () => {
      const p = PRESETS[b.dataset.preset];
      if (!p) return;
      Object.assign(state.spread, p.s);
      loadRepairs = [];
      persistSpread();
      await ensureCurves();
      rerender();
    });
  }
  $('sp-copy').addEventListener('click', async () => {
    const res = resolveSpread(spreadData ? spreadData.n : 0);
    const text = `${currentUrl().toString()}\n${claimSentence(res)}`;
    try {
      await navigator.clipboard.writeText(text);
      $('sp-copied').textContent = 'copied — the link and what it claims';
    } catch (e) {
      // The clipboard can be refused; the same link is already in the address bar.
      $('sp-copied').textContent = 'copy refused by the browser — the link is in the address bar';
    }
  });
  $('sp-reset').addEventListener('click', async () => {
    state.spread = { ...SPREAD_DEFAULTS };
    loadRepairs = [];
    try { localStorage.removeItem(SPREAD_KEY); } catch (e) { /* private window */ }
    $('sp-copied').textContent = 'back to the page default';
    try {
      const url = currentUrl();
      url.searchParams.delete('spread');
      history.replaceState(null, '', url.toString());
    } catch (e) { /* file:// */ }
    await ensureCurves();
    rerender();
  });

  // Below 900 px the whole fieldset collapses into a details whose summary is the claim sentence.
  const wide = window.matchMedia('(min-width: 900px)');
  const fit = () => { if (wide.matches) $('spread-wrap').open = true; };
  $('spread-wrap').open = wide.matches;      // on a phone it starts collapsed behind the claim
  fit();
  wide.addEventListener('change', fit);
}

// ---- the median-and-band chart --------------------------------------------

// A boundary is the top of a category, so the region between two boundaries is that category's
// share — cumulatively. That is why the demarcation here is not each activity's own spread.
function renderStackedBands(svg, geom) {
  const { width, height, padL, padR, padT, plotW, plotH } = geom;
  const res = resolveSpread(spreadData.n);
  const nb = spreadData.nb;
  const x = (b) => padL + ((b + 0.5) / nb) * plotW;
  const y = (v) => padT + plotH - v * plotH;
  const path = (vals) => vals.map((v, b) => `${x(b).toFixed(1)},${y(v).toFixed(1)}`).join(' ');

  const bounds = CATEGORIES.map((_, k) =>
    seriesFor((b) => cumVals(k, b), res.outer || covSpec('50', res.est)));

  for (let k = 0; k < CATEGORIES.length; k += 1) {
    const top = path(bounds[k].c).split(' ');
    const bottom = (k === 0 ? bounds[k].c.map(() => 0) : bounds[k - 1].c)
      .map((v, b) => `${x(b).toFixed(1)},${y(v).toFixed(1)}`);
    el('polygon', { points: top.concat(bottom.reverse()).join(' '),
                    fill: `var(--${CATEGORIES[k].css})` }, svg);
  }

  // The outermost interval only. Six boundaries times three intervals is eighteen more curves
  // crossing seven fills, and the best measured worst-case contrast for a curve over those fills
  // is 4.46 — which does not survive being spent eighteen times. The ladder lives in the panels.
  if (!res.none) {
    for (let k = 0; k < CATEGORIES.length - 1; k += 1) {
      const { lo, hi } = bounds[k];
      if (res.outer.hairline) {
        // min-max is two order statistics, not an interval with a percentage: a hairline pair in a
        // lighter weight than a band edge, and never wearing a number.
        for (const vals of [lo, hi]) {
          el('polyline', { points: path(vals), fill: 'none', stroke: 'var(--surface-1)',
                           'stroke-width': 1.6, 'stroke-opacity': 0.7 }, svg);
          el('polyline', { points: path(vals), fill: 'none', stroke: 'var(--text-primary)',
                           'stroke-width': 0.6, 'stroke-opacity': 0.5, 'stroke-dasharray': '3 2' }, svg);
        }
      } else {
        el('polygon', { points: path(hi).split(' ').concat(path(lo).split(' ').reverse()).join(' '),
                        fill: 'var(--text-primary)', 'fill-opacity': 0.07 }, svg);
        // A casing — a wide light stroke with a narrow dark one over it — is what cartographers use
        // to run a line over varied ground, and the only one of the four measured strokes that
        // clears 4:1 against every fill (casing 4.46, dark 2.30, white 2.11, screened hue 1.59).
        for (const vals of [lo, hi]) {
          const pts = path(vals);
          el('polyline', { points: pts, fill: 'none', stroke: 'var(--surface-1)',
                           'stroke-width': 2, 'stroke-opacity': 0.7 }, svg);
          el('polyline', { points: pts, fill: 'none', stroke: 'var(--text-primary)',
                           'stroke-width': 0.8, 'stroke-opacity': 0.6 }, svg);
        }
      }
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

  // Seven boundaries times twenty days at once is a view that already exists — "One stack per
  // day" — so here the days are drawn for the boundary under the pointer, one boundary at a time.
  const hover = el('g', {}, svg);
  const hit = el('rect', { x: padL, y: padT, width: plotW, height: plotH, fill: 'transparent' }, svg);
  const draw = (event) => {
    clear(hover);
    const rect = svg.getBoundingClientRect();
    const px = (event.clientX - rect.left) * (width / rect.width);
    const py = (event.clientY - rect.top) * (height / rect.height);
    const b = Math.max(0, Math.min(nb - 1, Math.floor(((px - padL) / plotW) * nb)));
    let k = 0;
    for (let j = 1; j < CATEGORIES.length - 1; j += 1) {
      if (Math.abs(y(bounds[j].c[b]) - py) < Math.abs(y(bounds[k].c[b]) - py)) k = j;
    }
    // The day hairlines are what "Show the days behind the band" governs. The numbers are the only
    // numeric readout of the band on the figure, so they are drawn whatever that control says.
    const hairlines = state.spread.dd !== 'off' && !res.none;
    const shown = !hairlines ? []
      : state.spread.dd === 'all'
        ? spreadData.curves.map((_, i) => i)
        : rankOutside(bounds[k].outside);
    for (const i of shown) {
      const day = [];
      for (let bb = 0; bb < nb; bb += 1) {
        let acc = 0;
        for (let j = 0; j <= k; j += 1) acc += spreadData.curves[i].shares[CATEGORIES[j].key][bb] || 0;
        day.push(acc);
      }
      const pieces = state.spread.dd === 'all'
        ? [day.map((v, bb) => `${x(bb).toFixed(1)},${y(v).toFixed(1)}`).join(' ')]
        : outsideRuns(day, bounds[k], x, y);
      for (const pts of pieces) {
        el('polyline', { points: pts, fill: 'none', stroke: 'var(--surface-1)',
                         'stroke-width': 1.6, 'stroke-opacity': 0.55 }, hover);
        el('polyline', { points: pts, fill: 'none', stroke: 'var(--text-primary)',
                         'stroke-width': 0.7, 'stroke-opacity': 0.75 }, hover);
      }
    }
    const head = `${hm(b * spreadData.binMinutes)}  top of ${CATEGORIES[k].name}\n` +
      `centre ${(bounds[k].c[b] * 100).toFixed(1)} %`;
    if (res.none) {
      showTip(event, `${head}\n${res.none}`);
      return;
    }
    const [loLbl, hiLbl] = edgeLabels(res.cov, res.est);
    const edges = `  ${loLbl} ${(bounds[k].lo[b] * 100).toFixed(1)} ` +
      `${hiLbl} ${(bounds[k].hi[b] * 100).toFixed(1)}`;
    const days = !hairlines
      ? 'day curves off — the band is drawn, the days behind it are not'
      : `${shown.length} of ${spreadData.n} day${spreadData.n === 1 ? '' : 's'} ` +
        (state.spread.dd === 'all' ? 'drawn in full' : 'drawn where they leave the interval') +
        (shown.length ? `: ${dayNamesFor(shown)}` : '');
    showTip(event, `${head}${edges}\n${days}`);
  };
  hit.addEventListener('pointermove', draw);
  hit.addEventListener('pointerleave', () => { clear(hover); hideTip(); });

  $('pop-note').textContent =
    `${claimSentence(res, 'stack')} · ${spreadData.people} people. These are cumulative stack ` +
    `boundaries: a band carries the spread of everything beneath it and the top is pinned at ` +
    `100 %, so they are not each activity's own spread. ${stackVsOwnNote(res)} ` +
    (res.est === 'mean'
      ? 'Under mean ± SD the bands do decompose: the seven mean bands are the seven mean shares. '
      : 'Medians of cumulative boundaries do not add up to the seven median shares; only the mean ' +
        'decomposes. ') +
    `The nested ladder is drawn in the panels below only, where a curve is not crossing seven ` +
    `fills. Each activity's own spread is there too.` + sourceNote();
  renderBandTable({
    bounds,
    loLbl: res.none ? '—' : edgeLabels(res.cov, res.est)[0],
    hiLbl: res.none ? '—' : edgeLabels(res.cov, res.est)[1],
    none: Boolean(res.none),
    summary: `Cumulative boundaries as a table — ${claimSentence(res, 'stack')}`,
  });
}

// The table computes the figure's statistic — the figure directly above it, not the band view's.
// It used to take each activity's own quantiles under a chart drawing cumulative boundaries, and
// then the band's smoothed quantiles under a chart drawing every day unsmoothed: two different
// statistics under one control, twice.
function renderBandTable({ bounds, loLbl, hiLbl, summary, none = false }) {
  const table = clear($('pop-table'));
  table.innerHTML = '<thead><tr><th>from</th>' +
    CATEGORIES.map((c) => `<th>${c.name} top</th><th>${loLbl}</th><th>${hiLbl}</th>`).join('') +
    '</tr></thead>';
  const body = document.createElement('tbody');
  const step = Math.max(1, Math.round(15 / spreadData.binMinutes));
  for (let b = 0; b < spreadData.nb; b += step) {
    const tr = document.createElement('tr');
    const cells = CATEGORIES.map((c, k) =>
      `<td class="num">${(bounds[k].c[b] * 100).toFixed(1)}</td>` +
      `<td class="num">${none ? '—' : (bounds[k].lo[b] * 100).toFixed(1)}</td>` +
      `<td class="num">${none ? '—' : (bounds[k].hi[b] * 100).toFixed(1)}</td>`).join('');
    tr.innerHTML = `<td>${hm(b * spreadData.binMinutes)}</td>${cells}`;
    body.appendChild(tr);
  }
  table.appendChild(body);
  $('pop-table-summary').textContent = summary;
}

function renderStackedDays(svg, geom) {
  const { width, height, padL, padR, padT, plotW, plotH } = geom;
  const days = spreadData.raw;          // the days as they came: there is no summary to smooth
  const nb = spreadData.nb;
  // One stack per day, laid over the others. Where every day puts a boundary in the same place the
  // colour reaches full strength; where they disagree the layers only partly cover, so the band
  // fades out over the range the days actually span.
  const alpha = Math.max(0.06, Math.min(0.3, 3 / Math.max(1, days.length)));
  for (const d of days) {
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
    `${daysPhrase(spreadData.n)} · ${spreadData.people} people, one stack drawn per day, as the ` +
    `days came and not smoothed. A band that fades is one whose boundary lands somewhere different ` +
    `each day. Of the settings above, "Days in the sample" chooses which days these are; the rest ` +
    `demarcate the band view.${sourceNote()}`;
  // The table under this figure is this figure: the median and the extent of the drawn stacks,
  // unsmoothed, not the band view's smoothed quantiles under a chart that is not drawing them.
  const spec = { est: 'q', loQ: 0, hiQ: 1, hairline: true };
  renderBandTable({
    bounds: CATEGORIES.map((_, k) => seriesFor((b) => cumValsIn(days, k, b), spec)),
    loLbl: 'min', hiLbl: 'max',
    summary: `Cumulative boundaries as a table — ${daysPhrase(spreadData.n)} · median and ` +
      `min–max of the ${spreadData.n} day${spreadData.n === 1 ? '' : 's'} as drawn, not smoothed`,
  });
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

  if (state.stackMode !== 'pooled' && spreadData) {
    const geom = { width, height, padL, padR, padT, padB, plotW, plotH };
    if (state.stackMode === 'days') renderStackedDays(svg, geom);
    else renderStackedBands(svg, geom);
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

  $('pop-table-summary').textContent = 'Binned shares as a table';
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

// The per-day curves, one fetch per kind of day and then cached: every control below re-renders
// from what is already here, and none of them re-runs the simulation.
async function ensureCurves() {
  if (!state.built) return null;
  if (pendingRestore) {
    pendingRestore = false;
    if (state.spread.days === 'one' && state.built.weeks < 2) {
      loadRepairs.push(`"this weekday only" is one day at weeks = ${state.built.weeks} — showing all weekdays`);
      state.spread.days = 'wd';
      persistSpread();
    }
  }
  const kind = bridgeKind(state.spread.days);
  if (!curveCache.has(kind)) {
    setStatus('day curves…');
    curveCache.set(kind, await call('daily_curves', kind));
    setStatus('');
  }
  return buildSpreadData();
}

async function loadPopulation({ refetch = true } = {}) {
  if (refetch || !popCache) {
    setStatus('counting…');
    popCache = await call('histogram', state.popDay);
    carpetCache = await call('carpet', state.popDay, 400);
    setStatus('');
  }
  await ensureCurves();
  renderCarpet(carpetCache);
  renderBlend(popCache);
  refreshSpread();                    // draws the stacked chart, the panels, the table and the prose
}

async function build() {
  const seed = Number($('seed').value);
  const people = Number($('people').value);
  const weeks = Number($('weeks').value);
  $('run').disabled = true;
  setStatus(`running ${people} people for ${weeks} week${weeks > 1 ? 's' : ''}…`);
  try {
    state.built = await call('build', seed, people, weeks);
    // A new run invalidates everything derived from the old one. Without this the band, the seven
    // panels, the table and the claim sentence go on describing a simulation that is no longer on
    // screen — a caption reading "200 people" over a 400-person run.
    curveCache.clear();
    spreadData = null;
    popCache = null;
    carpetCache = null;
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
  initSpread();                       // URL first, then localStorage, then the defaults
  legendInto($('legend-day'));
  legendInto($('legend-pop'));
  initTabs();
  initDayButtons();
  initTimes();
  initSpreadControls();

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
      for (const other of $('daytype').children) {
        other.setAttribute('aria-pressed', String(other === b));
      }
      // These buttons now govern the band and the panels too, not only the pooled chart and the
      // carpet: with "This weekday only" chosen they change which days the spread is taken over.
      persistSpread();
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
      persistSpread();          // the link carries the chart the claim sentence describes
      if (popCache) renderPopulation(popCache);
    });
  }
  // A link or a stored setting can name the chart and the weekday, so the buttons follow state
  // rather than the other way round.
  for (const b of $('stackmode').children) {
    b.setAttribute('aria-pressed', String(b.dataset.stack === state.stackMode));
  }
  $('binsize').hidden = state.stackMode !== 'pooled';
  for (const b of $('dailycat').children) {
    b.addEventListener('click', () => {
      state.dailyCat = b.dataset.cat;
      for (const other of $('dailycat').children) {
        other.setAttribute('aria-pressed', String(other === b));
      }
      renderDaily();
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
      if (!$('panel-population').hidden) loadPopulation({ refetch: false });
    }, 180);
  });

  refreshSpread();
  build();
}

init();
