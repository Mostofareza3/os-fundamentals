/* addrspace.js — Chapter 5
   A process's address space, drawn from the chapter's
   `cat /proc/self/maps` output with low addresses at the bottom. The heap
   grows up with each malloc, the stack grows down with each function call
   (and back up on return, toward the guard page below its 8 MB limit).
   Three buttons try to break the rules — write into the code, execute
   bytes on the stack, read a kernel address — and the CPU stops the
   process at the first access the region's permission forbids: the region
   turns red, SIGSEGV, the kernel kills the process.
   The drawing is not to scale (the chapter's figure is not either).
*/

import { ui, button, sep, el, svg, clear, note, chips, modeBadge, panel, logPanel, hex, bytes } from './_lib.js';

/* the chapter's [heap] lines: aaaac20c8000-aaaac20c9000 ---p, aaaac20c9000-aaaac20ca000 rw-p */
const HEAP_START = 0xaaaac20c8000;
const HEAP_END0 = 0xaaaac20ca000;
const BLOCK = 0x1000;          // one malloc block — the granularity of the maps output
const MAX_BLOCKS = 6;          // room in the drawing (the real heap can go much further)
const MAX_DEPTH = 16;          // the frame that reaches the guard page (drawing, not to scale)

/* one entry per region: name, permission, what lives there (the chapter's
   figure wording), the matching /proc/self/maps line(s), and a one-line note */
const REGIONS = {
  kernel: { name: 'Kernel space', perm: '—', box: 'b-m',
    lives: 'kernel-এর নিজের code আর data — off-limits in user mode', maps: [], nomap: 'maps-এ লাইন নেই: user space-এর বাইরে',
    note: 'সবার উপরে kernel-এর অংশ — user mode থেকে ছোঁয়া নিষেধ, তাই <code>/proc/self/maps</code>-এও নেই।' },
  stack: { name: 'Stack', perm: 'rw-', box: 'b-u', kind: 'u', addr: 'ffffffee8000',
    lives: 'function calls: locals, return addresses — মাপ সর্বোচ্চ 8 MB (<code>ulimit -s</code>), ঠিক নিচে guard page',
    maps: ['ffffffee8000-fffffff09000 rw-p 00000000 00:00 0 [stack]'],
    note: 'Stack: function call-এর হিসাব — ছোট address-এর দিকে, মানে নিচের দিকে বাড়ে।' },
  guard: { name: 'Guard page', perm: '---', box: 'b-m',
    lives: 'kernel-এর রাখা নিষিদ্ধ অংশ — stack এখানে পৌঁছালেই permission ভাঙে: stack overflow', maps: [], nomap: 'maps-এ লাইন নেই',
    note: 'Stack-এর ঠিক নিচে kernel একটা নিষিদ্ধ অংশ রেখে দেয় — frame জমতে জমতে এখানে পৌঁছালেই process মরে।' },
  free: { name: 'free — nothing mapped', perm: '—',
    lives: 'কিছু না — এই address গুলোর পেছনে কোনো RAM নেই; heap আর stack-এর বাড়ার জায়গা', maps: [], nomap: 'maps-এ লাইন নেই: map করা নয়',
    note: 'ফাঁকা জায়গা: heap উপরের দিকে আর stack নিচের দিকে বাড়ে, মাঝখানে বিশাল ফাঁক — যাতে দুজনেই বাড়ার জায়গা পায়।' },
  mmap: { name: 'Memory-mapped region', perm: 'r-x / rw-', box: 'b', addr: 'ffff9082f000',
    lives: 'shared libraries — libc, ld.so (dynamic linker), other mapped files',
    maps: ['ffff9082f000-ffff908d1000 r-xp 00000000 00:40 1073275 /lib/ld-musl-aarch64.so.1',
      'ffff908ef000-ffff908f0000 rw-p 000b0000 00:40 1073275 /lib/ld-musl-aarch64.so.1'],
    note: 'Memory-mapped region: shared library (libc, dynamic linker নিজে) আর অন্য যেকোনো map করা জিনিস এখানে বসে।' },
  heap: { name: 'Heap', perm: 'rw-', box: 'b-u', kind: 'u', addr: 'aaaac20c8000',
    lives: 'memory asked for at runtime, lives until freed (Chapter 6)', maps: null,
    note: 'Heap: চলার সময় চেয়ে নেওয়া memory — বড় address-এর দিকে, মানে উপরের দিকে বাড়ে।' },
  bss: { name: 'BSS', perm: 'rw-', box: 'b',
    lives: 'globals with no initial value — file-এ শুধু মাপ লেখা থাকে, loader ০-ভরা memory দেয়', maps: [], nomap: 'এই output-এ আলাদা লাইন নেই',
    note: 'BSS: শুরুর মান না-দেওয়া global (<code>int total;</code>) — নিয়ম হলো এরা ০ দিয়ে শুরু হবে।' },
  data: { name: 'Data', perm: 'rw-', box: 'b', addr: 'aaaabb4b0000',
    lives: 'globals with an initial value — মানটা executable file থেকে map করা',
    maps: ['aaaabb4b0000-aaaabb4b1000 rw-p 000e0000 00:40 1073111 /bin/busybox'],
    note: 'Data: যেসব global-এর শুরুর মান code-এ লেখা আছে (<code>int count = 10;</code>)।' },
  rodata: { name: 'Read-only data', perm: 'r--', box: 'b', addr: 'aaaabb4ac000',
    lives: 'code-এ লেখা constant আর linker-এর কিছু table',
    maps: ['aaaabb4ac000-aaaabb4b0000 r--p 000dc000 00:40 1073111 /bin/busybox'],
    note: 'শুধু-পড়া data: <code>r--</code> — লেখাও যায় না, চালানোও যায় না।' },
  text: { name: 'Text (code)', perm: 'r-x', box: 'b-k', kind: 'k', addr: 'aaaabb3d0000',
    lives: 'machine code — Chapter 4-এর R E segment',
    maps: ['aaaabb3d0000-aaaabb4a0000 r-xp 00000000 00:40 1073111 /bin/busybox'],
    note: 'Text: machine code — <code>r-x</code>, পড়া আর চালানো যায়, লেখা যায় না।' },
  guard0: { name: 'Unmapped guard', perm: '—', box: 'b-m',
    lives: 'address 0 … — map করা নেই', maps: [], nomap: 'maps-এ লাইন নেই',
    note: 'address 0-র দিকটা map করা নেই — unmapped guard।' }
};

