/* cpu.js — Chapter 4
   Fetch–decode–execute on a tiny arm64-flavoured CPU. Two programs built
   from the chapter's own material: the middle of hello's main (the otool
   listing — mov, str, adrp/add, bl _printf, then the frame bookkeeping
   and ret; the _printf stub reduced to its write syscall) and a 1..5
   summing loop that shows a taken and a not-taken branch.
   Every "→ ১ ধাপ" is ONE phase of the loop the chapter describes:
   fetch (read 4 bytes at PC) → decode (which op, which registers) →
   execute (registers change, stdout gets text) → PC update (PC + 4, or
   the jump target) → back to fetch.
*/

import { ui, select, range, button, playButton, ticker, note, chips, modeBadge, panel, table, codeList, logPanel, svg, el, hex, escapeHtml, flash } from './_lib.js';

const CALLER = 0x18d7b3b98;   // where main's caller (dyld) continues after ret — a plausible address
const FRAME = 0x16fdff2f8;    // the stack slot `str x8, [x9]` writes to (x9 holds sp here; frames are Chapter 5)
const STUB = 0x1000004a0;     // the chapter's bl target: the _printf symbol stub
const LOOP = 0x100000508;
const PHASES = ['Fetch', 'Decode', 'Execute', 'PC update'];
const SPEEDS = [900, 450, 180, 70];   // ms per phase, slider 1–4

function hd(n) { return hex(n) + (n < 256 ? ' (' + n + ')' : ''); }
function asm(l) { return l.op + (l.args ? ' ' + l.args : ''); }

/* Each instruction: addr · bytes (the chapter's real encoding where it gives one) · op/args · a short
   listing comment, plus decode(s) → text, exec(s) → { changed, text, out }, next(s) → new PC
   (absent = PC + 4), pcNote(s) → note html after the PC update, end → note html when the program
   returns to its caller. s is the CPU state: x0 x1 x8 x9 x30 pc Z mem. */
