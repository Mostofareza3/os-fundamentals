/* callstack.js — Chapter 5
   The stack as the ledger of function calls. Mode 1 walks the chapter's
   trace.js (main → foo → bar): every call subtracts 0x30 from SP and
   pushes a frame (return address + local), console.trace lists the
   frames newest-first, every return adds 0x30 back — the frame is
   "freed" but its bytes stay. Mode 2 runs f(n) → f(n + 1) with a chosen
   frame size until the frames fill V8's ~1 MB limit, long before the
   OS's 8 MB stack (ulimit -s) and the guard page below it.
*/

import { ui, el, svg, clear, select, range, button, playButton, ticker, stepper, note, chips, panel, logPanel, codeList, hex, bytes } from './_lib.js';

const SP0 = 0x16fdff2f0;           // SP before main() is called
const FRAME = 0x30;                 // bytes per frame in trace.js (48 B)
const V8_LIMIT = 1024 * 1024;       // "প্রায় ১ MB" — V8's own limit
const OS_LIMIT = 8 * 1024 * 1024;   // ulimit -s ≈ 8 MB, then the guard page
const PER_TICK = 250;               // calls pushed per tick in recursion mode

/* the chapter's script, one array entry per source line (syntax spans only) */
const TRACE_CODE = [
  { html: '<span class="c">1  </span><span class="k">function</span> <span class="fn">bar</span>() { <span class="k">const</span> z = <span class="n">3</span>; console.<span class="fn">trace</span>(<span class="s">\'এখানে stack কেমন?\'</span>); }' },
  { html: '<span class="c">2  </span><span class="k">function</span> <span class="fn">foo</span>() { <span class="k">const</span> y = <span class="n">2</span>; <span class="fn">bar</span>(); }' },
  { html: '<span class="c">3  </span><span class="k">function</span> <span class="fn">main</span>() { <span class="k">const</span> x = <span class="n">1</span>; <span class="fn">foo</span>(); }' },
  { html: '<span class="c">4  </span><span class="fn">main</span>();' }
];

/* the frames in push order: which function, its local, where it returns to (the caller's position, as console.trace shows it), which source line runs */
const FRAMES = [
  { fn: 'main', local: 'x = 1', ret: 'trace.js:4:1', line: 2 },
  { fn: 'foo', local: 'y = 2', ret: 'trace.js:3:19', line: 1 },
  { fn: 'bar', local: 'z = 3', ret: 'trace.js:2:18', line: 0 }
];

/* the chapter's console.trace output (two-space indent so the lines fit a narrow column) */
const TRACE_OUT = [
  { text: 'Trace: এখানে stack কেমন?', kind: '' },
  { text: '  at bar (trace.js:1:26)', kind: 'u' },
  { text: '  at foo (trace.js:2:18)', kind: 'u' },
  { text: '  at main (trace.js:3:19)', kind: 'u' },
  { text: '  at Object.<anonymous> (trace.js:4:1)', kind: '' },
  { text: '  at Module._compile (…)', kind: 'm' },
  { text: '  ...', kind: 'm' }
];

/* step i → what the stack looks like: live frames, the just-freed slot, which frame runs, whether trace printed */
const TRACE_STEPS = [
  { title: 'main() ডাকা — push', depth: 1 },
  { title: 'main → foo() — push', depth: 2 },
  { title: 'foo → bar() — push', depth: 3 },
  { title: 'bar: console.trace()', depth: 3, traced: true },
  { title: 'bar return — pop', depth: 2, freed: 'bar', traced: true },
  { title: 'foo return — pop', depth: 1, freed: 'foo', traced: true },
  { title: 'main return — pop', depth: 0, freed: 'main', traced: true, kind: 'ok' }
];

