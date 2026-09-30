/* heapalloc.js — Chapter 6
   A heap allocator at work. The strip is the chapter's figure: a 128 KB
   [heap] region starting at 0xaaab00d40000 (the chapter's brk(NULL)), at
   1 KB granularity. malloc(n) takes the first free hole that fits ("খালি
   block-এর তালিকা থেকে কমপক্ষে n byte-এর একটা খোঁজে"); free() marks the
   block free and merges it with free neighbours — no syscall. When no hole
   fits, the allocator goes to the kernel: brk grows the region by 0x21000
   (132 KB, the chapter's strace) in one bite, drawn as a new row. A 10 MB
   request never touches the strip: it gets its own mmap region
   (0xffffaa600000, 10489856 bytes) and free() gives it straight back with
   munmap. "compact" does what V8's collector can and C's malloc cannot:
   it moves the live blocks together so the free space becomes one hole.
*/

import { ui, button, sep, svg, clear, note, chips, panel, logPanel, hex } from './_lib.js';

const BASE = 0xaaab00d40000;       // brk(NULL) in the chapter's strace: where [heap] starts
const HEAP0 = 128;                 // KB — the chapter's figure
const BITE = 132;                  // KB — 0x21000, how much one brk grew the heap in the chapter
const MAX_BITES = 4;               // the drawing has room for this many extra rows
const MMAP_ADDR = 0xffffaa600000;  // where the chapter's 10 MB landed
const MMAP_LEN = 10489856;         // the length strace printed (10 MB + one page)
const BIG = 10 * 1024 * 1024;
const PX = 5;                      // px per KB → 128 KB = 640 px, like the figure
const W = 800, X0 = 40, TOP = 34, PITCH = 84, BH = 46;

/* the chapter's fragmented heap: [size in KB, in use?] — 56 KB free, biggest hole 16 KB */
const PRESET = [[16, true], [16, false], [8, true], [8, false], [24, true], [16, false], [8, true], [8, false], [16, true], [8, false]];

function bn(n) { return String(n).replace(/\d/g, function (d) { return '০১২৩৪৫৬৭৮৯'[d]; }); }