const PROGRAMS = {
  hello: {
    label: 'hello — main (chapter-এর snippet)',
    title: 'program · hello — main-এর মাঝের অংশ (otool -tvj)',
    start: 0x10000047c,
    regs: ['x0', 'x1', 'x8', 'x9', 'x30', 'pc'],
    init: { x0: 0, x1: 0, x8: 0, x9: FRAME, x30: CALLER, Z: 0, mem: null },
    mem: true,
    lines: [
      { addr: 0x10000047c, bytes: 'd2800548', op: 'mov', args: 'x8, #0x2a', cmt: '42',
        decode: function () { return 'x8 ← 0x2a — সংখ্যা 42 একটা register-এ বসাও'; },
        exec: function (s) { s.x8 = 0x2a; return { changed: ['x8'], text: 'x8 = 0x2a (42)' }; } },
      { addr: 0x100000480, bytes: 'f9000128', op: 'str', args: 'x8, [x9]', cmt: 'x8 → memory',
        decode: function (s) { return 'x8-এর মান memory-তে লেখো, ঠিকানা x9 = ' + hex(s.x9) + ' (stack frame-এর একটা ঘর)'; },
        exec: function (s) { s.mem = s.x8; return { changed: ['mem'], text: 'memory [' + hex(s.x9) + '] = ' + hd(s.x8) + ' — register থেকে memory-তে গেল, x8 যেমন ছিল' }; } },
      { addr: 0x100000484, bytes: '90000000', op: 'adrp', args: 'x0, 0', cmt: 'page address',
        decode: function () { return 'x0 ← PC যে page-এ আছে তার শুরু, 0x100000000 — একটা ঠিকানা গোনার প্রথম অর্ধেক'; },
        exec: function (s) { s.x0 = 0x100000000; return { changed: ['x0'], text: 'x0 = 0x100000000' }; } },
      { addr: 0x100000488, bytes: '9112b000', op: 'add', args: 'x0, x0, #0x4ac', cmt: 'string',
        decode: function (s) { return 'x0 ← x0 + 0x4ac = ' + hex(s.x0 + 0x4ac) + ' — "hello %d\\n" string-টা memory-তে যেখানে আছে'; },
        exec: function (s) { s.x0 = s.x0 + 0x4ac; return { changed: ['x0'], text: 'x0 = ' + hex(s.x0) + ' — printf-এর প্রথম argument তৈরি' }; } },
      { addr: 0x10000048c, bytes: '94000005', op: 'bl', args: hex(STUB), cmt: '_printf',
        decode: function (s) { return 'লাফ (branch with link): ফেরার ঠিকানা PC + 4 = ' + hex(s.pc + 4) + ' x30-এ রাখো, PC-কে পাঠাও ' + hex(STUB) + '-এ'; },
        exec: function (s) { s.x30 = s.pc + 4; return { changed: ['x30'], text: 'x30 = ' + hex(s.x30) + ' — ফেরার ঠিকানা জমা রইল' }; },
        next: function () { return STUB; },
        pcNote: function () { return '<b>bl</b>: ফেরার ঠিকানা <code>0x100000490</code> x30-এ রাখল, PC-কে printf-এ পাঠাল — PC + 4 না, সোজা <code>' + hex(STUB) + '</code>।'; } },
      { addr: 0x100000490, bytes: 'b9400be0', op: 'ldr', args: 'w0, [sp, #0x8]', cmt: '',
        decode: function () { return 'stack frame-এর একটা ঘর থেকে w0 ← 0 — return 0-এর মান (frame-এর খুঁটিনাটি Chapter 5-এ)'; },
        exec: function (s) { s.x0 = 0; return { changed: ['x0'], text: 'x0 = 0x0 (0) — main যা ফেরত দেবে' }; } },
      { addr: 0x100000494, bytes: 'a9417bfd', op: 'ldp', args: 'x29, x30, [sp, #0x10]', cmt: '',
        decode: function () { return 'stack frame থেকে x29, x30 ফেরত আনো (bookkeeping) — x30 আবার main-এর caller-এর ঠিকানা'; },
        exec: function (s) { s.x30 = CALLER; return { changed: ['x30'], text: 'x30 = ' + hex(CALLER) + ' — caller (dyld)-এর ঠিকানা, main শুরুর আগে যা ছিল' }; } },
      { addr: 0x100000498, bytes: '910083ff', op: 'add', args: 'sp, sp, #0x20', cmt: '',
        decode: function () { return 'sp ← sp + 0x20 — main-এর stack frame গুটিয়ে নাও (bookkeeping)'; },
        exec: function () { return { changed: [], text: 'sp বদলাল (এখানে দেখানো নেই) — বাকি register যেমন ছিল' }; } },
      { addr: 0x10000049c, bytes: 'd65f03c0', op: 'ret', args: '', cmt: 'end of main',
        decode: function (s) { return 'x30-এর ঠিকানায় ফিরে যাও: PC ← ' + hex(s.x30) + ' — main শেষ'; },
        exec: function () { return { changed: [], text: 'কিছু বদলাল না — লাফটা হবে PC update-এ' }; },
        next: function (s) { return s.x30; },
        end: 'main শেষ: <code>return 0</code> → <b>exit code 0</b>। CPU-র পুরো কাজ এটুকুই: fetch, decode, execute, PC সরাও — সে থামে না, এখন caller-এর (dyld) instruction fetch করছে; আমাদের program এখানেই শেষ।' },
      { label: '_printf', cmt: 'libc-র printf, সংক্ষেপে' },
      { addr: STUB, bytes: 'd4000001', op: 'svc', args: '#0', cmt: 'write(1, …)',
        decode: function () { return 'syscall: kernel mode-এ ঢুকে write(1, "hello 42\\n", 9) — printf-এর শেষ কাজটা kernel করে'; },
        exec: function (s) { s.x0 = 9; return { changed: ['x0'], out: 'hello 42', text: 'kernel stdout-এ লিখল "hello 42", x0 = 9 (যত byte লেখা হলো), user mode-এ ফেরত' }; } },
      { addr: STUB + 4, bytes: 'd65f03c0', op: 'ret', args: '', cmt: 'PC ← x30',
        decode: function (s) { return 'x30-এর ঠিকানায় ফিরে যাও: PC ← ' + hex(s.x30); },
        exec: function () { return { changed: [], text: 'কিছু বদলাল না — লাফটা হবে PC update-এ' }; },
        next: function (s) { return s.x30; },
        pcNote: function (s) { return '<b>ret</b>: x30-এর ঠিকানায় ফিরল — <code>' + hex(s.pc) + '</code>, bl-এর ঠিক পরের instruction।'; } }
    ]
  },
  loop: {
    label: 'loop — 1 থেকে 5 যোগ',
    title: 'program · loop — x0 = 1 + 2 + 3 + 4 + 5',
    start: 0x100000500,
    regs: ['x0', 'x1', 'x8', 'x30', 'pc', 'Z'],
    init: { x0: 0, x1: 0, x8: 0, x9: 0, x30: CALLER, Z: 0, mem: null },
    mem: false,
    lines: [
      { addr: 0x100000500, bytes: 'd2800000', op: 'mov', args: 'x0, #0', cmt: 'sum = 0',
        decode: function () { return 'x0 ← 0 — যোগফল (sum) শুরু শূন্য থেকে'; },
        exec: function (s) { s.x0 = 0; return { changed: ['x0'], text: 'x0 = 0x0 (0)' }; } },
      { addr: 0x100000504, bytes: 'd2800021', op: 'mov', args: 'x1, #1', cmt: 'i = 1',
        decode: function () { return 'x1 ← 1 — গোনার সংখ্যা (i)'; },
        exec: function (s) { s.x1 = 1; return { changed: ['x1'], text: 'x1 = 0x1 (1)' }; } },
      { label: 'loop' },
      { addr: LOOP, bytes: '8b010000', op: 'add', args: 'x0, x0, x1', cmt: 'sum += i',
        decode: function (s) { return 'x0 ← x0 + x1 = ' + s.x0 + ' + ' + s.x1 + ' = ' + (s.x0 + s.x1); },
        exec: function (s) { s.x0 += s.x1; return { changed: ['x0'], text: 'x0 = ' + hd(s.x0) }; } },
      { addr: LOOP + 4, bytes: '91000421', op: 'add', args: 'x1, x1, #1', cmt: 'i++',
        decode: function (s) { return 'x1 ← x1 + 1 = ' + (s.x1 + 1); },
        exec: function (s) { s.x1 += 1; return { changed: ['x1'], text: 'x1 = ' + hd(s.x1) }; } },
      { addr: LOOP + 8, bytes: 'f100183f', op: 'cmp', args: 'x1, #6', cmt: 'Z = (x1 == 6)',
        decode: function (s) { return 'x1 − 6 = ' + (s.x1 - 6) + ' → ফল শূন্য হলে Z = 1, নাহলে Z = 0 (কোনো register বদলায় না, শুধু flag)'; },
        exec: function (s) { s.Z = s.x1 === 6 ? 1 : 0; return { changed: ['Z'], text: 'Z = ' + s.Z + (s.Z ? ' — x1 = 6, ফল শূন্য' : ' — x1 = ' + s.x1 + ' ≠ 6') }; } },
      { addr: LOOP + 12, bytes: '54ffffa1', op: 'b.ne', args: hex(LOOP), cmt: 'if Z == 0',
        decode: function () { return 'branch if not equal: Z = 0 হলে PC ← ' + hex(LOOP) + ' (loop), নাহলে PC + 4'; },
        exec: function (s) { return { changed: [], text: s.Z ? 'Z = 1 → লাফ হবে না' : 'Z = 0 → লাফ হবে; সিদ্ধান্তটা কার্যকর হয় PC update-এ' }; },
        next: function (s) { return s.Z ? LOOP + 16 : LOOP; },
        pcNote: function (s) {
          return s.Z ? '<b>b.ne</b>: x1 = 6 → Z = 1 → লাফ হলো না, PC + 4 = <code>' + hex(LOOP + 16) + '</code>।'
            : '<b>b.ne</b>: Z = 0 (x1 = ' + s.x1 + ' ≠ 6) → লাফ: PC ফিরে গেল loop-এ, <code>' + hex(LOOP) + '</code> — PC + 4 না।';
        } },
      { addr: LOOP + 16, bytes: 'd65f03c0', op: 'ret', args: '', cmt: 'x0 = sum',
        decode: function (s) { return 'x30-এর ঠিকানায় ফিরে যাও: PC ← ' + hex(s.x30) + ' — ফল x0-তে'; },
        exec: function (s) { return { changed: [], text: 'কিছু বদলাল না — x0 = ' + hd(s.x0) + ' = 1+2+3+4+5' }; },
        next: function (s) { return s.x30; },
        end: '<b>ret</b>: x0 = 0xf = <b>15</b> = 1+2+3+4+5 নিয়ে caller-এর কাছে ফিরল। CPU-র পুরো কাজ এটুকুই: fetch, decode, execute, PC সরাও — থামে না।' }
    ]
  }
};

