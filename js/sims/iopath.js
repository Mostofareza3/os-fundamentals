/* iopath.js — Chapter 2
   One fs.readFileSync('config.json') end to end: the chapter's eight
   numbered steps as a stepper, drawn as the chapter's sequence figure
   (app.js · Node | Kernel | SSD controller). Every step says who is
   working, whether your process is running or sleeping, whose code the
   CPU is running, and a coarse cumulative time (≈). With the file already
   in the page cache (a second read) steps 4–6 disappear — no driver, no
   sleep, no SSD — and the same syscall costs ≈ 3 µs instead of ≈ 100 µs
   of waiting.
*/

import { ui, checkbox, stepper, note, modeBadge, logPanel, panel, chips, svg, el, clear } from './_lib.js';

/* coarse per-step times in µs — only the SSD's ≈ 100 µs is the chapter's number */
const T = { entry: 0.2, fs: 1, cache: 0.2, driver: 1, ssd: 100, handler: 1, ret: 0.2 };

/* stage geometry (SVG units): three lanes, like the chapter figure */
const W = 480;
const X = { node: 73, kernel: 240, ssd: 407 };          // lane centres
const HEADS = [
  { id: 'node', x: 8, w: 130, cls: 'b-u', label: 'app.js · Node' },
  { id: 'kernel', x: 150, w: 180, cls: 'b-k', label: 'Kernel' },
  { id: 'ssd', x: 342, w: 130, cls: 'b', label: 'SSD controller' }
];
const BOUNDARY = 144;                                    // the system call boundary
const KBOX = { x: 150, w: 180 };                         // a box in the kernel lane
const SBOX = { x: 347, w: 120 };                         // a box in the SSD lane
const Y0 = 64;                                           // first row
const FOOT = 26;
const BAND = { node: { cls: 'f-u', op: 0.12 }, kernel: { cls: 'f-k', op: 0.12 }, ssd: { cls: 'f-m', op: 0.3 } };
const CPU = {
  you: { label: 'তোমার process', kind: 'u' },
  kernel: { label: 'kernel', kind: 'k' },
  other: { label: 'অন্য process', kind: 'ok' }
};

let seq = 0;

/* ---------- drawing primitives ---------- */

function box(g, x, w, y, h, lines, cls, cx) {
  // a solid underlay first: the coloured fills are translucent and the lifeline runs beneath
  g.appendChild(svg('rect', { x: x, y: y, width: w, height: h, rx: 6, class: 'f-p' }));
  g.appendChild(svg('rect', { x: x, y: y, width: w, height: h, rx: 6, class: cls }));
  lines.forEach(function (l, i) {
    const text = typeof l === 'string' ? l : l.text;
    const tcls = typeof l === 'string' ? 't-s' : l.cls;
    g.appendChild(svg('text', { x: cx, y: y + h / 2 + (i - (lines.length - 1) / 2) * 16 + 4, 'text-anchor': 'middle', class: tcls }, text));
  });
}
function kbox(g, y, h, lines, cls) { box(g, KBOX.x, KBOX.w, y, h, lines, cls || 'b-k', X.kernel); }
function sbox(g, y, h, lines) { box(g, SBOX.x, SBOX.w, y, h, lines, 'b', X.ssd); }
/* an arrow with a label above it; m holds the marker ids and the halo layer.
   The halo is a panel-coloured rect under the label so the dashed lifelines
   do not run through the words (it sits below the row band, so it stays invisible). */
function arrow(g, m, y, x1, x2, cls, mk, label, lcls, lx, anchor) {
  g.appendChild(svg('line', { x1: x1, y1: y, x2: x2, y2: y, class: cls, 'marker-end': 'url(#' + m[mk] + ')' }));
  if (!label) return;
  const w = label.length * 6 + 8;
  const hx = anchor === 'end' ? lx - w + 4 : anchor === 'start' ? lx - 4 : lx - w / 2;
  m.halos.appendChild(svg('rect', { x: hx, y: y - 18, width: w, height: 14, rx: 3, class: 'f-p' }));
  g.appendChild(svg('text', { x: lx, y: y - 7, 'text-anchor': anchor || 'middle', class: lcls }, label));
}