const TRACE_NOTES = [
  ['<b>SP থেকে 0x30 বিয়োগ — frame তৈরি।</b> Frame-এ থাকে ফেরার ঠিকানা (trace.js:4:1 — যেখান থেকে main ডাকা হয়েছিল) আর local <code>x = 1</code>।', ''],
  ['main-এর frame রয়ে গেল, তার নিচে foo-র নতুন frame — main-এর ফেরার ঠিকানা মুছল না। এই কারণেই ঠিকানাটা একটা register-এ না রেখে stack-এ রাখা।', ''],
  ['তিনটা frame, তিনটা আলাদা ফেরার ঠিকানা, তিনটা আলাদা local। SP সবসময় সবচেয়ে নিচের frame-এ: <code>' + hex(SP0 - 3 * FRAME) + '</code>।', ''],
  ['Stack trace = এই মুহূর্তে stack-এ যত frame, তাদের তালিকা — মাঝের ছবির লিখিত রূপ। প্রতিটা frame-এর return address থেকে runtime বের করে কোন লাইন থেকে ডাকা হয়েছিল।', 'k'],
  ['<b>return: frame freed</b> — byte গুলো মুছে যায় না, শুধু SP উপরে উঠে যায় (0x30 যোগ); পরের call এই জায়গাটাই আবার ব্যবহার করবে।', ''],
  ['ফেরার ক্রম উল্টো: যে সবার শেষে ঢুকেছে (bar) সে সবার আগে বেরিয়েছে, তারপর foo — LIFO, তাই কাঠামোটার নাম stack।', ''],
  ['SP আবার <code>' + hex(SP0) + '</code>-এ, যেখান থেকে শুরু। প্রতিটা call-এ একটা বিয়োগ, প্রতিটা return-এ একটা যোগ — কাউকে জিজ্ঞেস করতে হয় না, কিছু খুঁজতে হয় না।', 'ok']
];

let uid = 0;

function fmtN(n) { return Number(n).toLocaleString('en-US'); }

