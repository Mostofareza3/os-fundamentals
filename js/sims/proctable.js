/* proctable.js — Chapter 3
   One program file, many processes. Disk holds a single `node` file
   (104 MB, Mach-O 64-bit executable arm64) — passive, it never changes.
   Every "run" starts the chapter's one-liner in a terminal (up to four,
   each with its own zsh): the kernel creates a process with its own PID
   (4101, 4187, then +43), PPID = that terminal's zsh (3990, 4012, …),
   uid 501, fds 0 1 2, its own `count` in its own address space, and one
   PCB in the kernel's process table. Simulated time runs in sub-ticks
   (4 per second, 175 ms real each): once a second a process's timer
   fires, it runs for one sub-tick (prints "<pid> <count>") and sleeps
   again. kill / exit(3) end one process; the others keep counting
   (isolation), the parent shell gets the exit news, and the kernel drops
   the PCB a moment later.
*/

import { ui, button, playButton, ticker, note, chips, panel, logPanel, table, svg, el, append, clear, flash } from './_lib.js';

const CMD = 'node -e "let count = 0; setInterval(() => console.log(process.pid, ++count), 1000)"';
const SUB = 4;                              // sub-ticks per simulated second
const MAX_TERMS = 4;
const SHELLS = [3990, 4012, 4040, 4068];    // zsh PID of terminal 1..4 (the chapter's 3990 / 4012, then +28)
const PIDS = [4101, 4187];                  // the chapter's two PIDs; after that +43 each
const PID_STEP = 43;
const PCB_LINGER = SUB + 2;                 // sub-ticks a finished process stays in the table
const BN = { 2: 'দুইটা', 3: 'তিনটা', 4: 'চারটা' };