/* ---------- the steps ----------
   num: the chapter's number (the hit path keeps 1 2 3 7 8 — "থাকলে সোজা ধাপ ৭-এ")
   actor: who works now · mode: CPU mode after the step · proc: your process
   cpu: whose code the CPU runs · dt: coarse time · h: row height in the SVG */

function makeSteps(hit) {
  const syscall = {
    num: 1, title: 'User space: syscall (openat, read)', detail: 'CPU kernel mode-এ ঢোকে',
    kind: '', actor: 'node', mode: 'kernel', proc: 'running', cpu: 'kernel', dt: T.entry, h: 42,
    note: ['Node file খোলার আর পড়ার জন্য syscall করল — Chapter 1-এর <code>strace</code>-এ দেখা <code>openat</code> আর <code>read</code>। CPU <b>kernel mode</b>-এ ঢুকল: এখন থেকে kernel-এর code চলছে, তোমার না।', 'k'],
    draw: function (g, y, m) { arrow(g, m, y + 28, X.node + 8, X.kernel - 10, 'ln-k', 'k', 'syscall: openat, read', 't-k t-s', BOUNDARY + 12); }
  };
  const fs = {
    num: 2, title: 'File system: নাম → block', detail: null,
    kind: 'k', actor: 'kernel', mode: 'kernel', proc: 'running', cpu: 'kernel', dt: T.fs, h: 46,
    note: ['File system <code>config.json</code> নামটা থেকে বের করল storage-এর কোন কোন block-এ file-টা আছে। CPU এখনো kernel mode-এ, তোমার process-এর হয়েই কাজ চলছে — শুধু code-টা kernel-এর।', 'k'],
    draw: function (g, y) { kbox(g, y + 5, 34, ['file system: name → blocks']); }
  };
  const cache = hit ? {
    num: 3, title: 'Page cache: RAM-এ আছে?', detail: 'আছে — সোজা ধাপ ৭-এ',
    kind: 'k', actor: 'kernel', mode: 'kernel', proc: 'running', cpu: 'kernel', dt: T.cache, h: 46,
    note: ['Page cache-এ data আগে থেকেই আছে — file-টা সম্প্রতি পড়া হয়েছিল। Storage-এ যাওয়ার দরকার নেই: driver, SSD, ঘুম — সব বাদ, সোজা copy-র ধাপে।', 'ok'],
    draw: function (g, y) { kbox(g, y + 5, 34, ['page cache: in RAM? — yes'], 'b-ok'); }
  } : {
    num: 3, title: 'Page cache: RAM-এ আছে?', detail: 'এবার নেই',
    kind: 'k', actor: 'kernel', mode: 'kernel', proc: 'running', cpu: 'kernel', dt: T.cache, h: 46,
    note: ['Kernel সম্প্রতি পড়া file-এর data RAM-এ রেখে দেয় — এই জায়গার নাম <b>page cache</b> — যাতে পরেরবার storage-এ যেতে না হয়। এবার নেই, তাই storage-এ যেতেই হবে।', 'k'],
    draw: function (g, y) { kbox(g, y + 5, 34, ['page cache: in RAM? — no']); }
  };
  const driver = {
    num: 4, title: 'Driver: register-এ command', detail: '"block পড়ো, RAM-এ রাখো"',
    kind: 'k', actor: 'kernel', mode: 'kernel', proc: 'running', cpu: 'kernel', dt: T.driver, h: 68,
    note: ['Driver — kernel-এর ভেতরের যে code এই controller-এর ভাষা জানে — controller-এর register-এ একটা সরল command লিখল: "এই block গুলো পড়ো, RAM-এর এই address-এ রাখো"। বাকিটা controller নিজে করবে।', 'k'],
    draw: function (g, y, m) {
      kbox(g, y + 5, 34, ['driver: write command']);
      arrow(g, m, y + 58, KBOX.x + KBOX.w + 4, X.ssd - 6, 'ln', 'a', 'read blocks 88210–88213', 't-s', SBOX.x + SBOX.w, 'end');
    }
  };
  const sleep = {
    num: 5, title: 'Process ঘুমায়, CPU অন্য কাউকে', detail: 'CPU বসে থাকে না',
    kind: 'k', actor: 'kernel', mode: 'user', proc: 'sleeping', cpu: 'other', dt: 0, h: 44,
    note: ['Kernel তোমার process-কে ঘুম পাড়িয়ে দিল আর CPU-তে অন্য কাউকে বসাল। অপেক্ষা করছে <b>তোমার process</b>, CPU না — CPU এখন অন্য process-এর code চালাচ্ছে।', ''],
    draw: function (g, y) { kbox(g, y + 5, 34, ['sleep process, run another']); }
  };
  const ssd = {
    num: 6, title: 'SSD: flash → RAM (DMA), interrupt', detail: '≈ 100 µs',
    kind: '', actor: 'ssd', mode: 'user', proc: 'sleeping', cpu: 'other', dt: T.ssd, h: 100,
    note: ['Controller flash থেকে data পড়ে <b>সরাসরি RAM-এ</b> লিখল (DMA) — CPU-কে byte byte copy করতে হয়নি। প্রায় ১০০ µs পর কাজ শেষ: controller interrupt পাঠাল।', ''],
    draw: function (g, y, m) {
      sbox(g, y + 5, 44, ['fetch from flash', { text: '≈ 100 µs', cls: 't-m t-s' }]);
      arrow(g, m, y + 68, X.ssd - 6, KBOX.x + KBOX.w + 6, 'ln', 'a', 'DMA: data written to RAM', 't-s', SBOX.x + SBOX.w, 'end');
      arrow(g, m, y + 92, X.ssd - 6, KBOX.x + KBOX.w + 6, 'ln-d dash', 'd', 'interrupt: done!', 't-d t-s', SBOX.x + SBOX.w, 'end');
    }
  };
  const handler = {
    num: 7, title: 'Interrupt handler: copy, জাগানো', detail: null,
    kind: 'k', actor: 'kernel', mode: 'kernel', proc: 'running', cpu: 'kernel', dt: T.handler, h: 58,
    note: ['Interrupt: CPU হাতের কাজ থামিয়ে kernel-এর handler-এ লাফ দিল। Handler দেখল data এসেছে, সেটা Node-এর নিজের memory-তে (যেটা user mode থেকে ছোঁয়া যায়) copy করল, আর তোমার process-কে জাগাল।', 'k'],
    draw: function (g, y) { kbox(g, y + 5, 46, ['handler: copy data into', "Node's buffer, wake process"]); }
  };
  const copy = {
    num: 7, title: 'Copy: RAM → Node-এর memory', detail: 'ঘুম পাড়াতে হয়নি',
    kind: 'k', actor: 'kernel', mode: 'kernel', proc: 'running', cpu: 'kernel', dt: T.handler, h: 58,
    note: ['Data RAM-এ (page cache) আগে থেকেই ছিল — kernel সেটা Node-এর নিজের memory-তে copy করে দিল। কোনো driver, কোনো interrupt, কোনো ঘুম না।', 'ok'],
    draw: function (g, y) { kbox(g, y + 5, 46, ['copy from page cache', "into Node's buffer"], 'b-ok'); }
  };
  const ret = {
    num: 8, title: 'ফেরা: user mode, হাতে Buffer', detail: 'read = 14 bytes',
    kind: '', actor: 'node', mode: 'user', proc: 'running', cpu: 'you', dt: T.ret, h: 44,
    note: ['', 'ok'],
    draw: function (g, y, m) { arrow(g, m, y + 28, X.kernel - 10, X.node + 8, 'ln-u', 'u', 'return: 14 bytes', 't-u t-s', BOUNDARY + 12); }
  };
  return hit ? [syscall, fs, cache, copy, ret] : [syscall, fs, cache, driver, sleep, ssd, handler, ret];
}

