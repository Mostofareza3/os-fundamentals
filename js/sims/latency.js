/* latency.js — Chapter 2
   The chapter's latency table, drawn to scale. One bar per source (CPU
   register, RAM, SSD, hard disk, a server in the same data center, a
   server on another continent); bar length ∝ log10 of the time, so every
   equal step along the axis is ×1,000. The second view relabels the same
   bars with the table's third column ("RAM-এর ১০০ ns-কে ১ সেকেন্ড ধরলে",
   ×10,000,000): nothing moves, only the units change. Below, N reads of
   RAM / SSD / hard disk are added up — same work, 80,000× apart.
*/

import { ui, el, svg, append, clear, select, range, button, chips, note, flash } from './_lib.js';

const SCALE = 1e7;      // 100 ns → 1 s
const L_MAX = 10;       // the axis runs 0.1 ns … 1 s: log10(1 s / 0.1 ns) = 10

/* The table. ns: the representative time (bar length and the N× sums);
   real: the bar's label in real time; scaled: a fixed label in the RAM = 1 s view
   (the chapter's own words for the register); rng: the chapter's range, shown in the
   source's label, [real view, RAM = 1 s view]. */
const SOURCES = [
  { label: 'CPU register', ns: 0.5, real: '< 1 ns', scaled: 'এক পলকেরও কম' },
  { label: 'RAM', ns: 100, real: '100 ns', ref: true },
  { label: 'SSD', ns: 50e3, real: '50 µs', rng: ['20–100 µs', '3–17 min'] },
  { label: 'Hard disk', ns: 8e6, real: '8 ms', rng: ['5–10 ms', '14–28 h'] },
  { label: 'একই data center-এর server', ns: 0.5e6, real: '0.5 ms' },
  { label: 'অন্য মহাদেশের server', ns: 150e6, real: '150 ms' }
];

/* axis ticks per view: [real ns, label, row] — the RAM = 1 s view's ticks sit close
   together, so its labels alternate between two rows and stay readable on a phone */
const TICKS = [
  [[1, '1 ns'], [1e3, '1 µs'], [1e6, '1 ms'], [1e9, '1 s']],
  [[100, '1 s'], [6e3, '1 min', 1], [3.6e5, '1 h'], [8.64e6, '1 day', 1]]
];

/* the N slider: 0–6 → 1 … 1,000,000 reads. val: on the slider; chip: chip labels; bn: the note */
const N_STEPS = [
  { n: 1, val: '1', chip: '1', bn: 'একবার' },
  { n: 10, val: '10', chip: '10', bn: '১০ বার' },
  { n: 100, val: '100', chip: '100', bn: '১০০ বার' },
  { n: 1e3, val: '1k', chip: '1,000', bn: '১,০০০ বার' },
  { n: 1e4, val: '10k', chip: '10,000', bn: '১০,০০০ বার' },
  { n: 1e5, val: '100k', chip: '100,000', bn: '১ লাখ বার' },
  { n: 1e6, val: '1M', chip: '1,000,000', bn: '১০ লাখ বার' }
];
const N_DEFAULT = 3;

