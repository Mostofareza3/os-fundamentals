/* execve.js — Chapter 4
   The loader, step by step. zsh (PID 3990) has forked a child, PID 5120,
   which is still a copy of zsh. The child calls execve("./hello"): the
   kernel checks the file (exists, magic 7f 45 4c 46 = ELF, execute
   permission), drops the old memory, maps the ELF segments from the header
   (code R E 0x884 bytes, data RW 0x270 bytes), builds the stack (argv,
   envp), sets the PC to the dynamic linker's entry and returns to user
   mode. ld.so maps libc.so.6 and fills in printf's address, _start calls
   main, printf → write(1, "hello 42\n", 9), return 0 → exit code 0 back to
   zsh. The PID never changes. With "chmod -x hello" the loader's check
   fails: execve returns -1 EACCES and the child is still zsh's copy.
   Every render recomputes the state from the first step, so stepping
   backwards stays right.
*/

import { ui, checkbox, stepper, note, modeBadge, logPanel, panel, el, svg, clear, chips, flash } from './_lib.js';

/* ---------- drawing geometry ----------
   wide (desktop, inside the 2fr column): the address-space column on the left,
   the file on disk and the terminal stacked on the right.
   narrow (phone, the grid collapsed): everything in one column, drawn 1:1. */
const SLOT = {                       // y of each region of the address space (kernel at the top)
  kernel: { y: 24, h: 30 },
  stack: { y: 60, h: 48 },
  free1: { y: 114, h: 24 },
  ldso: { y: 144, h: 31 },
  libc: { y: 179, h: 31 },
  free2: { y: 216, h: 24 },
  heap: { y: 246, h: 30 },
  data: { y: 282, h: 44 },
  code: { y: 332, h: 58 }
};
const COL_H = 414;                   // the column incl. its bottom label
const FILE_H = 182;
const FILE_LINE = { load1: 90, load2: 108, interp: 144, libc: 164 };   // where an arrow leaves a line of the file box (from its top)

function geo(narrow) {
  if (narrow) {
    return { W: 340, H: 728, narrow: true,
      COL: { x: 24, w: 292 },
      FILE: { x: 24, y: COL_H, w: 292, h: FILE_H },
      TERM: { x: 24, y: COL_H + FILE_H + 12, w: 292, h: 110 } };
  }
  return { W: 480, H: COL_H, narrow: false,
    COL: { x: 14, w: 206 },
    FILE: { x: 250, y: 24, w: 216, h: FILE_H },
    TERM: { x: 250, y: 226, w: 216, h: 178 } };
}

/* the child at the start: still a copy of zsh */
function zshRegions() {
  return {
    stack: { name: 'stack · zsh', lines: ["zsh's argv, envp"] },
    zshlibs: { name: 'shared libraries · zsh', lines: ['libc.so.6 …'] },
    heap: { name: 'heap · zsh', lines: [] },
    data: { name: 'data · zsh', lines: ['RW'] },
    code: { name: 'code · zsh', lines: ['R E'] }
  };
}

function initial(denied) {
  return {
    denied: denied,
    mode: 'user', program: 'zsh (copy)', progKind: '', pc: '—', pcAt: null, kernelWhat: 'loader',
    regions: zshRegions(), checks: null, fresh: [], arrows: [], dimAll: false, flashPid: false,
    log: [], term: [{ text: '$ ./hello', cls: '' }]
  };
}

/* ---------- the steps (chapter: loader ধাপ ১–৫, then ld.so → main → printf → exit) ---------- */
function stepExecve() {
  return {
    title: 'execve syscall — kernel mode-এ', detail: 'execve("./hello", …)', kind: 'k',
    apply: function (st) {
      st.mode = 'kernel'; st.pcAt = 'kernel'; st.kernelWhat = 'loader';
      st.log.push(['[user]   execve("./hello", ["./hello"], envp)', 'u'], ['[cpu]    svc → kernel mode, loader starts', 'm']);
    },
    note: ['<code>execve</code> মানে: "আমার ভেতরের পুরনো program ফেলে দাও, এই file-টা চালাও।" syscall — CPU এখন <b>kernel mode</b>-এ, kernel-এর <b>loader</b> কাজ শুরু করল।', 'k']
  };
}