export function mount(root) {
  if (root.querySelector('.sim-body')) return;          // mounted already
  const u = ui(root);
  const uid = 'iop' + (++seq);
  let hit = false;
  let current = [];
  let step = null;

  const cb = checkbox('page cache-এ আগে থেকে আছে (দ্বিতীয়বার পড়া)', false, function (v) { hit = v; build(); });
  u.controls.appendChild(cb.el);

  // state chips above the stage: CPU mode, your process, whose code runs, time so far
  const mode = modeBadge('user');
  const counters = chips(u.body);
  const cProc = counters.add('process', 'running', 'u');
  const cCpu = counters.add('CPU চালাচ্ছে', CPU.you.label, 'u');
  const cTime = counters.add('সময়', '≈ 0 µs');
  u.body.insertBefore(counters.el, u.stage);
  counters.el.insertBefore(mode.el, counters.el.firstChild);

  const cols = el('div', { class: 'sim-cols w-12' });
  const left = panel(cols, 'ধাপ');
  const right = panel(cols, 'কে কী করছে — উপর থেকে নিচে সময়');
  right.style.overflowX = 'auto';                       // on a phone the drawing scrolls inside its panel
  const svgEl = svg('svg', { viewBox: '0 0 ' + W + ' 100', role: 'img', style: 'min-width:380px',
    'aria-label': 'Sequence of the readFileSync call across app.js · Node, the kernel and the SSD controller; the step being explained is highlighted' });
  right.appendChild(svgEl);
  right.appendChild(el('div', { class: 'sim-panel-title', style: { marginTop: '10px' } }, 'strace-এর চোখে'));
  const log = logPanel(right, 10);
  u.stage.appendChild(cols);

  function markers() {
    const ids = {};
    const defs = svg('defs');
    [['a', 'ah'], ['u', 'ah-u'], ['k', 'ah-k'], ['d', 'ah-d']].forEach(function (p) {
      ids[p[0]] = uid + '-' + p[0];
      defs.appendChild(svg('marker', { id: ids[p[0]], viewBox: '0 0 10 10', refX: 9, refY: 5, markerWidth: 7, markerHeight: 7, orient: 'auto-start-reverse' },
        svg('path', { class: p[1], d: 'M0 0L10 5L0 10z' })));
    });
    svgEl.appendChild(defs);
    return ids;
  }

  function draw(i) {
    const steps = current;
    clear(svgEl);
    const m = markers();
    const ys = [];
    let y = Y0;
    steps.forEach(function (s) { ys.push(y); y += s.h; });
    const H = y + FOOT;
    svgEl.setAttribute('viewBox', '0 0 ' + W + ' ' + H);

    // lifelines and the system call boundary
    ['node', 'kernel', 'ssd'].forEach(function (k) {
      svgEl.appendChild(svg('line', { x1: X[k], y1: 56, x2: X[k], y2: H - FOOT + 8, class: 'ln dash' }));
    });
    svgEl.appendChild(svg('line', { x1: BOUNDARY, y1: 10, x2: BOUNDARY, y2: H - FOOT + 8, class: 'ln-k dash' }));
    svgEl.appendChild(svg('text', { x: BOUNDARY, y: H - 7, 'text-anchor': 'middle', class: 't-k t-s' }, 'system call boundary'));

    // label halos live here: above the lifelines, below the band and the rows
    m.halos = svg('g');
    svgEl.appendChild(m.halos);

    // a band behind the current row
    if (i >= 0) {
      const b = BAND[steps[i].actor];
      svgEl.appendChild(svg('rect', { x: 4, y: ys[i], width: W - 8, height: steps[i].h, rx: 8, class: b.cls, opacity: b.op }));
    }

    // the three actors: the working one lit, the others dimmed
    const active = i < 0 ? 'node' : steps[i].actor;
    HEADS.forEach(function (h) {
      svgEl.appendChild(svg('g', { class: h.id === active ? null : 'dim' },
        svg('rect', { x: h.x, y: 14, width: h.w, height: 40, rx: 8, class: 'f-p' }),
        svg('rect', { x: h.x, y: 14, width: h.w, height: 40, rx: 8, class: h.cls }),
        svg('text', { x: h.x + h.w / 2, y: 39, 'text-anchor': 'middle', class: 't-h' }, h.label)));
    });

    // the grey bar in the Node lane: your process sleeps from step 5 until the handler wakes it
    const si = steps.findIndex(function (s) { return s.proc === 'sleeping'; });
    if (si >= 0 && i >= si) {
      let end = si;
      while (end + 1 < steps.length && end + 1 <= i && steps[end + 1].proc === 'sleeping') end++;
      if (end + 1 <= i) end++;                          // the row of the handler that wakes it
      const top = ys[si] + 4, bottom = ys[end] + steps[end].h - 4;
      svgEl.appendChild(svg('rect', { x: X.node - 10, y: top, width: 20, height: bottom - top, rx: 4, class: 'b-m' }));
      const tall = bottom - top;
      if (tall >= 60) {
        const cx = X.node + 4, cy = (top + bottom) / 2;
        svgEl.appendChild(svg('text', { x: cx, y: cy, 'text-anchor': 'middle', class: 't-m t-s', transform: 'rotate(-90 ' + cx + ' ' + cy + ')' },
          tall >= 150 ? 'sleeping — CPU runs other work' : 'sleeping'));
      }
    }

    // the rows up to the current step; the current one flashes
    steps.forEach(function (s, j) {
      if (j > i) return;
      const g = svg('g', { class: j === i ? 'flash' : null });
      s.draw(g, ys[j], m);
      svgEl.appendChild(g);
    });
  }

  function drawLog(i, last) {
    log.clear();
    if (i < 0) return;
    log.add("[user]   readFileSync('config.json')", 'u');
    log.add('[kernel] openat(AT_FDCWD, "config.json", O_RDONLY|O_LARGEFILE|O_CLOEXEC) = 17', 'k');
    if (i < last) log.add('[kernel] read(17, …   (syscall not returned yet)', 'm');
    else {
      log.add('[kernel] read(17, "{\\"port\\":3000}\\n", 14) = 14', 'k');
      log.add('[user]   → Buffer (14 bytes)', 'u');
    }
  }

  function render(i, s) {
    const steps = current;
    const last = steps.length - 1;
    const st = i < 0 ? { mode: 'user', proc: 'running', cpu: 'you' } : steps[i];
    let t = 0;
    for (let j = 0; j <= i; j++) t += steps[j].dt;
    t = Math.round(t * 10) / 10;

    mode.set(st.mode);
    cProc.set(st.proc, st.proc === 'running' ? 'u' : '');
    cCpu.set(CPU[st.cpu].label, CPU[st.cpu].kind);
    cTime.set('≈ ' + t + ' µs');
    draw(i);
    drawLog(i, last);

    if (i < 0) {
      note(u, hit
        ? 'এবার file-টা page cache-এ আগে থেকেই আছে (দ্বিতীয়বার পড়া)। "→ পরের ধাপ" চাপো — দেখো ধাপ ৩-এর পর পথটা কোথায় ছোট হয়ে যায়।'
        : 'Chapter-এর ৮টা ধাপ, একটা একটা করে: "→ পরের ধাপ" চাপো। ডানে chapter-এর ছবিটা ধাপে ধাপে আঁকা হবে; উপরের chip-এ তোমার process কোন অবস্থায় আর CPU কার হাতে।');
    } else if (i === last) {
      note(u, hit
        ? '<code>read</code> ফিরল, হাতে সেই 14 byte-এর <code>Buffer</code>। মোট ≈ ' + t + ' µs — SSD-র কাছে যেতেই হয়নি, তবু syscall আর kernel mode-এ ঢোকা-বেরোনো লেগেছে।'
        : '<code>read</code> result নিয়ে ফিরল, CPU আবার user mode-এ, <code>readFileSync</code> দিল 14 byte-এর <code>Buffer</code>। মোট ≈ ' + t + ' µs, তার ১০০ µs SSD-র অপেক্ষা — সেই সময় তোমার process ঘুমিয়ে, CPU অন্য process চালাচ্ছে।', 'ok');
    } else {
      note(u, s.note[0], s.note[1]);
    }
  }

  function build() {
    // remove the previous stepper's buttons and list (the checkbox changes the path)
    if (step) { Object.keys(step.buttons).forEach(function (k) { step.buttons[k].remove(); }); left.removeChild(step.list); }
    current = makeSteps(hit);
    step = stepper(u.controls, current, render);
    // keep the chapter's numbering: the hit path reads 1 2 3 7 8
    Array.prototype.forEach.call(step.list.children, function (li, j) { li.firstChild.textContent = String(current[j].num); });
    left.appendChild(step.list);
  }

  build();
}