let seq = 0;

export function mount(root) {
  if (root.querySelector('.sim-body')) return;   // mounted already
  const u = ui(root);
  const mid = 'cpu-ah-' + (++seq);

  let prog = PROGRAMS.hello;
  let st = null;            // CPU state: registers, Z flag, the one memory cell
  let cur = null;           // the instruction being worked on
  let phase = -1;           // -1 before the first step; 0 fetch, 1 decode, 2 execute, 3 pc update
  let cycles = 0, executed = 0, halted = false;
  let changed = [];         // rows to mark after the last phase
  let byAddr = {}, lineAt = {};
  let code = null;

  const sel = select('Program', Object.keys(PROGRAMS).map(function (k) { return { value: k, label: PROGRAMS[k].label }; }), 'hello', function (v) { prog = PROGRAMS[v]; build(); });
  const t = ticker(root, step, SPEEDS[1]);
  const play = playButton(t);
  const stepBtn = button('→ ১ ধাপ', step);
  const speed = range('গতি', { min: 1, max: 4, value: 2, fmt: function (v) { return SPEEDS[v - 1] + ' ms'; } }, function (v) { t.setMs(SPEEDS[v - 1]); });
  u.controls.append(sel.el, play, stepBtn, button('↺ Reset', reset), speed.el);

  // counters above the stage
  const mode = modeBadge('user');
  const stats = chips(u.body);
  const cExec = stats.add('instruction চলেছে', 0, 'u');
  const cCyc = stats.add('cycle (phase)', 0);
  const cPc = stats.add('PC', '—', 'k');
  u.body.insertBefore(stats.el, u.stage);
  stats.el.insertBefore(mode.el, stats.el.firstChild);

  // stage: program + readout + stdout on the left, the CPU loop + registers on the right
  const cols = el('div', { class: 'sim-cols w-21' });
  const left = el('div', { style: { display: 'grid', gap: '10px', minWidth: '0' } });
  const right = el('div', { style: { display: 'grid', gap: '10px', minWidth: '0', alignContent: 'start' } });
  cols.append(left, right);
  u.stage.appendChild(cols);

  const codeTitle = el('div', { class: 'sim-panel-title' });
  const codeBox = el('div', null, codeTitle);
  left.appendChild(codeBox);
  const readout = logPanel(panel(left, 'CPU — এই instruction-এর ৪ phase'), 4);

  const svgEl = svg('svg', { viewBox: '0 0 240 112', role: 'img', 'aria-label': 'The CPU loop: fetch, decode, execute, PC update, and back to fetch', style: { maxWidth: '300px' } });
  svgEl.appendChild(svg('defs', null,
    svg('marker', { id: mid, viewBox: '0 0 10 10', refX: 9, refY: 5, markerWidth: 7, markerHeight: 7, orient: 'auto-start-reverse' },
      svg('path', { class: 'ah', d: 'M0 0L10 5L0 10z' }))));
  const BOX = [{ x: 6, y: 6 }, { x: 132, y: 6 }, { x: 132, y: 66 }, { x: 6, y: 66 }];
  const boxes = BOX.map(function (b, i) {
    const r = svg('rect', { x: b.x, y: b.y, width: 102, height: 40, rx: 7, class: 'b' });
    svgEl.append(r,
      svg('text', { x: b.x + 8, y: b.y + 14, class: 't-m t-s' }, String(i + 1)),
      svg('text', { x: b.x + 51, y: b.y + 25, 'text-anchor': 'middle', class: 't-h' }, PHASES[i]));
    return r;
  });
  ['M108 26 H130', 'M183 46 V64', 'M132 86 H110', 'M57 66 V48'].forEach(function (d) {
    svgEl.appendChild(svg('path', { d: d, class: 'ln', 'marker-end': 'url(#' + mid + ')' }));
  });
  right.appendChild(svgEl);
  const regTable = table(['register', 'value'], []);
  panel(right, 'registers').appendChild(regTable);
  const memTable = table(['address', 'value'], []);
  const memPanel = panel(null, 'memory [x9]');   // hello only: the cell str writes to
  memPanel.appendChild(memTable);
  const stdoutPanel = panel(right, 'stdout');
  const stdout = logPanel(stdoutPanel, 8);

  // address · bytes · mnemonic · operands · comment, every part in a syntax class so the current-line
  // highlight (which recolours plain text) never hides a column
  function lineHtml(l) {
    if (l.label) return { html: '<span class="fn">' + escapeHtml(l.label) + ':</span>' + (l.cmt ? '  <span class="c">; ' + escapeHtml(l.cmt) + '</span>' : '') };
    let s = '<span class="c">' + escapeHtml(hex(l.addr)) + '</span> <span class="n">' + l.bytes + '</span>  <span class="k">' + (l.op + '    ').slice(0, 4) + '</span>' + (l.args ? ' <span class="fn">' + escapeHtml(l.args) + '</span>' : '');
    if (l.cmt) s += '  <span class="c">; ' + escapeHtml(l.cmt) + '</span>';
    return { html: s };
  }

  function build() {
    byAddr = {}; lineAt = {};
    prog.lines.forEach(function (l, i) { if (l.addr !== undefined) { byAddr[l.addr] = l; lineAt[l.addr] = i; } });
    if (code) code.remove();
    code = codeList(prog.lines.map(lineHtml));
    codeBox.appendChild(code);
    codeTitle.textContent = prog.title;
    if (prog.mem) right.insertBefore(memPanel, stdoutPanel); else memPanel.remove();
    reset();
  }

  function reset() {
    t.stop();
    st = Object.assign({ pc: prog.start }, prog.init);
    cur = null; phase = -1; cycles = 0; executed = 0; halted = false; changed = [];
    readout.clear(); stdout.clear();
    draw();
    note(u, 'Program বেছে <b>→ ১ ধাপ</b> চাপো — প্রতিটা ধাপ CPU-র loop-এর একটা phase: fetch, decode, execute, PC update। <b>▶ চালাও</b> দিলে নিজে নিজে চলে।');
  }

  function step() {
    if (halted) { t.stop(); return; }
    phase = (phase + 1) % 4;
    cycles++;
    const s = st;
    if (phase === 0) {
      // Fetch: the 4 bytes at PC — to the CPU an instruction is just this number
      cur = byAddr[s.pc];
      changed = [];
      readout.clear();
      readout.add('fetch    [' + hex(s.pc) + '] → ' + cur.bytes, 'm');
      note(u, '<b>Fetch</b>: PC = <code>' + hex(s.pc) + '</code> — memory থেকে সেখানকার ৪ byte পড়ল: <code>' + cur.bytes + '</code>।' + (executed === 0 ? ' CPU-র কাছে instruction মানে এই সংখ্যাটাই।' : ''));
    } else if (phase === 1) {
      // Decode: which op, which registers — nothing changes yet
      const d = cur.decode(s);
      readout.add('decode   ' + asm(cur) + '  →  ' + d, 'u');
      note(u, '<b>Decode</b>: <code>' + cur.bytes + '</code> ভেঙে — <code>' + escapeHtml(asm(cur)) + '</code>: ' + escapeHtml(d) + '।' + (executed === 0 ? ' এখনো কিছু বদলায়নি।' : ''));
    } else if (phase === 2) {
      // Execute: registers change, stdout gets text; a syscall means kernel mode for a moment
      const r = cur.exec(s);
      changed = r.changed;
      executed++;
      if (r.out) stdout.add(r.out);
      readout.add('execute  ' + r.text, 'ok');
      note(u, '<b>Execute</b>: ' + escapeHtml(r.text) + '।', cur.op === 'svc' ? 'k' : 'ok');
    } else {
      // PC update: PC + 4, or the jump target
      const from = s.pc;
      const to = cur.next ? cur.next(s) : from + 4;
      const jumped = to !== from + 4;
      s.pc = to;
      changed = ['pc'];
      readout.add('pc       ' + (jumped ? hex(from) + ' → ' + hex(to) + '  (লাফ — PC + 4 না)' : hex(from) + ' + 4 → ' + hex(to)), 'k');
      if (!byAddr[to]) {
        halted = true;
        t.stop();
        note(u, cur.end || '', 'ok');
      } else if (cur.pcNote) {
        note(u, cur.pcNote(s), jumped ? 'k' : '');
      } else {
        note(u, '<b>PC update</b>: PC + 4 = <code>' + hex(to) + '</code> — arm64-এ প্রতিটা instruction ঠিক ৪ byte।');
      }
    }
    draw();
  }

  function draw() {
    const li = halted ? undefined : lineAt[st.pc];
    code.current(li === undefined ? null : li);
    code.lines.forEach(function (ln) { ln.classList.remove('done'); });   // memory order says nothing about what already ran
    if (phase === 0 && li !== undefined) { const b = code.lines[li].querySelector('.n'); if (b) flash(b); }
    if (phase === 3 && li !== undefined) flash(code.lines[li]);

    boxes.forEach(function (r, i) {
      const on = !halted && i === phase;
      r.setAttribute('class', on ? 'b-u' : 'b');
      if (on) flash(r);
    });

    regTable.setRows(prog.regs.map(function (r) {
      const v = r === 'pc' ? hex(st.pc) : r === 'Z' ? String(st.Z) : hd(st[r]);
      const name = r === 'x30' ? 'x30 (lr)' : r === 'Z' ? 'Z (flag)' : r;
      return { cells: [name, v], class: changed.indexOf(r) > -1 ? 'changed' : null };
    }));
    memTable.setRows([{ cells: [hex(FRAME), st.mem === null ? { text: '—', class: 'm' } : hd(st.mem)], class: changed.indexOf('mem') > -1 ? 'changed' : null }]);
    [regTable, memTable].forEach(function (tb) { tb.querySelectorAll('tr.changed').forEach(flash); });

    cExec.set(executed);
    cCyc.set(cycles);
    cPc.set(hex(st.pc));
    mode.set(phase === 2 && cur && cur.op === 'svc' ? 'kernel' : 'user');
    stepBtn.disabled = halted;
    play.disabled = halted;
  }

  build();
}