function helloSteps() {
  return [
    stepExecve(),
    {
      title: 'Loader-এর যাচাই', detail: 'file? magic? x permission?', kind: 'k',
      apply: function (st) {
        st.checks = { exists: true, magic: true, x: true };
        st.log.push(['[loader] ./hello: exists ✓  magic 7f 45 4c 46 = ELF ✓  x permission ✓', 'k']);
      },
      note: ['যাচাই তিনটা: file আছে, magic number <code>7f 45 4c 46</code> = ELF, আর execute permission — সবই ✓। এর যেকোনোটা ভুল হলে loader এখানেই থামত।', 'k']
    },
    {
      title: 'পুরনো memory ফেলে দেওয়া', detail: 'ফাঁকা address space', kind: 'k',
      apply: function (st) {
        st.regions = {}; st.program = 'zsh → hello'; st.progKind = 'k';
        st.log.push(['[loader] drop old memory → empty address space (PID 5120 unchanged)', 'k']);
      },
      note: ['পুরনো program-এর memory গেল — কিন্তু process-টা একই, <b>PID 5120</b>।', 'k']
    },
    {
      title: 'Segment map করা', detail: 'LOAD R E → code · RW → data', kind: 'k',
      apply: function (st) {
        st.regions.code = { name: 'code', lines: ['R E · 0x884 bytes · entry 0x640', { text: 'printf: U (hole)', cls: 't-d' }] };
        st.regions.data = { name: 'data', lines: ['RW · 0x270 bytes'] };
        st.regions.heap = { name: 'heap · empty', lines: [], empty: true };
        st.fresh = ['code', 'data'];
        st.arrows = [{ from: 'load1', to: 'code', cls: 'k' }, { from: 'load2', to: 'data', cls: 'k' }];
        st.log.push(['[loader] map LOAD R E (0x884 bytes) → code', 'k'], ['[loader] map LOAD RW  (0x270 bytes) → data', 'k']);
      },
      note: ['header-এর দুইটা <code>LOAD</code> → দুইটা segment, নিজ নিজ permission সহ (code <code>R E</code>, data <code>RW</code>)। "map" মানে ঠিকানার range ঠিক করা — পুরো file এখনই RAM-এ copy হয় না।', 'k']
    },
    {
      title: 'Stack তৈরি: argv, envp', detail: 'argv ["./hello"], envp', kind: 'k',
      apply: function (st) {
        st.regions.stack = { name: 'stack', lines: ['argv ["./hello"]', 'envp PATH=…, HOME=… (25 vars)'] };
        st.fresh = ['stack'];
        st.log.push(['[loader] stack: argv ["./hello"], envp PATH=…, HOME=… (25 vars)', 'k']);
      },
      note: ['stack-এর মাথায় argv আর envp রাখা হলো — Node-এ <code>process.argv</code> আর <code>process.env</code> ঠিক এই তালিকাই পড়ে।', 'k']
    },
    {
      title: 'PC = ld.so-র entry, user mode-এ ফেরা', detail: 'একই PID 5120', kind: '',
      apply: function (st) {
        st.regions.ldso = { name: 'ld.so', lines: ['/lib/ld-linux-aarch64.so.1'] };
        st.fresh = ['ldso']; st.arrows = [{ from: 'interp', to: 'ldso', cls: 'k' }];
        st.mode = 'user'; st.program = 'hello'; st.progKind = 'ok'; st.pc = 'ld.so entry'; st.pcAt = 'ldso'; st.flashPid = true;
        st.log.push(['[loader] map /lib/ld-linux-aarch64.so.1, PC = its entry', 'k'],
          ['[kernel] execve("./hello", ["./hello"], 0x… /* 25 vars */) = 0', 'ok'],
          ['[cpu]    back to user mode — PC in ld.so', 'm']);
      },
      note: ['kernel-এর কাজ শেষ, user mode-এ ফিরল — প্রথম user-space instruction তোমার না, <b>ld.so</b>-র। PID এখনো 5120, program এখন hello।', '']
    },
    {
      title: 'ld.so: libc map, printf ভরাট', detail: 'libc.so.6 → printf', kind: '',
      apply: function (st) {
        st.regions.libc = { name: 'libc.so.6', lines: ['mapped by ld.so · printf lives here'] };
        st.regions.code.lines[1] = { text: 'printf: filled in ✓', cls: 't-ok' };
        st.fresh = ['libc', 'code']; st.arrows = [{ from: 'libc', to: 'libc', cls: 'u' }];
        st.pc = 'ld.so';
        st.log.push(["[ld.so]  map libc.so.6 → fill in printf's address", 'u']);
      },
      note: ['ld.so একই address space-এ <code>libc.so.6</code> map করল আর hello-র ভেতরের ফাঁকা <code>printf</code>-এর ঠিকানাটা ভরাট করল — <code>nm</code>-এর সেই <code>U</code>।', '']
    },
    {
      title: '_start → main', detail: 'entry 0x640 — তোমার code', kind: '',
      apply: function (st) {
        st.pc = '_start → main'; st.pcAt = 'code'; st.fresh = ['code'];
        st.log.push(['[ld.so]  jump to _start (entry 0x640) → main', 'u']);
      },
      note: ['এবার তোমার code: entry <code>0x640</code>-এ <code>_start</code>, সে প্রস্তুতি সেরে <code>main</code> ডাকল।', '']
    },
    {
      title: 'printf → write syscall', detail: 'write(1, "hello 42\\n", 9)', kind: 'k',
      apply: function (st) {
        st.mode = 'kernel'; st.pcAt = 'kernel'; st.kernelWhat = 'write'; st.pc = 'main → printf → write';
        st.term.push({ text: 'hello 42', cls: 't-ok' });
        st.log.push(['[cpu]    svc → kernel mode', 'm'], ['[kernel] write(1, "hello 42\\n", 9) = 9', 'ok'], ['[cpu]    back to user mode', 'm']);
      },
      note: ['<code>printf</code> শেষে নিজেও syscall করে: <code>write(1, "hello 42\\n", 9)</code> — terminal-এ <b>hello 42</b>।', 'k']
    },
    {
      title: 'return 0 → exit code 0', detail: 'exit_group(0) → zsh', kind: '',
      apply: function (st) {
        st.mode = ''; st.pc = '—'; st.pcAt = null; st.program = 'hello · exited 0'; st.progKind = ''; st.dimAll = true; st.flashPid = true;
        st.term.push({ text: '$ echo $?', cls: '' }, { text: '0', cls: 't-ok' });
        st.log.push(['[user]   main returns 0', 'u'], ['[kernel] exit_group(0) = ?', 'k'], ['+++ exited with 0 +++', 'm']);
      },
      note: ['<code>execve</code> নতুন process বানায় না; একই process-এর ভেতরের program বদলায়। PID একই রইল — <b>5120</b>, শুরু থেকে শেষ।', 'ok']
    }
  ];
}