export function mount(root) {
  if (root.querySelector('.sim-body')) return;
  const u = ui(root);

  let scaled = false;          // false: আসল সময় · true: RAM = ১ সেকেন্ড ধরলে
  let nIdx = N_DEFAULT;

  const modeS = select('দেখাও', [
    { value: 'real', label: 'আসল সময়' },
    { value: 'ram1s', label: 'RAM = ১ সেকেন্ড ধরলে' }
  ], 'real', function (v) { scaled = v === 'ram1s'; draw('mode'); });
  const nR = range('কতবার পড়া (N)', { min: 0, max: 6, value: nIdx, fmt: function (v) { return N_STEPS[v].val; } },
    function (v) { nIdx = v; draw('n'); });
  u.controls.append(modeS.el, nR.el, button('↺ Reset', reset));

  // stage: one bar per source, then the log axis under the tracks
  const bars = el('div', { class: 'sim-bars', role: 'img', 'aria-label': 'One bar per source, length proportional to log10 of the access time; RAM is the amber reference bar' });
  const vals = [];
  const rows = SOURCES.map(function (s) {
    const lbl = el('span', { class: 'lbl' });
    const fill = el('div', { class: 'fill', style: { width: pct(s.ns) + '%' } });
    const v = el('span', { class: 'v' });
    vals.push(v);
    bars.appendChild(el('div', { class: 'sim-bar' + (s.ref ? ' k' : '') }, lbl, el('div', { class: 'track' }, fill), v));
    return { lbl: lbl, v: v };
  });
  const axis = svg('svg', { style: { height: '22px' }, 'aria-hidden': 'true' });
  const axisV = el('span', { class: 'v' });
  vals.push(axisV);
  bars.appendChild(el('div', { class: 'sim-bar' }, el('span', { class: 'lbl' }, 'log scale'), axis, axisV));
  u.stage.appendChild(bars);

  const stats = chips(u.body);          // below the stage, above the note

  function reset() {
    scaled = false; nIdx = N_DEFAULT;
    modeS.set('real'); nR.set(N_DEFAULT);
    draw();
  }

  /* what: undefined (reset/initial) | 'mode' | 'n' — decides what flashes */
  function draw(what) {
    const st = N_STEPS[nIdx];
    const view = scaled ? 1 : 0;

    SOURCES.forEach(function (s, i) {
      const r = rows[i];
      clear(r.lbl);
      append(r.lbl, [s.ref ? el('b', null, s.label) : s.label, s.rng ? ' (' + s.rng[view] + ')' : null]);
      r.v.textContent = scaled ? (s.scaled || fmtTime(s.ns * SCALE)) : s.real;
      if (what === 'mode') flash(r.v);
    });
    drawAxis(view);

    // N reads, added up — in the units of the current view
    const sum = function (ns) { return fmtTime(st.n * ns * (scaled ? SCALE : 1)); };
    const tRam = sum(100), tSsd = sum(50e3), tHdd = sum(8e6);
    clear(stats.el);
    const cs = [stats.add(st.chip + ' বার RAM', tRam, 'k'), stats.add(st.chip + ' বার SSD', tSsd), stats.add(st.chip + ' বার hard disk', tHdd)];
    if (what) cs.forEach(function (c) { flash(c.el); });

    if (!scaled) {
      note(u, '<b>' + st.bn + ' পড়া</b>: RAM <b>' + tRam + '</b>, SSD <b>' + tSsd + '</b>, hard disk <b>' + tHdd +
        '</b> — একই কাজ, <b>৮০,০০০ গুণ</b> ফারাক। RAM → SSD ৫০০ গুণ, SSD → hard disk আরও ১৬০ গুণ।');
    } else {
      note(u, '<b>' + st.bn + ' পড়া</b>, RAM-এর ১০০ ns-কে ১ সেকেন্ড ধরলে: RAM <b>' + tRam + '</b>, SSD <b>' + tSsd + '</b>, hard disk <b>' + tHdd +
        '</b>। Bar একটুও নড়েনি, শুধু লেখাটা বদলেছে — অনুপাত সেই <b>৮০,০০০ গুণ</b>।');
    }
    equalize();
  }

  function drawAxis(view) {
    clear(axis);
    const ticks = TICKS[view];
    const twoRows = ticks.some(function (t) { return t[2]; });
    axis.style.height = (twoRows ? 34 : 22) + 'px';
    axis.appendChild(svg('line', { x1: '0%', y1: 1, x2: '100%', y2: 1, class: 'axis' }));
    ticks.forEach(function (t) {
      const p = pct(t[0]), row = t[2] || 0, end = p > 92;      // the 1 s tick sits at the right edge
      axis.appendChild(svg('line', { x1: p + '%', y1: 0, x2: p + '%', y2: row ? 18 : 6, class: 'axis' }));
      axis.appendChild(svg('text', { x: p + '%', dx: end ? -3 : 0, y: row ? 31 : 19, 'text-anchor': end ? 'end' : 'middle', class: 't-m t-s' }, t[1]));
    });
  }

  /* Every .sim-bar is its own grid, so the value column would be as wide as
     its own text and the tracks would not line up. Give every value the width
     of the widest one. */
  function equalize() {
    vals.forEach(function (v) { v.style.minWidth = ''; });
    let max = 0;
    vals.forEach(function (v) { max = Math.max(max, v.getBoundingClientRect().width); });
    if (max > 0) vals.forEach(function (v) { v.style.minWidth = Math.ceil(max) + 'px'; });
  }
  if (document.fonts && document.fonts.ready) document.fonts.ready.then(equalize, function () {});

  draw();
}

/* bar length: log10(t / 0.1 ns) over the 0.1 ns … 1 s axis, as a percentage */
function pct(ns) {
  return Math.max(0, Math.min(100, (Math.log10(ns / 0.1) / L_MAX) * 100));
}

/* 100 → "100 ns", 5e4 → "50 µs", 8e9 → "8 s", 5e11 → "8 min 20 s", 5e12 → "1 h 23 min",
   8e13 → "22 h", 1.5e15 → "17 days", 8e16 → "2.5 years" */
function fmtTime(ns) {
  if (ns < 1e3) return num(ns) + ' ns';
  if (ns < 1e6) return num(ns / 1e3) + ' µs';
  if (ns < 1e9) return num(ns / 1e6) + ' ms';
  const s = ns / 1e9;
  if (s < 60) return num(s) + ' s';
  if (s < 3600) {
    const t = Math.round(s), m = Math.floor(t / 60), r = t % 60;
    return r ? m + ' min ' + r + ' s' : m + ' min';
  }
  const h = s / 3600;
  if (h < 24) {
    if (h >= 10) return Math.round(h) + ' h';
    const tm = Math.round(s / 60), hh = Math.floor(tm / 60), mm = tm % 60;
    return mm ? hh + ' h ' + mm + ' min' : hh + ' h';
  }
  const d = h / 24;
  if (d < 365) return unit(d, 'day');
  return unit(d / 365, 'year');
}

/* one decimal below 10, whole numbers above, thousands grouped */
function num(x) {
  const v = x < 10 ? Math.round(x * 10) / 10 : Math.round(x);
  const parts = String(v).split('.');
  return parts[0].replace(/\B(?=(\d{3})+(?!\d))/g, ',') + (parts[1] ? '.' + parts[1] : '');
}
function unit(x, name) {
  const v = num(x);
  return v + ' ' + name + (v === '1' ? '' : 's');
}