let seq = 0;   // unique marker ids per mount

export function mount(root) {
  if (root.dataset.addrspace === '1') return;
  root.dataset.addrspace = '1';
  const u = ui(root);

  let blocks = 0;        // heap blocks asked for at runtime
  let depth = 0;         // stack frames
  let dead = false;      // killed by the kernel after a violation
  let violated = null;   // region id that turned red
  let selected = null;   // region id shown in the panel
  let access = null;     // { id, text, ok } — the last access the CPU checked
  let pulse = false;     // replay the flash on the next draw

  // ---- controls
  const bMalloc = button('malloc / new object', malloc);
  const bCall = button('function call', call);
  const bRet = button('return', ret);
  const bWrite = button('code-এ লেখো — *(char *)main = 0', function () {
    violate('text', 'write', '<code>r-x</code> region-এ লেখা: CPU প্রতিটা access-এ permission দেখে — থামল, kernel-কে ডাকল, kernel process মেরে দিল (Linux: <b>Segmentation fault</b>, macOS: <b>bus error</b>)।');
  }, 'danger');
  const bExec = button('stack-এর data চালাও (execute)', function () {
    violate('stack', 'execute', '<code>rw-</code> region-এর byte instruction হিসেবে চালানো নিষেধ — এভাবেই input-এ পাঠানো machine code আটকায়।');
  }, 'danger');
  const bKern = button('kernel-এর address পড়ো', function () {
    violate('kernel', 'read', 'user mode থেকে <b>kernel space</b> ছোঁয়া নিষেধ — CPU থামল, kernel process মেরে দিল।');
  }, 'danger');
  const bReset = button('↺ Reset', reset);
  u.controls.append(bMalloc, bCall, bRet, sep(),
    el('span', { class: 'sim-field' }, 'নিয়ম ভাঙার চেষ্টা:'), bWrite, bExec, bKern, bReset);

  // ---- chips: mode badge, heap size, stack depth
  const mode = modeBadge('user');
  const stats = chips(u.body);
  u.body.insertBefore(stats.el, u.stage);
  const cHeap = stats.add('heap', '8 KB', 'u');
  const cStack = stats.add('stack depth', 0, 'u');
  stats.el.insertBefore(mode.el, stats.el.firstChild);

  // ---- stage: the map on the left, the region panel on the right
  const cols = el('div', { class: 'sim-cols w-21' });
  const mid = 'as-ah-' + (++seq);
  const BX = 120, BW = 260, CX = BX + BW / 2, H = 538;
  const STACK_TOP = 48, HEAP_BOTTOM = 390, BASE = 38, FRAME = 6;
  const svgEl = svg('svg', { viewBox: '0 0 460 ' + H, role: 'group',
    'aria-label': 'Process address space, low addresses at the bottom and kernel space at the top: text, data, BSS, heap growing up, memory-mapped libraries, stack growing down toward a guard page. A region turns red with SIGSEGV when an access breaks its permission' });
  cols.appendChild(svgEl);

  const right = panel(cols, 'Region');
  const rTitle = right.firstChild;
  const rChips = chips(right);
  const cPerm = rChips.add('permission', '—');
  const cAcc = rChips.add('access', '—');
  const rLives = el('p', { class: 'sim-note', style: { marginTop: '8px' } });
  right.appendChild(rLives);
  const rMaps = logPanel(right, 8);
  rMaps.el.style.marginTop = '8px';
  right.appendChild(el('p', { class: 'sim-desc', style: { marginTop: '8px' } },
    'r = পড়া যাবে · w = লেখা যাবে · x = instruction হিসেবে চালানো যাবে · - = যাবে না'));
  u.stage.appendChild(cols);

  function dataOf(id) { return REGIONS[id === 'free1' || id === 'free2' ? 'free' : id]; }
  function heapSize() { return HEAP_END0 + blocks * BLOCK - HEAP_START; }
  function heapEnd() { return hex(HEAP_END0 + blocks * BLOCK).slice(2); }
  function heapMaps() {
    return ['aaaac20c8000-aaaac20c9000 ---p 00000000 00:00 0 [heap]',
      'aaaac20c9000-' + heapEnd() + ' rw-p 00000000 00:00 0 [heap]'];
  }

  // ---- geometry: y and height of every region, top to bottom
  function layout() {
    const stackH = BASE + Math.min(depth, MAX_DEPTH) * FRAME;
    const heapH = BASE + blocks * FRAME;
    const guardY = STACK_TOP + BASE + MAX_DEPTH * FRAME;
    return {
      kernel: { y: 6, h: 34 },
      stack: { y: STACK_TOP, h: stackH },
      guard: { y: guardY, h: 16 },
      free1: { y: guardY + 16, h: 232 - guardY - 16 },
      mmap: { y: 232, h: 48 },
      free2: { y: 280, h: HEAP_BOTTOM - heapH - 280 },
      heap: { y: HEAP_BOTTOM - heapH, h: heapH },
      bss: { y: 392, h: 26 },
      data: { y: 420, h: 26 },
      rodata: { y: 448, h: 20 },
      text: { y: 470, h: 34 },
      guard0: { y: 508, h: 22 }
    };
  }

  function txt(x, y, s, cls, anchor) {
    return svg('text', { x: x, y: y, class: cls, 'text-anchor': anchor || null }, s);
  }

  function draw() {
    clear(svgEl);
    const L = layout();
    svgEl.appendChild(svg('defs', null,
      svg('marker', { id: mid, viewBox: '0 0 10 10', refX: 9, refY: 5, markerWidth: 7, markerHeight: 7, orient: 'auto-start-reverse' },
        svg('path', { class: 'ah-u', d: 'M0 0L10 5L0 10z' }))));
    svgEl.appendChild(svg('text', { x: 12, y: 270, transform: 'rotate(-90 12 270)', 'text-anchor': 'middle', class: 't-m t-s' }, 'higher addresses →'));

    Object.keys(L).forEach(function (id) { region(id, L[id]); });

    // the two growth arrows: heap up into the gap, stack down toward the guard page
    const ht = L.heap.y;
    svgEl.appendChild(svg('line', { x1: CX, y1: ht - 2, x2: CX, y2: ht - 16, class: 'ln-u', 'marker-end': 'url(#' + mid + ')' }));
    const sb = L.stack.y + L.stack.h;
    const se = Math.min(sb + 16, L.guard.y - 2);
    if (se - sb >= 8) svgEl.appendChild(svg('line', { x1: CX, y1: sb + 2, x2: CX, y2: se, class: 'ln-u', 'marker-end': 'url(#' + mid + ')' }));

    if (selected && L[selected]) {
      const g = L[selected];
      svgEl.appendChild(svg('rect', { x: BX - 3, y: g.y - 3, width: BW + 6, height: g.h + 6, rx: 8,
        class: (violated === selected ? 'ln-d' : 'ln-u') + (dataOf(selected) === REGIONS.free ? ' dash' : ''), 'pointer-events': 'none' }));
    }
    if (violated && L[violated]) {
      const g = L[violated];
      const cy = g.y + g.h / 2;
      svgEl.appendChild(svg('rect', { x: 386, y: cy - 10, width: 68, height: 20, rx: 5, class: 'b-d' + (pulse ? ' flash' : '') }));
      svgEl.appendChild(txt(420, cy + 4, 'SIGSEGV', 't-d t-s', 'middle'));
    }
    svgEl.appendChild(txt(456, H - 4, 'not to scale', 't-m t-s', 'end'));
  }

  function region(id, g) {
    const R = dataOf(id);
    const hit = violated === id;
    const grp = svg('g', { role: 'button', tabindex: 0, 'aria-label': R.name, style: { cursor: 'pointer' },
      onclick: function () { pick(id); },
      onkeydown: function (e) { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); pick(id); } } });
    const y = g.y;
    if (R === REGIONS.free) {
      grp.appendChild(svg('rect', { x: BX, y: y, width: BW, height: g.h, fill: 'none', 'pointer-events': 'all' }));
      grp.appendChild(txt(CX, y + (id === 'free1' ? 21 : 14), 'free — nothing mapped', 't-m t-s', 'middle'));
      svgEl.appendChild(grp);
      return;
    }
    grp.appendChild(svg('rect', { x: BX, y: y, width: BW, height: g.h, rx: 6, class: (hit ? 'b-d' : R.box) + (hit && pulse ? ' flash' : '') }));
    if (R.addr) grp.appendChild(txt(BX - 10, y + (id === 'text' ? 21 : id === 'mmap' ? 19 : id === 'rodata' ? 14 : id === 'data' ? 17 : 16), R.addr, 't-m mono', 'end'));
    const permY = id === 'text' ? 21 : id === 'mmap' ? 19 : id === 'rodata' ? 14 : id === 'data' || id === 'bss' ? 17 : 16;
    if (R.box && id !== 'kernel' && id !== 'guard' && id !== 'guard0') grp.appendChild(txt(BX + BW - 10, y + permY, R.perm, hit ? 't-d mono' : 't-m mono', 'end'));

    if (id === 'kernel') {
      grp.appendChild(txt(CX, y + 14, 'kernel space', hit ? 't-d' : 't-m', 'middle'));
      grp.appendChild(txt(CX, y + 28, 'off-limits in user mode', 't-m t-s', 'middle'));
    } else if (id === 'stack') {
      grp.appendChild(txt(BX + 12, y + 16, 'Stack', hit ? 't-d' : 't-u'));
      grp.appendChild(txt(BX + 12, y + 30, 'grows down ↓', 't-m t-s'));
      for (let i = 0; i < Math.min(depth, MAX_DEPTH); i++) {
        grp.appendChild(svg('rect', { x: BX + 10, y: y + 36 + i * FRAME, width: BW - 20, height: 5, rx: 1, class: 'f-u', opacity: 0.6 }));
      }
    } else if (id === 'guard') {
      grp.appendChild(txt(BX + 12, y + 12, 'guard page', hit ? 't-d t-s' : 't-m t-s'));
      grp.appendChild(txt(BX + BW - 10, y + 12, '8 MB limit (ulimit -s)', 't-m t-s', 'end'));
    } else if (id === 'mmap') {
      grp.appendChild(txt(BX + 12, y + 19, 'Memory-mapped region', 't-h'));
      grp.appendChild(txt(BX + 12, y + 36, 'libc, ld.so, other mapped files', 't-m t-s'));
    } else if (id === 'heap') {
      grp.appendChild(txt(BX + 12, y + 16, 'Heap', 't-u'));
      grp.appendChild(txt(BX + 12, y + 30, 'grows up ↑', 't-m t-s'));
      for (let i = 0; i < blocks; i++) {
        grp.appendChild(svg('rect', { x: BX + 10, y: y + g.h - 4 - (i + 1) * FRAME, width: BW - 20, height: 5, rx: 1, class: 'f-u', opacity: 0.6 }));
      }
    } else if (id === 'bss') {
      grp.appendChild(txt(BX + 12, y + 17, 'BSS', 't-h'));
    } else if (id === 'data') {
      grp.appendChild(txt(BX + 12, y + 17, 'Data', 't-h'));
    } else if (id === 'rodata') {
      grp.appendChild(txt(BX + 12, y + 14, 'Read-only data', 't-h t-s'));
    } else if (id === 'text') {
      grp.appendChild(txt(BX + 12, y + 21, 'Text (code)', hit ? 't-d' : 't-k'));
    } else if (id === 'guard0') {
      grp.appendChild(txt(CX, y + 15, 'address 0 … — unmapped guard', 't-m t-s', 'middle'));
    }
    svgEl.appendChild(grp);
  }

  // ---- the panel on the right: the selected region's details
  function showRegion() {
    const R = selected ? dataOf(selected) : null;
    const hit = !!selected && violated === selected;
    right.className = 'sim-panel' + (hit ? ' d' : R && R.kind ? ' ' + R.kind : '');
    rTitle.textContent = R ? R.name : 'Region';
    cPerm.set(R ? R.perm : '—', hit ? 'd' : (R && R.kind) || '');
    if (R && access && access.id === selected) cAcc.set(access.text, access.ok ? 'ok' : 'd');
    else cAcc.set('—', '');
    rLives.innerHTML = R ? '<b>কী থাকে:</b> ' + R.lives
      : 'ছবির যেকোনো region-এ click করো — এখানে তার permission, কী থাকে, আর <code>/proc/self/maps</code>-এর লাইনটা দেখাবে।';
    rMaps.clear();
    if (R) {
      const lines = selected === 'heap' ? heapMaps() : R.maps;
      rMaps.add('/proc/self/maps:', 'm');
      if (lines.length) lines.forEach(function (l) { rMaps.add(l, hit ? 'd' : ''); });
      else rMaps.add('(' + R.nomap + ')', 'm');
    }
  }

  function pick(id) {
    selected = id;
    draw();
    showRegion();
    note(u, dataOf(id).note, violated === id ? 'd' : '');
  }

  function refresh() {
    draw();
    showRegion();
    cHeap.set(bytes(heapSize()));
    cStack.set(depth, violated === 'guard' ? 'd' : 'u');
    bMalloc.disabled = dead || blocks >= MAX_BLOCKS;
    bCall.disabled = dead;
    bRet.disabled = dead || depth === 0;
    bWrite.disabled = bExec.disabled = bKern.disabled = dead;
  }

  // ---- actions
  function malloc() {
    if (dead || blocks >= MAX_BLOCKS) return;
    blocks++;
    selected = 'heap';
    access = { id: 'heap', text: 'write ✓', ok: true };
    refresh();
    note(u, '<b>heap</b> উপরের দিকে বাড়ল — aaaac20c8000 থেকে শুরু, এখন ' + bytes(heapSize()) + ', শেষ address ' + heapEnd() +
      (blocks >= MAX_BLOCKS ? ' (ছবিতে এটুকুই জায়গা; বাস্তবে সামনের ফাঁকটা বিশাল)।' : '।'));
  }

  function call() {
    if (dead) return;
    depth++;
    if (depth >= MAX_DEPTH) {
      violate('guard', 'write', 'frame জমতে জমতে stack <b>guard page</b>-এ পৌঁছাল — permission ভাঙল, process মরল: <b>stack overflow</b>।');
      return;
    }
    selected = 'stack';
    access = { id: 'stack', text: 'write ✓', ok: true };
    refresh();
    note(u, '<b>stack</b> নিচের দিকে বাড়ল (frame ' + depth + ') — দুজনের মাঝে ফাঁকা জায়গা রাখা আছে এজন্যই।');
  }

  function ret() {
    if (dead || depth === 0) return;
    depth--;
    selected = 'stack';
    access = { id: 'stack', text: 'read ✓', ok: true };
    refresh();
    note(u, 'return: frame মুক্ত — SP-তে byte গুলো আবার যোগ হলো, stack উপরে উঠে এল (depth ' + depth + ')।');
  }

  // the CPU checks the permission on every access; this one fails:
  // the CPU stops, the kernel is called, the kernel kills the process
  function violate(id, what, html) {
    if (dead) return;
    dead = true;
    violated = id;
    selected = id;
    pulse = true;
    access = { id: id, text: what + ' ✗', ok: false };
    mode.set('dead');
    refresh();
    pulse = false;
    note(u, html, 'd');
  }

  function reset() {
    blocks = 0; depth = 0; dead = false; violated = null; selected = null; access = null;
    mode.set('user');
    refresh();
    note(u, 'Region-এ click করো, তারপর button গুলো চাপো।');
  }

  reset();
}
