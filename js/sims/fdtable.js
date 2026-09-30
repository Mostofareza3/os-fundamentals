/* fdtable.js — Chapter 3
   One process's file descriptor table. 0, 1, 2 are open from the start
   (all three point at the terminal); a Node process has also opened 3–13
   for itself at startup, so the first openSync returns 14 — the chapter's
   "14 15". Every open takes the smallest free number, close frees the
   slot, read advances the slot's offset, and the kernel refuses to go past
   ulimit -n with EMFILE. The table lives in kernel space; the process only
   ever sees the numbers.
*/

import { ui, button, range, select, checkbox, sep, note, chips, logPanel, panel, table, el, clear, flash } from './_lib.js';

const HOSTS = '/etc/hosts';
const CONFIG = 'config.json';
const CONFIG_SIZE = 14;      // Chapter 1: read(17, "{\"port\":3000}\n", 14) = 14

export function mount(root) {
  if (root.querySelector('.sim-body')) return;
  const u = ui(root);

  let nodeLike = true;       // Node opened 3–13 for itself at startup
  let limit = 16;            // ulimit -n: fd numbers must stay below this
  let fds = {};              // fd → { what, mode, offset, kind: 'std' | 'node' | 'file' }
  let closed = {};           // numbers closed since reset, to spot a reused one
  let picked = null;         // fd chosen in the select (read / close act on it)
  let syscalls = 0;
  let mark = null;           // { fd, cls, fresh }: the row the last action touched

  const bHosts = button("openSync('/etc/hosts', 'r')", function () { open(HOSTS); });
  const bConfig = button("openSync('config.json', 'r')", function () { open(CONFIG); });
  const pick = select('fd', [], '', function (v) { picked = Number(v); draw(); });
  const bRead = button('readSync(fd, buf, 0, 14)', read);
  const bClose = button('closeSync(fd)', close);
  const bLog = button("console.log('hi')", write);
  const limitR = range('ulimit -n (সীমা)', { min: 6, max: 24, value: limit }, function (v) { limit = v; draw(); });
  const nodeC = checkbox('Node-এর মতো: 3–13 নিজের কাজে খোলা', true, function (on) { nodeLike = on; reset(); });
  u.controls.append(bHosts, bConfig, pick.el, bRead, bClose, bLog, button('↺ Reset', reset), sep(), limitR.el, nodeC.el);

  const stats = chips(u.body);
  u.body.insertBefore(stats.el, u.stage);
  const cOpen = stats.add('খোলা fd', '—');
  const cNext = stats.add('পরের খালি নম্বর', '—', 'u');
  const cSys = stats.add('syscall', 0, 'k');

  const cols = el('div', { class: 'sim-cols' });
  const left = panel(cols, 'Kernel space — এই process-এর fd table', 'k');
  const tbl = table(['fd', 'কী', 'mode', 'offset'], []);
  left.appendChild(tbl);
  left.appendChild(el('p', { class: 'sim-desc', style: { marginTop: '8px' } }, '0 = stdin, 1 = stdout, 2 = stderr — terminal থেকে চালানো, তাই তিনটাই terminal-এর দিকে।'));
  const right = panel(cols, 'strace-এর চোখে', 'u');
  const log = logPanel(right, 40);
  right.appendChild(el('div', { class: 'sim-panel-title', style: { marginTop: '10px' } }, 'terminal — fd 0, 1, 2 এদিকে'));
  const term = logPanel(right, 5);
  u.stage.appendChild(cols);

  function nextFree() {
    let fd = 0;
    while (fds[fd]) fd++;
    return fd;
  }

  function highest() {
    return Object.keys(fds).reduce(function (m, k) { return Math.max(m, Number(k)); }, -1);
  }

  function openFiles() {
    return Object.keys(fds).map(Number).filter(function (fd) { return fds[fd].kind === 'file'; }).sort(function (a, b) { return a - b; });
  }

  function touch(fd, cls) { mark = { fd: fd, cls: cls || null, fresh: true }; }

  function reset() {
    fds = {}; closed = {}; picked = null; syscalls = 0; mark = null;
    fds[0] = { what: 'terminal', mode: 'r', kind: 'std' };     // stdin
    fds[1] = { what: 'terminal', mode: 'w', kind: 'std' };     // stdout
    fds[2] = { what: 'terminal', mode: 'w', kind: 'std' };     // stderr
    if (nodeLike) for (let fd = 3; fd <= 13; fd++) fds[fd] = { what: 'Node', mode: '—', kind: 'node' };
    log.clear();
    term.clear();
    note(u, '0, 1, 2 আগে থেকেই খোলা — তিনটাই terminal-এর দিকে' +
      (nodeLike ? '; Node চালু হওয়ার সময় 3–13 নিজের কাজে খুলে রেখেছে' : '') +
      '। <code>openSync</code> চাপো — দেখো কোন নম্বর আসে।');
    draw();
  }

  function open(path) {
    const fd = nextFree();
    syscalls++;
    log.add("fs.openSync('" + path + "', 'r')", 'u');
    if (fd >= limit) {
      // the smallest free number is past ulimit -n: the kernel refuses
      log.add('openat(AT_FDCWD, "' + path + '", O_RDONLY) = -1 EMFILE (Too many open files)', 'd');
      log.add('throw Error("EMFILE: too many open files, open \'' + path + '\'")', 'd');
      touch('limit');
      note(u, 'kernel প্রতি process-এর খোলা fd-র সংখ্যা সীমিত রাখে (<code>ulimit -n</code> ' + limit + ') — এটা তোমার JS-এর bug না, resource management-এর সীমা। একটা <code>closeSync</code> করো, বা সীমা বাড়াও।', 'd');
      draw();
      return;
    }
    const reused = !!closed[fd];
    fds[fd] = { what: path, mode: 'r', offset: 0, kind: 'file' };
    picked = fd;
    touch(fd);
    log.add('openat(AT_FDCWD, "' + path + '", O_RDONLY) = ' + fd, 'k');
    if (reused) {
      note(u, 'fd ' + fd + ' close করার পর পরের open আবার <b>' + fd + '</b>-ই পেল — নম্বর table-এর index মাত্র।', 'ok');
    } else if (nodeLike) {
      note(u, 'সবচেয়ে ছোট খালি নম্বর: <b>' + fd + '</b> (3–13 Node-এর দখলে)' +
        (fd === 15 && fds[14] ? ' — দুইবার openSync = chapter-এর <code>14 15</code>।' : '।'), 'ok');
    } else {
      note(u, 'সবচেয়ে ছোট খালি নম্বর: <b>' + fd + '</b>' +
        (fd === 3 ? ' — 3–13 কারও দখলে নেই, তাই 0, 1, 2-এর ঠিক পরেরটাই।' : '।'), 'ok');
    }
    draw();
  }

  function read() {
    const e = picked !== null ? fds[picked] : null;
    if (!e || e.kind !== 'file') return;
    syscalls++;
    log.add('fs.readSync(' + picked + ', buf, 0, 14)', 'u');
    touch(picked, 'changed');
    if (e.what === CONFIG && e.offset >= CONFIG_SIZE) {
      log.add('read(' + picked + ', "", 14) = 0', 'k');
      note(u, '<code>config.json</code> ১৪ byte-এর file (Chapter 1-এর); offset ইতিমধ্যে 14, তাই read <b>0</b> byte দিল — file শেষ। কতদূর পড়া হয়েছে সেটা kernel-এর খাতায়, তোমার JS-এ না।');
    } else {
      e.offset += 14;
      log.add('read(' + picked + ', ' + (e.what === CONFIG ? '"{\\"port\\":3000}\\n"' : '…') + ', 14) = 14', 'k');
      note(u, '<code>read(' + picked + ', …, 14) = 14</code>: kernel ঘরটায় লিখে রাখল কতদূর পড়া হলো — offset <b>' + e.offset + '</b>। পরের read এখান থেকেই শুরু; তুমি path-ও পাঠাওনি, offset-ও না — শুধু নম্বর।');
    }
    draw();
  }

  function close() {
    const e = picked !== null ? fds[picked] : null;
    if (!e || e.kind !== 'file') return;
    const fd = picked;
    syscalls++;
    log.add('fs.closeSync(' + fd + ')', 'u');
    log.add('close(' + fd + ') = 0', 'k');
    delete fds[fd];
    closed[fd] = true;
    picked = null;
    touch(fd, 'changed');
    const nf = nextFree();
    note(u, '<code>close(' + fd + ') = 0</code>: ঘর ' + fd + ' খালি। এখন সবচেয়ে ছোট খালি নম্বর <b>' + nf + '</b>' +
      (nf === fd ? ' — পরের open এটাই পাবে।' : '।'));
    draw();
  }

  function write() {
    syscalls++;
    log.add("console.log('hi')", 'u');
    log.add('write(1, "hi\\n", 3) = 3', 'k');
    term.add('hi');
    touch(1, 'changed');
    note(u, '<code>console.log</code> আসলে fd <b>1</b>-এ একটা <code>write</code> syscall — 1 = stdout, terminal-এর দিকে খোলা, তাই "hi" terminal-এ গেল।');
    draw();
  }

  function draw() {
    // the fd select lists only files the reader opened (0, 1, 2 and Node's own stay put)
    const files = openFiles();
    if (picked === null || !fds[picked] || fds[picked].kind !== 'file') picked = files.length ? files[0] : null;

    const nf = nextFree();
    const full = nf >= limit;
    const top = Math.max(highest(), full ? -1 : nf);
    const dim = function (t) { return { text: t, class: 'm' }; };
    const rows = [];
    let hit = -1;                                   // index of the row to flash
    const push = function (fd, row) { rows.push(row); if (mark && mark.fd === fd) hit = rows.length - 1; };
    for (let fd = 0; fd <= top; fd++) {
      const e = fds[fd];
      const cls = ((fd === picked ? 'cur ' : '') + (mark && mark.fd === fd && mark.cls ? mark.cls : '')).trim() || null;
      if (e && e.kind === 'node') {
        if (fd === 3) push(fd, { cells: [dim('3–13'), dim('Node-এর নিজের'), dim('—'), dim('—')] });
      } else if (!e) {
        push(fd, { class: cls, cells: [dim(String(fd)), dim(fd === nf ? 'খালি ← পরের' : 'খালি'), dim('—'), dim('—')] });
      } else {
        push(fd, { class: cls, cells: [String(fd), e.what, e.mode, e.kind === 'file' ? String(e.offset) : '—'] });
      }
    }
    const lim = full ? 'd' : 'm';
    push('limit', { cells: [{ text: '≥ ' + limit, class: lim }, { text: full ? 'ভরা → EMFILE' : 'ulimit -n ' + limit, class: lim }, dim(''), dim('')] });
    tbl.setRows(rows);
    if (mark && mark.fresh && hit >= 0) {
      const tr = tbl.querySelectorAll('tbody tr')[hit];
      if (tr) flash(tr);
    }
    if (mark) mark.fresh = false;

    clear(pick.input);
    files.forEach(function (fd) {
      pick.input.appendChild(el('option', { value: String(fd), selected: fd === picked ? true : null }, fd + ' · ' + fds[fd].what));
    });
    pick.input.disabled = !files.length;
    bRead.disabled = bClose.disabled = picked === null;
    bRead.textContent = 'readSync(' + (picked === null ? 'fd' : picked) + ', buf, 0, 14)';
    bClose.textContent = 'closeSync(' + (picked === null ? 'fd' : picked) + ')';

    cOpen.set(Object.keys(fds).length + ' / ' + limit, full ? 'd' : '');
    cNext.set(full ? 'নেই' : nf, full ? 'd' : 'u');
    cSys.set(syscalls);
  }

  reset();
}
