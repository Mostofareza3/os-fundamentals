/* timeshare.js — Chapter 1
   Time-sharing: N cores, M processes that each want a whole core
   (the chapter's 24 busy loops on 12 cores). Every tick the kernel hands
   each core to the next runnable process in round-robin order; the
   per-process CPU% converges to cores / processes.
*/

import { ui, button, range, playButton, ticker, note, chips, svg, clear } from './_lib.js';

export function mount(root) {
  const u = ui(root);

  let cores = 12;
  let procs = 24;
  let tick = 0;
  let cursor = 0;          // round-robin position in the run queue
  let ran = [];            // ticks each process got
  let onCore = [];         // pid index per core this tick (-1 = idle)

  const coreR = range('Core', { min: 1, max: 16, value: cores }, function (v) { cores = v; reset(); });
  const procR = range('Process', { min: 1, max: 32, value: procs }, function (v) { procs = v; reset(); });
  const t = ticker(root, step, 350);
  u.controls.append(coreR.el, procR.el, playButton(t), button('→ ১ tick', step), button('↺ Reset', reset));

  const stats = chips(u.body);
  const cTick = stats.add('tick', 0);
  const cShare = stats.add('প্রতি process CPU', '—', 'u');
  const cIdle = stats.add('idle core', 0, 'k');

  const svgEl = svg('svg', { viewBox: '0 0 800 10', role: 'img', 'aria-label': 'Cores at the top, processes below; each tick shows which process runs on which core and the CPU share each process has received so far' });
  u.stage.appendChild(svgEl);

  function reset() {
    t.stop();
    tick = 0; cursor = 0;
    ran = new Array(procs).fill(0);
    onCore = new Array(cores).fill(-1);
    draw();
  }

  function step() {
    // The kernel's timer interrupt fires: every core is handed to the next
    // process in the queue. A busy loop never yields, so this is the only
    // reason it ever leaves the core.
    onCore = new Array(cores).fill(-1);
    for (let c = 0; c < cores; c++) {
      if (c >= procs) break;                      // more cores than processes: the rest idle
      const p = (cursor + c) % procs;
      onCore[c] = p;
      ran[p]++;
    }
    cursor = (cursor + Math.min(cores, procs)) % procs;
    tick++;
    draw();
  }

  function draw() {
    clear(svgEl);
    const W = 800;
    const coreCols = Math.min(cores, 8);
    const coreRows = Math.ceil(cores / coreCols);
    const cw = Math.floor((W - 40 - (coreCols - 1) * 8) / coreCols);
    const ch = 44;
    let y = 22;

    svgEl.appendChild(svg('text', { x: 20, y: y, class: 't-k t-s' }, 'CPU — ' + cores + ' core'));
    y += 8;
    for (let c = 0; c < cores; c++) {
      const col = c % coreCols, row = Math.floor(c / coreCols);
      const x = 20 + col * (cw + 8), yy = y + row * (ch + 8);
      const p = onCore[c];
      svgEl.appendChild(svg('rect', { x: x, y: yy, width: cw, height: ch, rx: 6, class: p >= 0 ? 'b-u' : 'b-m' }));
      svgEl.appendChild(svg('text', { x: x + 8, y: yy + 17, class: 't-m t-s' }, 'core ' + c));
      svgEl.appendChild(svg('text', { x: x + 8, y: yy + 35, class: p >= 0 ? 'mono' : 't-m t-s' }, p >= 0 ? 'node · P' + (p + 1) : 'idle'));
    }
    y += coreRows * (ch + 8) + 22;

    svgEl.appendChild(svg('text', { x: 20, y: y, class: 't-u t-s' }, procs + ' process — প্রত্যেকে একটা while(true){} loop, CPU% এ পর্যন্ত'));
    y += 8;
    const pCols = Math.min(procs, 8);
    const pRows = Math.ceil(procs / pCols);
    const pw = Math.floor((W - 40 - (pCols - 1) * 8) / pCols);
    const ph = 46;
    for (let p = 0; p < procs; p++) {
      const col = p % pCols, row = Math.floor(p / pCols);
      const x = 20 + col * (pw + 8), yy = y + row * (ph + 8);
      const running = onCore.indexOf(p) >= 0;
      const share = tick ? ran[p] / tick : 0;
      svgEl.appendChild(svg('rect', { x: x, y: yy, width: pw, height: ph, rx: 6, class: running ? 'b-u' : 'b' }));
      svgEl.appendChild(svg('text', { x: x + 8, y: yy + 16, class: 'mono' }, 'P' + (p + 1)));
      svgEl.appendChild(svg('text', { x: x + pw - 8, y: yy + 16, 'text-anchor': 'end', class: running ? 't-u t-s' : 't-m t-s' }, running ? 'running' : 'waiting'));
      // share bar
      svgEl.appendChild(svg('rect', { x: x + 8, y: yy + 25, width: pw - 16, height: 8, rx: 3, class: 'f-m' }));
      svgEl.appendChild(svg('rect', { x: x + 8, y: yy + 25, width: Math.max(0, (pw - 16) * share), height: 8, rx: 3, class: running ? 'f-u' : 'f-k' }));
      svgEl.appendChild(svg('text', { x: x + 8, y: yy + 42, class: 'mono' }, tick ? Math.round(share * 100) + '%' : '—'));
    }
    y += pRows * (ph + 8) + 10;
    svgEl.setAttribute('viewBox', '0 0 ' + W + ' ' + y);
    if (procs > 6 || cores > 6) svgEl.classList.add('wide'); else svgEl.classList.remove('wide');

    cTick.set(tick);
    const idle = Math.max(0, cores - procs);
    cIdle.set(idle);
    const expected = Math.min(100, Math.round((cores / procs) * 100));
    cShare.set(tick ? '≈ ' + expected + '%' : '—');

    if (!tick) {
      note(u, 'Chapter-এর experiment-এর মতো: ১২ core, ২৪টা <code>while(true){}</code>। ▶ চাপো — প্রতিটা tick হলো timer interrupt-এর একটা পালা, যখন kernel প্রতিটা core-এ পরের process-কে বসায়।');
    } else if (procs <= cores) {
      note(u, 'Process সংখ্যা core-এর সমান বা কম: প্রত্যেকে <b>১০০%</b> পাচ্ছে, ' + idle + 'টা core idle। ভাগাভাগির দরকারই পড়ছে না।', 'ok');
    } else {
      note(u, cores + ' core, ' + procs + ' দাবিদার: kernel পালা করে দিচ্ছে, তাই প্রত্যেকে প্রায় <b>' + expected + '%</b> — <code>top</code>-এ তুমি ঠিক এটাই দেখেছ। কোনো process নিজে থেকে core ছাড়ে না; প্রতিটা tick-এ kernel-ই তাকে সরায়।');
    }
  }

  reset();
}
