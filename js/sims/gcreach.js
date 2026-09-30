/* gcreach.js — Chapter 6
   Garbage collection as reachability. A short script runs line by line:
   the stack frame's slots (a, b, big, next) and the module-level `cache`
   are the roots, heap objects are boxes, and an arrow means "this slot
   holds that object's address". A GC — the script's global.gc() or the
   button — first marks what the roots can reach, then sweeps the rest.
   The numbers are the chapter's gc.js run: heapUsed ≈ 3.1 MB → 41.2 MB
   with the ~40 MB array → 3.3 MB once `big = null` and the collector ran.
*/

import { ui, button, stepper, ticker, note, chips, codeList, svg, el, clear, flash } from './_lib.js';

let mounts = 0;

/* heap objects, numbered in creation order (that is also their row in the drawing) */
const OBJS = {
  1: { addr: '0x257501fa9999', short: '0x…9999', text: '{ count: 1 }', h: 44 },
  2: { addr: '0x…c921', short: '0x…c921', text: 'Array(5_000_000)', sub: '~40 MB', h: 58 },
  3: { addr: '0x…4e59', short: '0x…4e59', text: 'Context { count: 0 }', sub: 'closure of next', h: 58 },
  4: { addr: '0x…0d31', short: '0x…0d31', text: "{ name: 'old' }", h: 44 }
};
const SLOTS = ['a', 'b', 'big', 'next'];

/* the script: one line per step, with the note shown after it runs */
const LINES = [
  { html: '<span class="k">const</span> a = { count: <span class="n">1</span> };',
    note: 'Object-টা heap-এ (#1, <code>0x257501fa9999</code>); <code>a</code>-র ঘরে object না, শুধু তার address — এটাই reference।' },
  { html: '<span class="k">const</span> b = a;',
    note: '<code>b = a</code>: object copy হলো না, address copy হলো — দুটো slot একই object দেখায়।' },
  { html: '<span class="k">let</span> big = <span class="k">new</span> <span class="fn">Array</span>(<span class="n">5_000_000</span>);',
    note: '৫০ লাখ element-এর array heap-এ, ~40 MB — heapUsed ≈ <b>41.2 MB</b>। <code>big</code>-এর ঘরে তবু শুধু একটা address।' },
  { html: '<span class="k">const</span> next = <span class="fn">makeCounter</span>();',
    note: '<code>makeCounter</code> শেষ, তার frame মুক্ত — কিন্তু <code>count</code> আছে heap-এর একটা Context object-এ (#3), আর <code>next</code> (closure) সেটা ধরে রেখেছে।' },
  { html: 'cache.<span class="fn">push</span>({ name: <span class="s">\'old\'</span> });',
    note: '<code>{ name: \'old\' }</code>-এর reference কোনো stack slot-এ নেই — আছে module-level <code>cache</code>-এর ভেতরে, আর <code>cache</code> নিজেই একটা root।' },
  { html: 'big = <span class="k">null</span>;',
    note: '<code>big = null</code>: #2-র দিকে আর কোনো তীর নেই — কিন্তু memory এখনো দখলে, GC না চলা পর্যন্ত।' },
  { html: 'global.<span class="fn">gc</span>();', note: null },       // animated: mark → sweep
  { html: '<span class="c">// cache কখনো খালি হয় না</span>',
    note: '<code>cache</code> module-level, সবসময় reachable — তাই #4 \'কাজে লাগে না\' হলেও GC তাকে ছোঁবে না। এটাই GC-ওয়ালা ভাষার leak।', kind: 'd' }
];
const GC_LINE = 6;
const LEAK_LINE = 7;

const INTRO = '→ পরের ধাপ চাপো: প্রতিটা লাইনে দেখো stack-এর slot-এ কী বসে আর heap-এ কী তৈরি হয়। যেকোনো ধাপে <b>GC এখন চালাও</b> চেপে দেখো কে বাঁচে, কে যায়।';
const MARK_NOTE = '<b>Mark</b>: root (stack-এর slot আর global) থেকে তীর ধরে ধরে যাওয়া — সবুজ = পৌঁছানো গেল, জীবিত; লাল = কোনো তীর নেই, garbage। এই সময়টুকু তোমার JS থেমে (GC pause)।';

/* ---------- the model: replay the script up to line i ---------- */