export function mount(root) {
  if (root.querySelector('.sim-body')) return;   // mounted already
  const u = ui(root);

  let procs = [];        // { pid, ppid, term, phase, count, state, alive, created, diesAt, reused, tr, cells }
  let terms = [];        // { n, shell, panel, log, killBtn, exitBtn, proc }
  let sub = 0;           // sub-tick counter; sub / SUB = simulated seconds
  let pidIdx = 0;        // how many times the file has been run
  let event = { type: 'init' };

  /* ---------- controls ---------- */
  const runBtn = button('▶ নতুন terminal-এ চালাও', run, 'primary');
  const t = ticker(root, subtick, 175);
  u.controls.append(runBtn, playButton(t, { off: '▶ ঘড়ি চালাও', on: '⏸ ঘড়ি থামাও' }), button('↺ Reset', reset));

  const stats = chips(u.body);
  u.body.insertBefore(stats.el, u.stage);
  stats.add('disk-এ file', 1);
  const cProc = stats.add('process', 0, 'u');
  const cPcb = stats.add('PCB (kernel)', 0, 'k');
  const cTime = stats.add('সময়', '0 s');

  /* ---------- stage: disk + terminals on top, the kernel's table below ---------- */
  const top = el('div', { class: 'sim-cols w-12' });
  const disk = panel(top, 'Disk');
  const diskSvg = svg('svg', { viewBox: '0 0 240 168', role: 'img', 'aria-label': 'The node executable on disk: 104 MB, Mach-O 64-bit arm64, header, machine code and initial data; passive, unchanged however many times it is run' });
  disk.appendChild(diskSvg);
  const runsText = drawDisk();

  const termWrap = el('div', { class: 'sim-cols' });          // up to 4 terminals, 2 per row
  const placeholder = panel(null, 'terminal');
  placeholder.appendChild(el('div', { class: 'sim-log' }));
  top.appendChild(termWrap);
  u.stage.appendChild(top);

  const kern = panel(u.stage, 'Kernel space — process table (একটা PCB প্রতি process)', 'k');
  const tbl = table(['PID', 'PPID', 'state', 'count (address space)', 'open fds', 'uid'], []);
  const tbody = tbl.querySelector('tbody');
  const emptyRow = el('tr', null, el('td', { colspan: 6, class: 'm' }, 'কোনো process নেই — kernel-এর খাতাও খালি'));
  tbody.appendChild(emptyRow);
  kern.appendChild(el('div', { style: { overflowX: 'auto' } }, tbl));

  /* ---------- the program file (never changes) ---------- */
  function drawDisk() {
    const g = [
      svg('rect', { x: 1, y: 1, width: 238, height: 166, rx: 10, class: 'b' }),
      svg('text', { x: 16, y: 26, class: 't-h' }, 'Program'),
      svg('text', { x: 224, y: 26, 'text-anchor': 'end', class: 't-m t-s' }, 'file on disk · passive'),
      svg('text', { x: 16, y: 48, class: 'mono' }, '/usr/local/bin/node'),
      svg('text', { x: 224, y: 48, 'text-anchor': 'end', class: 'mono' }, '104 MB'),
      svg('text', { x: 16, y: 66, class: 't-m t-s' }, 'Mach-O 64-bit executable arm64')
    ];
    ['header · entry point', 'machine code', 'initial data'].forEach(function (label, i) {
      const y = 76 + i * 25;
      g.push(svg('rect', { x: 16, y: y, width: 208, height: 22, rx: 4, class: 'b-m' }));
      g.push(svg('text', { x: 120, y: y + 15, 'text-anchor': 'middle', class: 't-s' }, label));
    });
    const runs = svg('text', { x: 16, y: 161, class: 't-m t-s' }, 'run 0× · bytes unchanged');
    g.push(runs);
    append(diskSvg, g);
    return runs;
  }

  /* ---------- terminals ---------- */
  function openTerminal() {
    const n = terms.length + 1;
    const tm = { n: n, shell: SHELLS[n - 1], proc: null };
    tm.panel = panel(null, 'terminal ' + n + ' · zsh PID ' + tm.shell);
    tm.log = logPanel(tm.panel, 40);
    tm.log.el.style.height = '112px';
    tm.killBtn = small(button('kill', function () { if (tm.proc) kill(tm.proc); }, 'danger'));
    tm.exitBtn = small(button('exit(3)', function () { if (tm.proc) exit3(tm.proc); }));
    tm.panel.appendChild(el('div', { class: 'sim-controls', style: { marginTop: '8px' } }, tm.killBtn, tm.exitBtn));
    if (placeholder.parentNode) placeholder.remove();
    termWrap.appendChild(tm.panel);
    terms.push(tm);
    return tm;
  }
  function small(b) { Object.assign(b.style, { height: '26px', padding: '0 9px', fontSize: '12.5px' }); return b; }
  function freeTerminal() {
    return terms.find(function (tm) { return !tm.proc || !tm.proc.alive; }) || null;
  }

  /* ---------- the kernel's process table ---------- */
  function makeRow(p) {
    const cells = {
      pid: el('td', { class: 'u' }, String(p.pid)),
      ppid: el('td', null, String(p.ppid)),
      state: el('td', null, ''),
      count: el('td', null, ''),
      fds: el('td', null, '0 1 2'),
      uid: el('td', null, '501')
    };
    p.cells = cells;
    p.tr = el('tr', null, cells.pid, cells.ppid, cells.state, cells.count, cells.fds, cells.uid);
    tbody.appendChild(p.tr);
    flash(p.tr);
  }

  /* ---------- actions ---------- */
  function run() {
    // the shell asks the kernel to start the file: a new process, a new PCB
    let tm = freeTerminal();
    if (!tm) { if (terms.length >= MAX_TERMS) return; tm = openTerminal(); }
    const pid = pidIdx < PIDS.length ? PIDS[pidIdx] : PIDS[PIDS.length - 1] + PID_STEP * (pidIdx - PIDS.length + 1);
    pidIdx++;
    const p = { pid: pid, ppid: tm.shell, term: tm, phase: (tm.n - 1) % SUB, count: 0, state: 'sleeping', alive: true, created: sub, diesAt: 0, reused: !!tm.proc };
    tm.proc = p;
    procs.push(p);
    tm.log.add('$ ' + CMD, 'u');
    makeRow(p);
    event = { type: 'run', p: p };
    if (!t.running) t.start();
    draw();
  }

  function kill(p) {
    // `kill <pid>` from another terminal: the kernel ends the process; its shell reports it
    if (!p.alive) return;
    p.alive = false; p.state = 'terminated'; p.diesAt = sub + PCB_LINGER;
    p.term.log.add('[1]  terminated', 'd');
    p.term.log.add('$', 'm');
    event = { type: 'kill', p: p };
    draw();
  }

  function exit3(p) {
    // the process ends itself with exit code 3; the kernel hands the code to the parent shell
    if (!p.alive) return;
    p.alive = false; p.state = 'exited (code 3)'; p.diesAt = sub + PCB_LINGER;
    p.term.log.add('# process.exit(3)', 'm');
    p.term.log.add('$ echo "exit code: $?"', 'u');
    p.term.log.add('exit code: 3', 'k');
    p.term.log.add('$', 'm');
    event = { type: 'exit', p: p };
    draw();
  }

  function subtick() {
    sub++;
    const s = sub % SUB;
    procs.forEach(function (p) {
      if (!p.alive) return;
      if (s === p.phase && sub > p.created) {      // its timer fired: wake, print, sleep again
        p.count++;
        p.state = 'running';
        p.term.log.add(p.pid + ' ' + p.count);
      } else p.state = 'sleeping';
    });
    // a moment after a process ends, the kernel frees its PCB: the row goes
    procs = procs.filter(function (p) {
      if (p.alive || sub < p.diesAt) return true;
      p.tr.remove();
      if (event.p === p) event.freed = true;
      return false;
    });
    draw();
  }

  function reset() {
    t.stop();
    procs.forEach(function (p) { p.tr.remove(); });
    procs = []; terms = [];
    clear(termWrap);
    termWrap.appendChild(placeholder);
    sub = 0; pidIdx = 0;
    event = { type: 'init' };
    draw();
  }

  /* ---------- render ---------- */
  function draw() {
    const live = procs.filter(function (p) { return p.alive; });

    procs.forEach(function (p) {
      p.tr.className = !p.alive ? 'dead' : p.state === 'running' ? 'cur' : '';
      p.cells.state.textContent = !p.alive ? p.state : p.state === 'running' ? 'running' : 'sleeping (waiting for timer)';
      p.cells.state.className = !p.alive ? 'd' : p.state === 'running' ? 'ok' : 'm';
      p.cells.count.textContent = 'count = ' + p.count;
    });
    emptyRow.style.display = procs.length ? 'none' : '';

    terms.forEach(function (tm) {
      const p = tm.proc;
      const busy = !!(p && p.alive);
      tm.panel.className = 'sim-panel' + (busy && p.state === 'running' ? ' u' : '');
      tm.killBtn.textContent = 'kill ' + (p ? p.pid : '');
      tm.killBtn.disabled = !busy;
      tm.exitBtn.disabled = !busy;
    });

    const free = freeTerminal();
    runBtn.disabled = !free && terms.length >= MAX_TERMS;
    runBtn.textContent = free ? '▶ terminal ' + free.n + '-এ আবার চালাও' : '▶ নতুন terminal-এ চালাও';
    runBtn.title = runBtn.disabled ? 'চারটা terminal-ই ব্যস্ত — একটাকে kill করো' : '';

    runsText.textContent = 'run ' + pidIdx + '× · bytes unchanged';
    cProc.set(live.length);
    cPcb.set(procs.length);
    cTime.set(Math.floor(sub / SUB) + ' s');

    const others = live.filter(function (p) { return p !== event.p; }).map(function (p) { return p.pid; }).join(', ');
    const freed = event.freed ? ' তারপর kernel PCB-টা মুছে দিল — table-এ আর নেই।' : '';
    if (event.type === 'init') {
      note(u, 'একটা file, শূন্যটা process। <b>▶ নতুন terminal-এ চালাও</b> চাপো।');
    } else if (event.type === 'run') {
      const p = event.p;
      if (p.reused) {
        note(u, 'terminal ' + p.term.n + '-এর zsh একই (' + p.ppid + '), কিন্তু process নতুন: PID <b>' + p.pid + '</b>, <code>count</code> আবার 0 থেকে — আগের মান file-এ ছিল না, ছিল মরে যাওয়া process-এর address space-এ।');
      } else if (live.length >= 2) {
        note(u, 'একই file থেকে <b>' + BN[live.length] + '</b> process: আলাদা PID, আলাদা <code>count</code>, আলাদা PCB।', 'ok');
      } else {
        note(u, 'Kernel একটা process বানাল: PID <b>' + p.pid + '</b>, parent zsh ' + p.ppid + ', নিজের address space-এ <code>count = 0</code>। Disk-এর file-টা যেমন ছিল তেমনই — সে passive।');
      }
    } else if (event.type === 'kill') {
      note(u, 'অন্য terminal থেকে <code>kill ' + event.p.pid + '</code>: <b>' + event.p.pid + '</b> মরল' + (others ? ', ' + others + ' নির্বিকারে গুনছে — isolation' : '') + '। Exit-এর খবরটা গেল parent shell ' + event.p.ppid + '-এর কাছে।' + freed, 'd');
    } else if (event.type === 'exit') {
      note(u, '<b>' + event.p.pid + '</b> নিজেই থামল, exit code <b>3</b> — kernel সেটা parent shell ' + event.p.ppid + '-কে জানাল (<code>$?</code>)।' + (others ? ' ' + others + ' নির্বিকারে গুনছে।' : '') + freed, 'k');
    }
  }

  reset();
}