function deniedSteps() {
  return [
    stepExecve(),
    {
      title: 'Loader-এর যাচাই: x permission নেই', detail: 'file ✓ · magic ✓ · x ✗', kind: 'd',
      apply: function (st) {
        st.checks = { exists: true, magic: true, x: false };
        st.log.push(['[loader] ./hello: exists ✓  magic 7f 45 4c 46 = ELF ✓  x permission ✗', 'd']);
      },
      note: ['file আছে ✓, magic ✓ — কিন্তু execute permission ✗। Loader এখানেই থামল: memory ফেলা, segment map — কিছুই হলো না।', 'd']
    },
    {
      title: 'execve = -1 EACCES — child এখনো zsh', detail: 'permission denied: ./hello', kind: 'd',
      apply: function (st) {
        st.mode = 'user'; st.pcAt = 'code'; st.fresh = ['stack', 'zshlibs', 'heap', 'data', 'code']; st.flashPid = true;
        st.term.push({ text: 'permission denied: ./hello', cls: 't-d' }, { text: '$', cls: '' });
        st.log.push(['[kernel] execve("./hello", ["./hello"], 0x… /* 25 vars */) = -1 EACCES (Permission denied)', 'd'],
          ["[cpu]    back to user mode — still zsh's copy", 'm'],
          ['[zsh]    permission denied: ./hello', 'd']);
      },
      note: ['Kernel <code>execve</code>-তেই আটকে দিল; child এখনো zsh-এর copy, shell তাকে "permission denied" দেখাল। <code>chmod +x hello</code> দিয়ে ফেরত দাও।', 'd']
    }
  ];
}