function compute(i, gcAt) {
  const s = { slots: { a: undefined, b: undefined, big: undefined, next: undefined }, cache: [], heap: [], swept: [] };
  for (let k = 0; k <= i; k++) {
    run(s, k);
    if (k < i) {
      if (k === GC_LINE) collect(s);                                          // the script's gc(), already past
      gcAt.forEach(function (g) { if (g === k) collect(s); });               // GCs the reader ran while on step k
    }
  }
  return s;
}

function run(s, k) {
  switch (k) {
    case 0: s.heap.push(1); s.slots.a = 1; break;
    case 1: s.slots.b = 1; break;
    case 2: s.heap.push(2); s.slots.big = 2; break;
    case 3: s.heap.push(3); s.slots.next = 3; break;
    case 4: s.heap.push(4); s.cache = [4]; break;
    case 5: s.slots.big = null; break;
    default: break;                                                          // gc() is animated; the comment does nothing
  }
}

/* objects some root still points at */
function reachable(s) {
  const r = [];
  SLOTS.forEach(function (n) { const v = s.slots[n]; if (v && r.indexOf(v) < 0) r.push(v); });
  s.cache.forEach(function (v) { if (r.indexOf(v) < 0) r.push(v); });
  return r.filter(function (id) { return s.heap.indexOf(id) >= 0; });
}

/* mark + sweep in one go (used when replaying a GC that already happened) */
function collect(s) {
  const r = reachable(s);
  s.heap = s.heap.filter(function (id) {
    if (r.indexOf(id) >= 0) return true;
    s.swept.push(id);
    return false;
  });
}

/* the chapter's numbers: 3.1 MB at start, 41.2 with the array, 3.3 after it is collected */
function heapMb(s) {
  return s.heap.indexOf(2) >= 0 ? '41.2' : s.swept.indexOf(2) >= 0 ? '3.3' : '3.1';
}

