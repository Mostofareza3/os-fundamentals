/* interrupt.js — Chapter 2
   Polling vs interrupt while one SSD read is in flight (the chapter's
   "~100 µs", in which a core runs a few lakh instructions — here 3,000
   per µs). Two lanes share one simulated clock; one tick = 5 µs.
   Polling lane: every tick the CPU asks the controller "done?" — 15,000
   instructions burnt per ask, nothing useful, until the answer is yes.
   Interrupt lane: the kernel puts the waiting process P1 to sleep and
   runs P2 (15,000 useful instructions per tick); when the read is done
   the controller raises an interrupt, the CPU saves its PC and jumps to
   the kernel's handler (one tick), the handler wakes P1, the CPU returns.
   Both lanes hear about the completion at the same moment.
*/

import { ui, button, range, playButton, ticker, note, chips, svg, el, clear } from './_lib.js';

const TICK = 5;                  // µs per tick
const PER_TICK = 3000 * TICK;    // instructions a core runs in one tick

export function mount(root) {
  if (root.querySelector('.sim-body')) return;   // mounted already
  const u = ui(root);

  let device = 100;              // µs the SSD read takes
  let n = device / TICK;         // cell index at which the read completes
  let tick = 0;                  // cells executed so far; simulated time = tick × 5 µs

  const t = ticker(root, step, 300);
  const devR = range('device-এর সময়', { min: 20, max: 200, step: 20, value: device, fmt: function (v) { return v + ' µs'; } },
    function (v) { device = v; n = device / TICK; reset(); });
  u.controls.append(playButton(t), button('→ ১ tick', step), button('↺ Reset', reset), devR.el);

  // the drawing: one time axis, two lanes of tick cells, the device bar below
  const markerId = 'irq-ah-' + Math.random().toString(36).slice(2, 8);
  const svgEl = svg('svg', { viewBox: '0 0 800 200', class: 'wide', role: 'img',
    'aria-label': 'Two CPU lanes on one time axis: the polling lane burns every 5 µs asking the SSD controller, the interrupt lane runs another process until the controller raises an interrupt' },
    svg('defs', null, svg('marker', { id: markerId, viewBox: '0 0 10 10', refX: 9, refY: 5, markerWidth: 7, markerHeight: 7, orient: 'auto-start-reverse' },
      svg('path', { class: 'ah-k', d: 'M0 0L10 5L0 10z' }))));
  const g = svg('g');
  svgEl.appendChild(g);
  u.stage.appendChild(svgEl);

  // per-lane totals
  const rowP = chips(u.body);
  rowP.el.appendChild(laneBadge('Polling', 'd'));
  const pUseful = rowP.add('কাজের instruction', 0);
  const pWasted = rowP.add('নষ্ট instruction', 0);
  const pAsked = rowP.add('"হয়েছে?" প্রশ্ন', 0);
  const rowI = chips(u.body);
  rowI.el.appendChild(laneBadge('Interrupt', 'ok'));
  const iUseful = rowI.add('কাজের instruction', 0);
  const iWasted = rowI.add('নষ্ট instruction', 0);
  const iAsked = rowI.add('"হয়েছে?" প্রশ্ন', 0);

  function laneBadge(name, kind) {
    return el('span', { class: 'sim-chip ' + kind }, el('span', { class: 'v' }, name));
  }

  function reset() {
    t.stop();
    tick = 0;
    draw();
  }

  function step() {
    // One tick of simulated time (5 µs) in both lanes at once. After the
    // read completes there are two more cells: the completion (handler /
    // the "yes" answer) and P1 continuing. A tick past the end starts over.
    if (tick >= n + 2) { tick = 0; draw(); return; }
    tick++;
    if (tick >= n + 2) t.stop();
    draw();
  }

  function draw() {
    clear(g);
    const x0 = 110, x1 = 750;
    const cells = n + 2;                          // waiting cells + completion + P1 continues
    const cw = (x1 - x0) / cells;
    const X = function (us) { return x0 + (us / TICK) * cw; };
    const now = tick * TICK;
    const done = tick >= n;                       // the controller has finished the read
    const add = function (node) { g.appendChild(node); return node; };

    // time axis
    add(svg('line', { x1: x0, y1: 20, x2: x1, y2: 20, class: 'axis' }));
    for (let us = 0; us <= device; us += 20) {
      add(svg('line', { x1: X(us), y1: 20, x2: X(us), y2: 25, class: 'axis' }));
      add(svg('text', { x: X(us), y: 37, 'text-anchor': 'middle', class: 't-m mono' }, us === device ? us + ' µs' : String(us)));
    }

    // lanes
    function cellText(s) { return s && s.text && cw >= 8 + 6 * s.text.length ? s.text : null; }
    function lane(y, label, cls, cell, status) {
      add(svg('text', { x: 20, y: y + 19, class: cls, 'font-size': 14 }, label));
      for (let k = 0; k < cells; k++) {
        const s = cell(k);
        const x = x0 + k * cw;
        add(svg('rect', { x: x + 1, y: y, width: Math.max(2, cw - 2), height: 28, rx: 3, class: s ? s.cls + (s.flash ? ' flash' : '') : 'b dim' }));
        const txt = cellText(s);
        if (txt) add(svg('text', { x: x + cw / 2, y: y + 18, 'text-anchor': 'middle', class: 't-s ' + s.tcls + (s.flash ? ' flash' : '') }, txt));
      }
      add(svg('text', { x: x0, y: y + 42, class: 't-m t-s' }, status));
    }
    function pollCell(k) {
      if (k >= tick) return null;
      if (k < n) return { cls: 'b-d', text: '?', tcls: 't-d' };
      if (k === n) return { cls: 'b-k', text: 'yes', tcls: 't-k', flash: tick === n + 1 };
      return { cls: 'b-u', text: 'P1', tcls: 't-u' };
    }
    function irqCell(k) {
      if (k >= tick) return null;
      if (k < n) return { cls: 'b-ok', text: 'P2', tcls: 't-ok' };
      if (k === n) return { cls: 'b-k', text: 'IRQ', tcls: 't-k', flash: tick === n + 1 };
      return { cls: 'b-u', text: 'P1', tcls: 't-u' };
    }
    const pStatus = tick === 0 ? 'CPU will ask the controller "done?" every 5 µs'
      : tick <= n ? 'CPU asks "done?" → controller: no · ' + fmt(PER_TICK) + ' instructions burnt per ask'
      : tick === n + 1 ? 'CPU asks "done?" → yes · the read completes'
      : 'P1 continues with its data';
    const iStatus = tick === 0 ? 'kernel puts P1 to sleep and runs P2 — the SSD will call'
      : tick < n ? 'P1 sleeping · CPU runs P2 · +' + fmt(PER_TICK) + ' useful instructions per tick'
      : tick === n ? 'IRQ: CPU saves PC, enters kernel mode, jumps to the handler'
      : tick === n + 1 ? 'handler: "blocks read" → wakes P1 → CPU returns'
      : 'P1 continues with its data';
    lane(46, 'Polling', 't-d', pollCell, pStatus);
    lane(102, 'Interrupt', 't-ok', irqCell, iStatus);

    // the device: a bar as long as the read takes, filling with time
    const by = 158;
    add(svg('text', { x: 20, y: by + 13, class: 't-h t-s' }, 'SSD controller'));
    add(svg('rect', { x: x0, y: by, width: X(device) - x0, height: 18, rx: 4, class: done ? 'b-ok' : 'b' }));
    if (!done && now > 0) add(svg('rect', { x: x0 + 1, y: by + 1, width: X(now) - x0 - 2, height: 16, rx: 3, class: 'f-u' }));
    add(svg('text', { x: x0, y: by + 34, class: (done ? 't-ok' : 't-m') + ' t-s' },
      done ? 'read done at ' + device + ' µs ✓ · controller signals the CPU' : 'reading blocks… ' + now + ' / ' + device + ' µs'));

    // the interrupt: a signal from the controller up into the interrupt lane
    if (done) {
      const ax = X(device) + Math.min(9, cw / 2);
      const fresh = tick === n ? ' flash' : '';
      add(svg('path', { d: 'M' + ax + ' ' + (by - 2) + ' V 134', class: 'ln-k' + fresh, 'marker-end': 'url(#' + markerId + ')' }));
      add(svg('text', { x: ax + 8, y: 150, class: 't-k t-s' + fresh }, 'IRQ'));
    }

    // the clock: a cursor through the strips and the device bar
    const cx = X(now);
    [[20, 76], [100, 132], [156, 178]].forEach(function (seg) {
      add(svg('line', { x1: cx, y1: seg[0], x2: cx, y2: seg[1], class: 'ln-u' }));
    });
    add(svg('path', { d: 'M' + (cx - 5) + ' 20 L' + (cx + 5) + ' 20 L' + cx + ' 27 z', class: 'f-u' }));
    add(svg('text', { x: Math.min(x1 - 34, Math.max(x0 + 34, cx)), y: 13, 'text-anchor': 'middle', class: 't-u mono' }, 't = ' + now + ' µs'));

    // totals, recomputed from the tick so reset and replay stay exact
    const waited = Math.min(tick, n);
    pUseful.set(0);
    pWasted.set(fmt(PER_TICK * waited), waited ? 'd' : '');
    pAsked.set(Math.min(tick, n + 1));
    iUseful.set(fmt(PER_TICK * waited), waited ? 'ok' : '');
    iWasted.set(0);
    iAsked.set(0);

    if (tick === 0) {
      note(u, 'Kernel SSD controller-কে বলল "এই block গুলো পড়ো" — লাগবে ~<b>' + bn(device) + ' µs</b> (slider-এ বদলাও)। ▶ চাপো: ওপরের lane-এ CPU প্রতি ৫ µs-এ জিজ্ঞেস করবে "হয়েছে?", নিচের lane-এ kernel অপেক্ষারত process-টাকে (P1) ঘুম পাড়িয়ে অন্য একটাকে (P2) চালাবে।');
    } else if (tick < n) {
      note(u, '<b>Polling:</b> CPU প্রতি ৫ µs-এ একবার জিজ্ঞেস করছে, মাঝের সময়টা নষ্ট। <b>Interrupt:</b> CPU P2 চালাচ্ছে, SSD নিজে ডাকবে।');
    } else if (tick === n) {
      note(u, 'SSD-র কাজ শেষ: controller নিজেই তার দিয়ে CPU-কে signal পাঠাল। CPU হাতের instruction-টা শেষ করে PC সেভ করল, kernel mode-এ ঢুকে <b>interrupt handler</b>-এ লাফ দিল।', 'k');
    } else if (tick === n + 1) {
      note(u, 'Handler দেখল "block পড়া শেষ", P1-কে জাগিয়ে দিল, CPU আগের জায়গায় ফিরে গেল — যেন কিছুই হয়নি। Polling lane-এ ঠিক এই সময়েই প্রশ্নের উত্তর এল "হ্যাঁ"।', 'k');
    } else {
      const total = bnCount(PER_TICK * n);
      note(u, '<b>' + bn(device) + ' µs</b>-এ polling <b>' + total + '</b> instruction নষ্ট করল (' + bn(n + 1) + ' বার "হয়েছে?"), interrupt lane-এ সেই ' + total + ' কাজে লাগল — আর device শেষ হওয়ার খবর দুজনেই একই সময়ে পেল।', 'ok');
    }
  }

  reset();
}

/* 300000 → "300,000" (screen values keep ASCII digits, like terminal output) */
function fmt(n) {
  return String(n).replace(/\B(?=(\d{3})+(?!\d))/g, ',');
}

/* prose digits, like the chapter: 100 → "১০০" */
function bn(n) {
  return String(n).replace(/\d/g, function (d) { return '০১২৩৪৫৬৭৮৯'[d]; });
}

/* 300000 → "৩ লাখ", 120000 → "১.২ লাখ", 60000 → "৬০ হাজার" */
function bnCount(n) {
  if (n >= 100000) return bn(Math.round(n / 10000) / 10) + ' লাখ';
  return bn(Math.round(n / 1000)) + ' হাজার';
}