const START_NOTE = {
  ok: ['zsh একটা child fork করেছে — <b>PID 5120</b>, এখনো zsh-এরই copy; <code>./hello</code> disk-এ পড়ে আছে। "→ পরের ধাপ" চাপো, PID chip-টার দিকে নজর রাখো।', ''],
  denied: ['<code>chmod -x hello</code> করা আছে: file-টা আছে, ELF-ও, কিন্তু execute permission নেই। "→ পরের ধাপ" চাপো — kernel কোথায় আটকায় দেখো।', 'd']
};

export function mount(root) {
  if (root.querySelector('.sim-body')) return;   // mounted already
  const u = ui(root);
  let denied = false;
  let step = null;
  let lastSt = null;

  const chk = checkbox('chmod -x hello', false, function (v) { denied = v; build(); });
  u.controls.appendChild(chk.el);

  const stats = chips(u.body);
  u.body.insertBefore(stats.el, u.stage);
  const cPid = stats.add('PID', 5120, 'u');
  const cProg = stats.add('program', 'zsh (copy)');
  const mode = modeBadge('user');
  stats.el.appendChild(mode.el);
  const cPc = stats.add('PC', '—', 'k');

  const cols = el('div', { class: 'sim-cols w-12' });
  const left = panel(cols, 'ধাপ');
  const right = el('div', { style: { display: 'flex', flexDirection: 'column', gap: '12px', minWidth: '0' } });
  cols.appendChild(right);
  const svgEl = svg('svg', { viewBox: '0 0 480 ' + COL_H, role: 'img',
    'aria-label': 'The address space of PID 5120 (kernel at the top, code at the bottom) next to the ./hello file on disk and the zsh terminal; regions appear as the loader maps them' });
  right.appendChild(svgEl);
  const log = logPanel(panel(right, 'strace-এর চোখে', 'k'), 40);
  log.el.style.maxHeight = '330px';   // geometry only: the whole walkthrough fits without scrolling
  u.stage.appendChild(cols);

  // the grid collapses to one column at 640px (sim.css); the drawing follows it
  const mq = window.matchMedia ? window.matchMedia('(max-width: 640px)') : null;
  if (mq && mq.addEventListener) mq.addEventListener('change', function () { if (lastSt) draw(lastSt); });

  /* ---------- SVG helpers ---------- */
  function rect(x, y, w, h, cls) { return svgEl.appendChild(svg('rect', { x: x, y: y, width: w, height: h, rx: 6, class: cls })); }
  function txt(x, y, cls, str, anchor) { return svgEl.appendChild(svg('text', { x: x, y: y, class: cls, 'text-anchor': anchor || null }, str)); }
  function marker(id, cls) {
    return svg('marker', { id: id, viewBox: '0 0 10 10', refX: 9, refY: 5, markerWidth: 7, markerHeight: 7, orient: 'auto-start-reverse' },
      svg('path', { class: cls, d: 'M0 0L10 5L0 10z' }));
  }

  function draw(st) {
    lastSt = st;
    const G = geo(mq && mq.matches);
    const COL = G.COL, FILE = G.FILE, TERM = G.TERM;
    svgEl.setAttribute('viewBox', '0 0 ' + G.W + ' ' + G.H);
    clear(svgEl);
    svgEl.appendChild(svg('defs', null, marker('sim-execve-ak', 'ah-k'), marker('sim-execve-au', 'ah-u')));

    function freeBox(S) {
      rect(COL.x, S.y, COL.w, S.h, 'b-m dim');
      txt(COL.x + COL.w / 2, S.y + S.h / 2 + 4, 't-m t-s dim', 'free', 'middle');
    }
    function regionBox(key, y, h, r) {
      const fresh = st.fresh.indexOf(key) > -1;
      const dim = st.dimAll ? ' dim' : '';
      const rc = rect(COL.x, y, COL.w, h, (r.empty ? 'b-m' : fresh ? 'b-u' : 'b') + dim);
      if (fresh) flash(rc);
      const block = 13 + r.lines.length * 13;
      const y0 = y + Math.max(0, (h - block) / 2) + 11;
      txt(COL.x + 8, y0, (r.empty ? 't-m' : fresh ? 't-u' : 't-h') + ' t-s' + dim, r.name);
      r.lines.forEach(function (ln, k) {
        const o = typeof ln === 'string' ? { text: ln, cls: 't-m' } : ln;
        txt(COL.x + 8, y0 + 13 * (k + 1), 't-s ' + o.cls + dim, o.text);
      });
      if (st.pcAt === key) txt(COL.x + COL.w - 8, y0, 't-u t-s', '◀ PC', 'end');
    }
    function slot(key) {
      const r = st.regions[key];
      if (r) regionBox(key, SLOT[key].y, SLOT[key].h, r); else freeBox(SLOT[key]);
    }
    function check(y, ok) { txt(FILE.x + FILE.w - 10, y, ok ? 't-ok' : 't-d', ok ? '✓' : '✗', 'end'); }

    // the address-space column: kernel at the top, low addresses at the bottom
    txt(COL.x, 14, 't-h t-s', 'address space · PID 5120');
    txt(COL.x + COL.w, 14, 't-m t-s', 'high ↑', 'end');
    txt(COL.x + COL.w / 2, COL_H - 6, 't-m t-s', '0x0 · low addresses', 'middle');
    const inK = st.mode === 'kernel';
    rect(COL.x, SLOT.kernel.y, COL.w, SLOT.kernel.h, inK ? 'b-k' : 'b-m');
    txt(COL.x + 8, SLOT.kernel.y + 19, inK ? 't-k t-s' : 't-m t-s', inK ? 'kernel space · ' + st.kernelWhat : 'kernel space');
    if (st.pcAt === 'kernel') txt(COL.x + COL.w - 8, SLOT.kernel.y + 19, 't-k t-s', '◀ PC', 'end');
    slot('stack');
    freeBox(SLOT.free1);
    if (st.regions.zshlibs) regionBox('zshlibs', SLOT.ldso.y, SLOT.libc.y + SLOT.libc.h - SLOT.ldso.y, st.regions.zshlibs);
    else { slot('ldso'); slot('libc'); }
    freeBox(SLOT.free2);
    slot('heap'); slot('data'); slot('code');

    // the file on disk: what the loader reads from the ELF header
    const fx = FILE.x + 10, fr = FILE.x + FILE.w - 10, fy = FILE.y;
    rect(FILE.x, FILE.y, FILE.w, FILE.h, 'b');
    txt(fx, fy + 18, 't-h t-s', './hello');
    if (st.checks) { txt(fr - 16, fy + 18, 't-m t-s', 'exists', 'end'); check(fy + 18, st.checks.exists); }
    else txt(fr, fy + 18, 't-m t-s', 'ELF file on disk', 'end');
    svgEl.appendChild(svg('text', { x: fx, y: fy + 38 }, svg('tspan', { class: 'mono' }, '7f 45 4c 46'), svg('tspan', { class: 't-m t-s', dx: 8 }, 'magic → ELF')));
    if (st.checks) check(fy + 38, st.checks.magic);
    svgEl.appendChild(svg('text', { x: fx, y: fy + 56, class: 't-s' }, 'x permission: ', svg('tspan', { class: st.denied ? 't-d' : 't-h' }, st.denied ? 'no (chmod -x)' : 'yes')));
    if (st.checks) check(fy + 56, st.checks.x);
    txt(fx, fy + 74, 'mono', 'entry 0x640'); txt(fr, fy + 74, 't-m t-s', '_start', 'end');
    txt(fx, fy + 94, 'mono', 'LOAD  R E  0x884 bytes'); txt(fr, fy + 94, 't-m t-s', 'code', 'end');
    txt(fx, fy + 112, 'mono', 'LOAD  RW   0x270 bytes'); txt(fr, fy + 112, 't-m t-s', 'data', 'end');
    txt(fx, fy + 132, 't-m t-s', 'interpreter (dynamic linker):');
    txt(fx, fy + 148, 'mono', '/lib/ld-linux-aarch64.so.1');
    txt(fx, fy + 168, 'mono', 'needs: libc.so.6'); txt(fr, fy + 168, 't-m t-s', 'ldd hello', 'end');

    // the terminal the reader is looking at
    rect(TERM.x, TERM.y, TERM.w, TERM.h, 'b');
    txt(TERM.x + 10, TERM.y + 18, 't-m t-s', 'terminal · zsh, PID 3990');
    st.term.forEach(function (l, k) { txt(TERM.x + 10, TERM.y + 42 + k * 18, 'mono ' + (l.cls || ''), l.text); });

    // arrows: a line of the file → the region it was mapped to
    st.arrows.forEach(function (a, i) {
      const y1 = FILE.y + FILE_LINE[a.from], S = SLOT[a.to], y2 = S.y + S.h / 2;
      const d = G.narrow
        ? 'M' + (FILE.x + 4) + ' ' + y1 + ' H' + (14 - i * 7) + ' V' + y2 + ' H' + (COL.x - 3)                 // out of the file box on the left, up, into the region
        : 'M' + (FILE.x - 2) + ' ' + y1 + ' H' + (241 - i * 8) + ' V' + y2 + ' H' + (COL.x + COL.w + 3);   // across the gap between the two
      svgEl.appendChild(svg('path', { class: 'ln-' + a.cls, 'marker-end': 'url(#sim-execve-a' + a.cls + ')', d: d }));
    });
  }

  function build() {
    // remove the previous stepper's buttons and list, then rebuild for the chosen case
    if (step) { Object.keys(step.buttons).forEach(function (k) { step.buttons[k].remove(); }); left.removeChild(step.list); }
    const steps = denied ? deniedSteps() : helloSteps();
    step = stepper(u.controls, steps, function (i, s) {
      const st = initial(denied);
      for (let j = 0; j <= i; j++) { st.fresh = []; st.arrows = []; st.flashPid = false; steps[j].apply(st); }
      draw(st);
      cProg.set(st.program, st.progKind);
      mode.set(st.mode);
      cPc.set(st.pc);
      if (st.flashPid) flash(cPid.el);
      log.clear();
      st.log.forEach(function (l) { log.add(l[0], l[1]); });
      const n = i < 0 ? START_NOTE[denied ? 'denied' : 'ok'] : s.note;
      note(u, n[0], n[1]);
    });
    left.appendChild(step.list);
  }

  build();
}