export function mount(root) {
  if (root.querySelector('.sim-body')) return;
  const u = ui(root);
  const mid = 'gcreach' + (++mounts) + '-';

  let index = -1;            // current line, -1 = nothing has run yet
  let gcAt = [];             // steps at which the reader pressed GC before moving on
  let state = compute(-1, gcAt);
  let anim = null;           // { phase: 'mark' | 'sweep', src, reach, garbage } while a GC is shown
  let lastHeap = '';

  const cols = el('div', { class: 'sim-cols' });
  const code = codeList(LINES);
  const svgEl = svg('svg', { viewBox: '0 0 360 268', role: 'img',
    'aria-label': 'Roots on the left: a stack frame with slots a, b, big, next and the module-level cache. Heap objects on the right; an arrow means the slot holds that object\'s address. A GC marks reachable objects green, garbage red, then sweeps the garbage.' });
  cols.append(code, el('div', { style: { minWidth: '0' } }, svgEl));
  u.stage.appendChild(cols);

  const stats = chips(u.body);
  const cHeap = stats.add('heapUsed', '≈ 3.1 MB', 'u');
  const cAlive = stats.add('objects alive', 0, 'ok');
  const cGarb = stats.add('unreachable', 0);

  const t = ticker(root, tickAnim, 1000);
  const gcBtn = button('GC এখন চালাও', function () { startGc('manual'); });
  stepper(u.controls, LINES.map(function (l, i) { return { title: 'line ' + (i + 1) }; }), render);
  u.controls.append(el('span', { class: 'sim-spacer' }), gcBtn);

  function render(i) {
    cancel();
    index = i;
    gcAt = i < 0 ? [] : gcAt.filter(function (k) { return k < i; });   // replay from the start; GCs done later are forgotten
    state = compute(i, gcAt);
    code.current(i < 0 ? null : i);
    draw();
    if (i === GC_LINE) { startGc('script'); return; }
    if (i < 0) note(u, INTRO);
    else note(u, LINES[i].note, LINES[i].kind || '');
  }

  /* ---------- GC: mark (1 tick) → sweep (1 tick) → done ---------- */

  function startGc(src) {
    if (anim) return;
    if (!state.heap.length) { note(u, 'Heap-এ এখনো কিছু নেই — আগে কয়েকটা লাইন চালাও।'); return; }
    const reach = reachable(state);
    anim = { phase: 'mark', src: src, reach: reach, garbage: state.heap.filter(function (id) { return reach.indexOf(id) < 0; }) };
    gcBtn.disabled = true;
    draw();
    note(u, MARK_NOTE);
    t.start();
  }

  function tickAnim() {
    if (!anim) { t.stop(); return; }
    if (anim.phase === 'mark') {
      anim.phase = 'sweep';
      draw();
      note(u, anim.garbage.length
        ? '<b>Sweep</b>: যার দিকে কোনো তীর নেই তার memory ফেরত — #2, ~40 MB। Slot আর বাকি object-এ হাত পড়ে না।'
        : '<b>Sweep</b>: ফেরত দেওয়ার কিছু নেই — প্রতিটা object-ই কোনো না কোনো root থেকে reachable।', anim.garbage.length ? 'd' : '');
      return;
    }
    finish();
  }

  function finish() {
    t.stop();
    const a = anim;
    anim = null;
    gcBtn.disabled = false;
    collect(state);
    if (a.src === 'manual') gcAt.push(index);
    draw();
    const freed = a.garbage.length > 0;
    if (a.src === 'script') {
      note(u, freed
        ? 'root থেকে reference ধরে ধরে যা পাওয়া যায় তারা জীবিত; বাকিটা garbage — <b>৩৮ MB</b> ফেরত (heapUsed ≈ 41.2 → 3.3 MB)।'
        : '<code>gc()</code> এবার কিছু পেল না — #2 আগেই সাফ হয়ে গেছে, heapUsed ≈ 3.3 MB-তেই ছিল।', 'ok');
    } else if (freed) {
      note(u, '#2 গেল — <b>৩৮ MB</b> ফেরত, heapUsed ≈ 3.3 MB। এরপরের <code>global.gc()</code>-র জন্য আর কিছু বাকি নেই।', 'ok');
    } else if (index === LEAK_LINE) {
      note(u, 'কিছু ফেরত পেল না — <code>cache</code>-এর ভেতরের object-টাও reachable, তাই GC-র চোখে সে জীবিত।', 'ok');
    } else {
      note(u, 'সব object reachable — GC কিছু ফেরত পেল না। <code>big = null</code>-এর পরে আবার চেষ্টা করো।', 'ok');
    }
  }

  function cancel() {
    if (!anim) return;
    t.stop();
    anim = null;
    gcBtn.disabled = false;
  }

  /* ---------- drawing ---------- */

  function marker(name, cls) {
    return svg('marker', { id: mid + name, viewBox: '0 0 10 10', refX: 9, refY: 5, markerWidth: 7, markerHeight: 7, orient: 'auto-start-reverse' },
      svg('path', { class: cls, d: 'M0 0L10 5L0 10z' }));
  }

  function draw() {
    clear(svgEl);
    const reach = anim ? anim.reach : reachable(state);
    const garbage = anim ? anim.garbage : state.heap.filter(function (id) { return reach.indexOf(id) < 0; });
    const marking = !!anim;
    const leak = !anim && index === LEAK_LINE;

    svgEl.appendChild(svg('defs', null, marker('u', 'ah-u'), marker('ok', 'f-ok')));
    svgEl.appendChild(svg('text', { x: 6, y: 14, class: 't-u' }, 'Roots'));
    svgEl.appendChild(svg('text', { x: 190, y: 14, class: 't-u' }, 'Heap'));
    if (anim) svgEl.appendChild(svg('text', { x: 354, y: 14, 'text-anchor': 'end', class: anim.phase === 'mark' ? 't-ok t-s' : 't-d t-s' },
      anim.phase === 'mark' ? 'GC · mark' : 'GC · sweep'));

    // stack frame: one slot per variable
    const arrows = [];
    svgEl.appendChild(svg('rect', { x: 6, y: 22, width: 130, height: 120, rx: 8, class: marking ? 'b-ok' : 'b' }));
    svgEl.appendChild(svg('text', { x: 12, y: 36, class: 't-m t-s' }, 'stack · main() frame'));
    SLOTS.forEach(function (name, k) {
      const y = 44 + k * 24;
      const v = state.slots[name];
      const set = v !== undefined;
      svgEl.appendChild(svg('rect', { x: 12, y: y, width: 118, height: 20, rx: 4, class: set ? 'b' : 'b-m' }));
      svgEl.appendChild(svg('text', { x: 18, y: y + 14, class: set ? 'mono' : 'mono t-m' }, name));
      svgEl.appendChild(svg('text', { x: 124, y: y + 14, 'text-anchor': 'end', class: v ? 'mono' : 'mono t-m' },
        v === undefined ? '—' : v === null ? 'null' : OBJS[v].short));
      if (v) arrows.push({ y: y + 10, id: v });
    });

    // the module-level cache: a root that is not on the stack
    svgEl.appendChild(svg('rect', { x: 6, y: 152, width: 130, height: 46, rx: 8, class: marking ? 'b-ok' : 'b' }));
    svgEl.appendChild(svg('text', { x: 12, y: 166, class: 't-m t-s' }, 'global · module-level'));
    svgEl.appendChild(svg('rect', { x: 12, y: 172, width: 118, height: 20, rx: 4, class: 'b' }));
    svgEl.appendChild(svg('text', { x: 18, y: 186, class: 'mono' }, 'cache'));
    svgEl.appendChild(svg('text', { x: 124, y: 186, 'text-anchor': 'end', class: 'mono' },
      state.cache.length ? '[' + OBJS[state.cache[0]].short + ']' : '[]'));
    state.cache.forEach(function (id) { arrows.push({ y: 182, id: id }); });

    // heap objects, one row each in creation order
    const centers = {};
    let y = 22;
    [1, 2, 3, 4].forEach(function (id) {
      const o = OBJS[id];
      centers[id] = y + o.h / 2;
      const alive = state.heap.indexOf(id) >= 0;
      const swept = state.swept.indexOf(id) >= 0;
      if (alive) {
        const isReach = reach.indexOf(id) >= 0;
        let cls = 'b-u', tag = o.addr, tagCls = 'mono t-m';
        if (anim) {
          cls = isReach ? 'b-ok' : anim.phase === 'sweep' ? 'b-d dim' : 'b-d';
          tag = isReach ? 'reachable' : anim.phase === 'sweep' ? 'freeing…' : 'garbage';
          tagCls = isReach ? 't-ok t-s' : 't-d t-s';
        } else if (leak && id === 4) {
          cls = 'b-ok'; tag = 'alive, never used'; tagCls = 't-d t-s';
        } else if (!isReach) {
          cls = 'b'; tag = 'no reference'; tagCls = 't-d t-s';
        }
        svgEl.appendChild(svg('rect', { x: 190, y: y, width: 164, height: o.h, rx: 6, class: cls }));
        svgEl.appendChild(svg('text', { x: 198, y: y + 15, class: 'mono t-m' }, '#' + id));
        svgEl.appendChild(svg('text', { x: 346, y: y + 15, 'text-anchor': 'end', class: tagCls }, tag));
        svgEl.appendChild(svg('text', { x: 198, y: y + 33, class: 'mono' }, o.text));
        if (o.sub) svgEl.appendChild(svg('text', { x: 198, y: y + 50, class: 't-m t-s' }, o.sub));
      } else if (swept) {
        svgEl.appendChild(svg('rect', { x: 190, y: y, width: 164, height: o.h, rx: 6, class: 'b-m' }));
        svgEl.appendChild(svg('text', { x: 198, y: y + 15, class: 'mono t-m' }, '#' + id));
        svgEl.appendChild(svg('text', { x: 346, y: y + 15, 'text-anchor': 'end', class: 't-m t-s' }, 'swept'));
        svgEl.appendChild(svg('text', { x: 198, y: y + 33, class: 't-m t-s' }, (o.sub || '') + ' freed'));
      }
      y += o.h + 10;
    });

    // arrows: a slot holds an address → it points at that object; two slots
    // with the same address land on the same box, fanned apart a little
    const perTarget = {}, seen = {};
    arrows.forEach(function (a) { perTarget[a.id] = (perTarget[a.id] || 0) + 1; });
    arrows.forEach(function (a) {
      if (state.heap.indexOf(a.id) < 0) return;
      const j = seen[a.id] = (seen[a.id] || 0) + 1;
      const ey = centers[a.id] + (j - 1 - (perTarget[a.id] - 1) / 2) * 8;
      const ok = marking || (leak && a.id === 4);
      svgEl.appendChild(svg('path', { d: 'M131 ' + a.y + ' C 163 ' + a.y + ', 163 ' + ey + ', 187 ' + ey,
        class: ok ? 'ln-ok' : 'ln-u', 'marker-end': 'url(#' + mid + (ok ? 'ok' : 'u') + ')' }));
    });

    const mb = '≈ ' + heapMb(state) + ' MB';
    cHeap.set(mb);
    if (mb !== lastHeap && lastHeap) flash(cHeap.el);
    lastHeap = mb;
    cAlive.set(state.heap.length);
    cGarb.set(garbage.length, garbage.length ? 'd' : '');
  }
}