export function mount(root) {
  if (root.querySelector('.sim-body')) return;   // mounted once per placeholder
  const u = ui(root);
  const id = 'cs' + (++uid);

  let mode = 'trace';
  let owned = [];      // controls and chip rows that belong to the current mode
  let t = null;        // the recursion mode's ticker

  const sel = select('Mode', [
    { value: 'trace', label: 'main → foo → bar (trace.js)' },
    { value: 'rec', label: 'Recursion — overflow পর্যন্ত' }
  ], mode, function (v) { mode = v; build(); });
  u.controls.appendChild(sel.el);

  function own(node) { owned.push(node); return node; }

  function teardown() {
    if (t) { t.stop(); t = null; }
    owned.forEach(function (n) { n.remove(); });
    owned = [];
    clear(u.stage);
  }

  function build() {
    teardown();
    if (mode === 'trace') buildTrace(); else buildRecursion();
  }

  /* an arrow-head marker for the SP pointer; one per svg */
  function spDefs(name) {
    return svg('defs', null,
      svg('marker', { id: id + '-' + name, viewBox: '0 0 10 10', refX: 9, refY: 5, markerWidth: 7, markerHeight: 7, orient: 'auto-start-reverse' },
        svg('path', { class: 'ah-u', d: 'M0 0L10 5L0 10z' })));
  }

  /* highlight one source line without the "done" dimming (this script does not run top to bottom).
     The current line keeps the code text colour: sim.css paints .ln.cur with --heading, which is
     dark on the (always dark) code background in the light theme. */
  function setLine(code, i, cls) {
    code.lines.forEach(function (s, j) {
      const cur = j === i && cls !== 'done';
      s.classList.toggle('cur', cur);
      s.classList.toggle('done', cls === 'done');
      s.style.color = cur ? 'var(--code-text)' : '';
    });
  }

  /* ---------- mode 1: main → foo → bar ---------- */
  function buildTrace() {
    const stats = chips(u.body);
    u.body.insertBefore(own(stats.el), u.stage);
    const cSP = stats.add('SP', hex(SP0), 'u');
    const cDepth = stats.add('frame', 0);
    stats.add('frame-এর মাপ', '0x30 = 48 B');

    // the script on top (its 4 lines stay whole, numbered like the trace refers to them),
    // then steps | stack | console.trace output side by side — plain cells, so the
    // trace lines keep the chapter's indentation without wrapping
    function cell(title) {
      return el('div', { style: { minWidth: 0 } }, el('div', { class: 'sim-panel-title' }, title));
    }
    const codeC = cell('trace.js');
    const code = codeList(TRACE_CODE);
    code.lines.forEach(function (s) { s.style.whiteSpace = 'pre-wrap'; });
    codeC.appendChild(code);
    u.stage.appendChild(codeC);
    const cols = el('div', { class: 'sim-cols w-3', style: { marginTop: '14px' } });
    const left = cell('ধাপ');
    const stackC = cell('Stack — grows down ↓');
    const svgEl = svg('svg', { viewBox: '0 0 200 300', role: 'img', style: { maxWidth: '260px', margin: '0 auto' },
      'aria-label': 'The process stack: older frames at the top, the newest frame at the bottom, SP pointing at the lowest live frame' });
    const defs = spDefs('sp');
    const g = svg('g');
    svgEl.append(defs, g);
    stackC.appendChild(svgEl);
    const outC = cell('console.trace output');
    const log = logPanel(outC, 20);
    log.el.style.maxHeight = 'none';                 // all 7 lines stay visible, nothing scrolls away
    cols.append(left, stackC, outC);
    u.stage.appendChild(cols);

    const step = stepper(u.controls, TRACE_STEPS, render);
    Object.keys(step.buttons).forEach(function (k) { own(step.buttons[k]); });
    left.appendChild(step.list);

    function render(i, s) {
      const depth = s ? s.depth : 0;
      const sp = SP0 - depth * FRAME;
      const pushed = s && !s.freed && !s.traced;      // this step pushed a frame
      drawStack(depth, s ? s.freed : null, pushed);
      cSP.set(hex(sp));
      cDepth.set(depth);
      log.clear();
      if (s && s.traced) TRACE_OUT.forEach(function (l) { log.add(l.text, l.kind); });
      if (!s) setLine(code, null);
      else if (depth === 0) setLine(code, null, 'done');
      else setLine(code, FRAMES[depth - 1].line);
      if (i < 0) {
        note(u, 'Mode বেছে <b>→ পরের ধাপ</b> চাপো। উপরে script; নিচে বাঁয়ে ধাপ, মাঝে stack — উপরে পুরনো frame, নিচে নতুন, SP সবসময় সবচেয়ে নিচেরটায় — আর ডানে console.trace-এর output।');
        return;
      }
      note(u, TRACE_NOTES[i][0], TRACE_NOTES[i][1]);
    }

    function drawStack(depth, freed, pushed) {
      clear(g);
      const BX = 10, BW = 180, FH = 54, GAP = 6, TOP = 50;
      g.appendChild(svg('text', { x: BX, y: 12, class: 't-m t-s' }, 'higher addresses'));
      g.appendChild(svg('rect', { x: BX, y: 18, width: BW, height: 24, rx: 4, class: 'b-m' }));
      g.appendChild(svg('text', { x: 100, y: 34, 'text-anchor': 'middle', class: 't-m t-s' }, 'older frames · Node'));
      let yb = 42;                                   // bottom edge of the last drawn box
      for (let k = 0; k < depth; k++) {
        const f = FRAMES[k];
        const y = TOP + k * (FH + GAP);
        const cur = k === depth - 1;
        g.appendChild(svg('rect', { x: BX, y: y, width: BW, height: FH, rx: 5, class: (cur ? 'b-u' : 'b') + (cur && pushed ? ' flash' : '') }));
        g.appendChild(svg('text', { x: BX + 10, y: y + 19, class: cur ? 't-u' : 't-h' }, f.fn));
        g.appendChild(svg('text', { x: BX + 10, y: y + 35, class: 't-s' }, 'ret addr · ' + f.local));
        g.appendChild(svg('text', { x: BX + 10, y: y + 49, class: 't-m t-s' }, 'ret → ' + f.ret));
        yb = y + FH;
      }
      if (freed) {
        // like the chapter figure: the slot just popped is drawn "freed", SP is back at the frame above it
        const y = TOP + depth * (FH + GAP);
        g.appendChild(svg('rect', { x: BX, y: y, width: BW, height: FH, rx: 5, class: 'b-m flash' }));
        g.appendChild(svg('text', { x: 100, y: y + 24, 'text-anchor': 'middle', class: 't-m t-s' }, 'freed (' + freed + ')'));
        g.appendChild(svg('text', { x: 100, y: y + 41, 'text-anchor': 'middle', class: 't-m t-s' }, 'bytes stay · SP moved up'));
        const back = depth ? 'SP ↑ back at ' + FRAMES[depth - 1].fn : 'SP ↑ back where it started';
        g.appendChild(svg('text', { x: 100, y: y + FH + 20, 'text-anchor': 'middle', class: 't-u t-s' }, back));
        g.appendChild(svg('text', { x: 100, y: y + FH + 36, 'text-anchor': 'middle', class: 'mono flash' }, hex(SP0 - depth * FRAME)));
      } else {
        g.appendChild(svg('line', { x1: 100, y1: yb + 34, x2: 100, y2: yb + 6, class: 'ln-u', 'marker-end': 'url(#' + id + '-sp)' }));
        g.appendChild(svg('text', { x: 100, y: yb + 50, 'text-anchor': 'middle', class: 't-u t-s' }, 'SP'));
        g.appendChild(svg('text', { x: 100, y: yb + 66, 'text-anchor': 'middle', class: 'mono' + (pushed ? ' flash' : '') }, hex(SP0 - depth * FRAME)));
      }
    }
  }

  /* ---------- mode 2: recursion until RangeError ---------- */
  function buildRecursion() {
    let frameSize = 112;      // ≈ the chapter's small(): 1 MB / 9183 ≈ 114 B
    let depth = 0;
    let over = false;

    const sizeR = range('frame-এর মাপ', { min: 64, max: 512, step: 16, value: frameSize, fmt: function (v) { return v + ' B'; } }, function (v) { frameSize = v; reset(); });
    t = ticker(root, tick, 100);
    u.controls.append(
      own(sizeR.el),
      own(button('small ≈ 112 B', function () { setSize(112); })),
      own(button('big ≈ 208 B', function () { setSize(208); })),
      own(playButton(t)),
      own(button('→ 250 call', function () { push(PER_TICK); })),
      own(button('↺ Reset', reset)));

    const stats = chips(u.body);
    u.body.insertBefore(own(stats.el), u.stage);
    const cDepth = stats.add('depth', 0, 'u');
    const cUsed = stats.add('stack used', '0 B');
    const cSize = stats.add('frame-এর মাপ', frameSize + ' B');

    const svgEl = svg('svg', { viewBox: '0 0 800 150', class: 'wide', role: 'img',
      'aria-label': 'Top bar: the whole 8 MB stack region with the V8 limit at 1 MB and the guard page at the end; bottom bar: the first 1 MB zoomed in, filling as frames are pushed' });
    const g = svg('g');
    svgEl.appendChild(g);
    u.stage.appendChild(svgEl);

    const cols = el('div', { class: 'sim-cols w-12' });
    const codeP = panel(cols, 'node -e "…"');
    const code = codeList(['function f(n) { return f(n + 1) }', 'f(0)']);
    code.lines.forEach(function (s) { s.style.whiteSpace = 'pre-wrap'; });
    codeP.appendChild(code);
    const outP = panel(cols, 'output');
    const log = logPanel(outP, 10);
    let liveLine = null;
    u.stage.appendChild(cols);

    function maxDepth() { return Math.floor(V8_LIMIT / frameSize); }

    function setSize(v) { sizeR.set(v); frameSize = v; reset(); }

    function reset() {
      if (t) t.stop();
      depth = 0; over = false; liveLine = null;
      log.clear();
      outP.className = 'sim-panel';
      draw();
    }

    function tick() {
      if (over) { depth = 0; over = false; liveLine = null; log.clear(); outP.className = 'sim-panel'; }   // ▶ after the error runs it again
      push(PER_TICK);
    }

    function push(n) {
      // f(n) calls f(n + 1): every call pushes one more frame, nobody returns.
      // V8 throws when the next frame would cross its ~1 MB limit.
      if (over) return;
      const limit = maxDepth();
      depth = Math.min(limit, depth + n);
      if (depth >= limit) {
        over = true;
        if (t) t.stop();
        log.add('RangeError: Maximum call stack size exceeded', 'd');
        log.add('frame depth: ' + depth + '  (' + depth + ' × ' + frameSize + ' B = ' + fmtN(depth * frameSize) + ' B)', 'm');
        outP.className = 'sim-panel d';
      }
      draw();
    }

    function draw() {
      const used = depth * frameSize;
      cDepth.set(fmtN(depth), over ? 'd' : 'u');
      cUsed.set(bytes(used));
      cSize.set(frameSize + ' B');
      if (depth > 0 && !over) {
        if (!liveLine) liveLine = log.add('', 'u');
        liveLine.textContent = 'f(0) → f(1) → … → f(' + fmtN(depth - 1) + ')';
      }
      if (depth > 0) setLine(code, 0); else setLine(code, null);

      clear(g);
      const X = 40, W1 = 640, W2 = 720;             // bar 1: 8 MB over 640 px; bar 2: 1 MB over 720 px
      const fill = over ? 'f-d' : 'f-u';
      // the whole region, to scale
      g.appendChild(svg('text', { x: X, y: 13, class: 't-m t-s' }, 'the whole stack region — ulimit -s = 8 MB, then the guard page'));
      g.appendChild(svg('rect', { x: X, y: 22, width: W1, height: 20, rx: 3, class: 'b' }));
      for (let m = 2; m <= 8; m++) {
        const x = X + m * W1 / 8;
        if (m < 8) g.appendChild(svg('line', { x1: x, y1: 22, x2: x, y2: 42, class: 'grid' }));
        g.appendChild(svg('text', { x: x, y: 57, 'text-anchor': 'middle', class: 't-m t-s' }, m + (m === 8 ? ' MB' : '')));
      }
      g.appendChild(svg('rect', { x: X, y: 22, width: Math.max(0, used / OS_LIMIT * W1), height: 20, rx: 3, class: fill }));
      const v8x = X + W1 / 8;
      g.appendChild(svg('line', { x1: v8x, y1: 18, x2: v8x, y2: 46, class: 'ln-u dash' }));
      g.appendChild(svg('text', { x: v8x, y: 57, 'text-anchor': 'middle', class: 't-u t-s' }, 'V8 ~1 MB'));
      g.appendChild(svg('rect', { x: X + W1, y: 22, width: 20, height: 20, rx: 3, class: 'b-d' }));
      g.appendChild(svg('text', { x: X + W1 + 26, y: 36, class: 't-d t-s' }, 'guard page'));
      // zoom into the first 1 MB
      g.appendChild(svg('line', { x1: X, y1: 42, x2: X, y2: 86, class: 'ln dash' }));
      g.appendChild(svg('line', { x1: v8x, y1: 42, x2: X + W2, y2: 86, class: 'ln dash' }));
      g.appendChild(svg('text', { x: X + 4, y: 79, class: 't-m t-s' }, 'zoom ×8: the first 1 MB'));
      g.appendChild(svg('rect', { x: X, y: 86, width: W2, height: 26, rx: 3, class: 'b' }));
      g.appendChild(svg('rect', { x: X, y: 86, width: Math.max(0, used / V8_LIMIT * W2), height: 26, rx: 3, class: fill }));
      g.appendChild(svg('line', { x1: X + W2, y1: 80, x2: X + W2, y2: 118, class: over ? 'ln-d dash' : 'ln-u dash' }));
      g.appendChild(svg('text', { x: X + W2, y: 133, 'text-anchor': 'end', class: over ? 't-d' : 't-u t-s' }, over ? 'RangeError: Maximum call stack size exceeded' : 'V8 limit ~1 MB'));
      g.appendChild(svg('text', { x: X + 4, y: 133, class: 'mono' }, 'depth ' + fmtN(depth) + ' × ' + frameSize + ' B = ' + fmtN(used) + ' B'));

      const lim = maxDepth();
      if (over) {
        note(u, 'RangeError depth <b>' + fmtN(depth) + '</b>-এ (১ MB ÷ ' + frameSize + ' B)। frame ১১২ B → depth ≈ 9,362; ২০৮ B → ≈ 5,041 — একই ১ MB, frame যত বড় depth তত কম। V8 OS-এর ৮ MB guard page-এ পৌঁছানোর আগেই নিজে থামে, তাই এটা catch-যোগ্য RangeError, crash না। (আমার Mac-এ মাপা: small 9183, big 5009।)', 'd');
      } else if (depth > 0) {
        note(u, 'depth <b>' + fmtN(depth) + '</b> — stack ' + bytes(used) + ', V8-এর ~১ MB সীমার দিকে এগোচ্ছে; OS-এর ৮ MB আর guard page উপরের bar-এ, অনেক দূরে।');
      } else {
        note(u, '<code>f(0) → f(1) → f(2) …</code> কেউ return করে না, প্রতিটা call-এ একটা নতুন frame। <b>' + frameSize + ' B</b> frame-এ ১ MB-তে ধরবে ≈ <b>' + fmtN(lim) + '</b>টা। ▶ চাপো, বা slider-এ frame-এর মাপ বদলাও।');
      }
    }

    draw();
  }

  build();
}