export function mount(root) {
  if (root.querySelector('.sim-body')) return;
  const u = ui(root);

  let blocks = [];      // { id, off, size, used } in address order, covering [0, heapKB); off/size in KB
  let heapKB = HEAP0;
  let bites = 0;        // brk extensions so far
  let mapped = false;   // the 10 MB mmap region exists
  let syscalls = 0;
  let nextId = 1;
  let hot = [];         // block ids that flash on the next draw
  let hotMap = false;

  // ---- controls
  const bBig = button('malloc(10 MB)', mallocBig);
  u.controls.append(
    button('malloc(8 KB)', function () { malloc(8); }),
    button('malloc(16 KB)', function () { malloc(16); }),
    button('malloc(32 KB)', function () { malloc(32); }),
    bBig, sep(),
    button('Chapter-এর ছবি', preset),
    button('compact (V8-এর GC পারে, C-র malloc পারে না)', compact),
    button('↺ Reset', reset));

  // ---- chips
  const stats = chips(u.body);
  u.body.insertBefore(stats.el, u.stage);
  const cHeap = stats.add('heap', '128 KB');
  const cFree = stats.add('মোট খালি', '128 KB', 'ok');
  const cHole = stats.add('সবচেয়ে বড় ফাঁক', '128 KB', 'u');
  const cSys = stats.add('syscall', 0, 'k');

  // ---- stage: the strip, then the log under it
  const svgEl = svg('svg', { class: 'wide', viewBox: '0 0 ' + W + ' 220', role: 'group',
    'aria-label': 'The heap as a strip from 0xaaab00d40000, 5 px per KB: blue blocks are in use, dashed ones free; clicking a used block frees it. brk adds a 132 KB row; a 10 MB request gets its own mmap box below the strip' });
  u.stage.appendChild(svgEl);
  const log = logPanel(panel(u.body, 'strace-এর চোখে — malloc / free আর তাদের syscall', 'k'), 60);

  // ---- helpers
  function addr(kb) { return hex(BASE + kb * 1024, 12); }
  function freeKB() { return blocks.reduce(function (s, b) { return s + (b.used ? 0 : b.size); }, 0); }
  function maxHole() { return blocks.reduce(function (m, b) { return b.used ? m : Math.max(m, b.size); }, 0); }
  function findFit(n) {
    for (let i = 0; i < blocks.length; i++) if (!blocks[i].used && blocks[i].size >= n) return i;
    return -1;
  }
  // free neighbours become one hole ("পাশের খালি block থাকলে জুড়ে বড় করে")
  function coalesce() {
    const out = [];
    blocks.forEach(function (b) {
      const last = out[out.length - 1];
      if (last && !last.used && !b.used) last.size += b.size;
      else out.push(b);
    });
    blocks = out;
  }
  // rows of the drawing: the first 128 KB, then one row per brk bite
  function rows() {
    const r = [{ s: 0, e: HEAP0 }];
    for (let k = 0; k < bites; k++) r.push({ s: HEAP0 + k * BITE, e: HEAP0 + (k + 1) * BITE });
    return r;
  }
  function txt(x, y, s, cls, anchor) {
    return svg('text', { x: x, y: y, class: cls, 'text-anchor': anchor || null }, s);
  }
  function clickable(label, title, fn) {
    return svg('g', { role: 'button', tabindex: 0, 'aria-label': label, style: { cursor: 'pointer' },
      onclick: fn,
      onkeydown: function (e) { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); fn(); } } },
      svg('title', null, title));
  }

  // ---- drawing
  function draw() {
    clear(svgEl);
    const R = rows();
    svgEl.appendChild(txt(X0, 16, '[heap]', 'mono t-h'));
    svgEl.appendChild(txt(X0 + 58, 16, 'grows with brk →', 't-m t-s'));
    svgEl.appendChild(txt(W - 8, 16, 'blue = in use · dashed = free · click a block = free()', 't-m t-s', 'end'));

    R.forEach(function (row, r) {
      const y = TOP + r * PITCH;
      const w = (row.e - row.s) * PX;
      svgEl.appendChild(txt(X0, y + BH + 17, addr(row.s), 'mono t-m'));
      svgEl.appendChild(txt(X0 + w, y + BH + 17, addr(row.e), 'mono t-m', 'end'));
      svgEl.appendChild(txt(X0 + w + 8, y + BH / 2 + 4, r === 0 ? '128 KB' : 'brk +132 KB', r === 0 ? 't-m t-s' : 't-k t-s'));
    });
    blocks.forEach(function (b) { drawBlock(b, R); });

    // the separate mmap region
    const ym = TOP + R.length * PITCH + 2;
    svgEl.appendChild(txt(X0, ym + 12, '[anon]', 'mono t-h'));
    svgEl.appendChild(txt(X0 + 58, ym + 12, 'mmap — its own region, far from the heap', 't-m t-s'));
    const by = ym + 22;
    if (mapped) {
      const g = clickable('free the 10 MB mapping', 'free করো — munmap', freeBig);
      g.appendChild(svg('rect', { x: X0, y: by, width: 220, height: BH, class: 'b-u' + (hotMap ? ' flash' : '') }));
      g.appendChild(txt(X0 + 110, by + BH / 2 + 4, '10 MB', 't-s', 'middle'));
      svgEl.appendChild(g);
      svgEl.appendChild(txt(X0, by + BH + 17, hex(MMAP_ADDR, 12) + ' · ' + MMAP_LEN + ' B · not to scale', 'mono t-m'));
    } else {
      svgEl.appendChild(svg('rect', { x: X0, y: by, width: 220, height: BH, class: 'b-m dim' }));
      svgEl.appendChild(txt(X0 + 110, by + BH / 2 + 4, 'no mapping', 't-m t-s', 'middle'));
      svgEl.appendChild(txt(X0, by + BH + 17, 'malloc(10 MB) lands here, not in the strip', 't-m t-s'));
    }
    svgEl.setAttribute('viewBox', '0 0 ' + W + ' ' + (by + BH + 26));
  }

  // a block may run past the end of a row (after brk) — draw one piece per row, label the widest
  function drawBlock(b, R) {
    const pieces = [];
    R.forEach(function (row, r) {
      const s = Math.max(b.off, row.s), e = Math.min(b.off + b.size, row.e);
      if (e > s) pieces.push({ x: X0 + (s - row.s) * PX, y: TOP + r * PITCH, w: (e - s) * PX });
    });
    if (!pieces.length) return;
    let big = pieces[0];
    pieces.forEach(function (p) { if (p.w > big.w) big = p; });
    const cls = (b.used ? 'b-u' : 'b-m') + (hot.indexOf(b.id) >= 0 ? ' flash' : '');
    const g = b.used
      ? clickable('free ' + b.size + ' KB at ' + addr(b.off), 'free করো — ' + b.size + ' KB, ' + addr(b.off), function () { free(b.id); })
      : svg('g');
    pieces.forEach(function (p) {
      g.appendChild(svg('rect', { x: p.x, y: p.y, width: p.w, height: BH, class: cls }));
      let label = '';
      if (p !== big) label = p.w >= 20 ? '…' : '';
      else if (b.used) label = p.w >= 64 ? b.size + ' KB' : p.w >= 20 ? String(b.size) : '';
      else label = p.w >= 76 ? 'free ' + b.size : p.w >= 20 ? String(b.size) : '';
      if (label) g.appendChild(txt(p.x + p.w / 2, p.y + BH / 2 + 4, label, b.used && p === big ? 't-s' : 't-m t-s', 'middle'));
    });
    svgEl.appendChild(g);
  }

  function refresh() {
    draw();
    hot = []; hotMap = false;
    cHeap.set(heapKB + ' KB');
    cFree.set(freeKB() + ' KB');
    cHole.set(maxHole() + ' KB');
    cSys.set(syscalls);
    bBig.disabled = mapped;
  }

  // ---- the allocator
  // no hole fits: ask the kernel — brk, one big bite, like the chapter's strace
  function grow() {
    blocks.push({ id: nextId++, off: heapKB, size: BITE, used: false });
    heapKB += BITE; bites++; syscalls++;
    coalesce();
    log.add('brk(' + addr(heapKB) + ') = ' + addr(heapKB) + '   +0x21000 (132 KB) — heap বড় করল', 'k');
  }

  function malloc(n) {
    const free0 = freeKB(), hole0 = maxHole();
    let i = findFit(n), grew = false;
    if (i < 0) {
      log.add('malloc(' + n * 1024 + '): ' + (free0 ? 'কোনো ফাঁকে ধরে না — খালি ' + free0 + ' KB, কিন্তু সবচেয়ে বড় ফাঁক ' + hole0 + ' KB' : 'heap-এ খালি জায়গা নেই'), 'd');
      if (bites >= MAX_BITES) {
        log.add('malloc(' + n * 1024 + ') = NULL   (simulator: ' + MAX_BITES + ' বার brk-এর পর আর বাড়াচ্ছি না)', 'd');
        refresh();
        note(u, 'Simulator-এর সীমা: ' + bn(MAX_BITES) + ' বার brk-এর পর heap আর আঁকছি না — block-এ click করে free করো, compact করো, অথবা ↺ Reset।', 'd');
        return;
      }
      grow(); grew = true;
      i = findFit(n);
    }
    const hole = blocks[i];
    const nb = { id: nextId++, off: hole.off, size: n, used: true };
    if (hole.size > n) { hole.off += n; hole.size -= n; blocks.splice(i, 0, nb); }
    else blocks.splice(i, 1, nb);
    hot = [nb.id];
    log.add('malloc(' + n * 1024 + ') = ' + addr(nb.off), 'u');
    if (grew) {
      refresh();
      if (free0 > 0) note(u, bn(free0) + ' KB খালি, কিন্তু একটানা সবচেয়ে বড় ' + bn(hole0) + ' KB — fragmentation: allocator-কে kernel-এর কাছে যেতে হলো (brk), যদিও হাতে খালি memory আছে।', 'd');
      else note(u, 'হাতে খালি জায়গা নেই — allocator kernel-এর কাছে গেল: brk, heap এক কামড়ে 0x21000 (১৩২ KB) বাড়ল, যাতে পরের ছোট অনুরোধ গুলোতে আবার যেতে না হয়।', 'k');
      return;
    }
    refresh();
    note(u, 'malloc(' + n + ' KB): খালি block-এর তালিকায় প্রথম যেটায় ধরল সেখানেই — <code>' + addr(nb.off) + '</code>; kernel-এর কাছে যেতে হয়নি।');
  }

  // click on a used block: mark it free, merge with free neighbours, no syscall
  function free(id) {
    const b = blocks.find(function (x) { return x.id === id; });
    if (!b || !b.used) return;
    const off = b.off, size = b.size;
    b.used = false;
    coalesce();
    const hole = blocks.find(function (x) { return !x.used && x.off <= off && off < x.off + x.size; });
    const merged = hole && hole.size > size;
    log.add('free(' + addr(off) + ')   ' + size + ' KB আবার খালি' + (merged ? ', পাশের সাথে জুড়ে ' + hole.size + ' KB' : '') + ' — কোনো syscall নেই', 'u');
    refresh();
    note(u, 'free(small): কোনো syscall নেই — allocator টুকরোটা নিজের কাছে রাখল' + (merged ? ', পাশের খালি block-এর সাথে জুড়ে ' + bn(hole.size) + ' KB-র এক ফাঁক' : '') + '।', 'ok');
  }

  // 10 MB: the allocator does not even look at the strip — a fresh mmap region
  function mallocBig() {
    if (mapped) return;
    mapped = true; hotMap = true; syscalls++;
    log.add('mmap(NULL, ' + MMAP_LEN + ', PROT_READ|PROT_WRITE, MAP_PRIVATE|MAP_ANONYMOUS, -1, 0) = ' + hex(MMAP_ADDR, 12), 'k');
    log.add('malloc(' + BIG + ') = ' + hex(MMAP_ADDR + 0x10, 12), 'u');
    refresh();
    note(u, '১০ MB: allocator heap-এর ফাঁকে খোঁজেইনি — আলাদা <b>mmap</b> নিল, তাই address একদম অন্য এলাকায় (<code>0xffff…</code>)।', 'k');
  }

  function freeBig() {
    if (!mapped) return;
    mapped = false; syscalls++;
    log.add('free(' + hex(MMAP_ADDR + 0x10, 12) + ')', 'u');
    log.add('munmap(' + hex(MMAP_ADDR, 12) + ', ' + MMAP_LEN + ') = 0', 'k');
    refresh();
    note(u, 'free(big): mmap-এর region সঙ্গে সঙ্গে kernel-কে ফেরত (munmap)।', 'k');
  }

  // V8's collector knows every reference, so it can move live objects and fix the addresses; malloc cannot
  function compact() {
    const used = blocks.filter(function (b) { return b.used; });
    const moved = [];
    let off = 0;
    used.forEach(function (b) { if (b.off !== off) moved.push({ b: b, from: b.off }); b.off = off; off += b.size; });
    const freeTotal = heapKB - off;
    blocks = used.slice();
    if (freeTotal > 0) blocks.push({ id: nextId++, off: off, size: freeTotal, used: false });
    if (!moved.length) {
      refresh();
      note(u, used.length ? 'জীবিত block গুলো এমনিতেই এক পাশে, খালি জায়গা এক টুকরো — সরানোর কিছু নেই।' : 'Heap-এ জীবিত block নেই — সরানোর কিছু নেই।');
      return;
    }
    hot = moved.map(function (m) { return m.b.id; });
    log.add('compact: ' + moved.length + ' block সরল, প্রতিটা reference-এ নতুন address — খালি ' + freeTotal + ' KB এখন এক টুকরো', 'ok');
    moved.slice(0, 6).forEach(function (m) { log.add('  ' + m.b.size + ' KB: ' + addr(m.from) + ' → ' + addr(m.b.off), 'm'); });
    if (moved.length > 6) log.add('  … আরও ' + (moved.length - 6) + 'টা', 'm');
    refresh();
    note(u, 'জীবিত block গুলো এক পাশে, খালি জায়গা এক টুকরো <b>' + bn(freeTotal) + ' KB</b>' + (freeTotal >= 32 ? ' — এবার ৩২ KB ধরে' : '') +
      '। C-র malloc এটা পারে না: কোন variable-এ কোন raw address আছে সে জানে না।', 'ok');
  }

  // ---- scenes
  function load(layout, flashAll) {
    blocks = []; heapKB = HEAP0; bites = 0; mapped = false; syscalls = 0; hotMap = false;
    let off = 0;
    layout.forEach(function (p) { blocks.push({ id: nextId++, off: off, size: p[0], used: p[1] }); off += p[0]; });
    hot = flashAll ? blocks.map(function (b) { return b.id; }) : [];
    log.clear();
    log.add('[heap] ' + addr(0) + ' – ' + addr(HEAP0) + '   128 KB, brk দিয়ে আগেই নেওয়া', 'm');
    refresh();
  }

  function preset() {
    load(PRESET, true);
    log.add('[preset] chapter-এর ছবি: 56 KB free, biggest hole 16 KB', 'm');
    note(u, 'Chapter-এর ছবি: মোট <b>৫৬ KB</b> খালি, কিন্তু সবচেয়ে বড় একটানা ফাঁক <b>১৬ KB</b>। এবার malloc(32 KB) চাপো।');
  }

  function reset() {
    load([[HEAP0, false]], false);
    note(u, '১২৮ KB-র খালি heap — chapter-এর ছবির মাপ। malloc চাপো: allocator খালি block-এর তালিকায় প্রথম মানানসই ফাঁকটাই দেয়; block-এ click করলে free।');
  }

  reset();
}
