/* _lib.js
   Shared building blocks for the simulators in this folder.

   A simulator module exports mount(root): root is the placeholder
   <div class="sim"> from the chapter (title + description already inside).
   The usual shape:

     import { ui, button, range, playButton, ticker, note } from './_lib.js';
     export function mount(root) {
       const u = ui(root);                    // .sim-body with controls + stage
       u.controls.append(button('↺ Reset', reset));
       u.stage.append(mySvg);
       note(u, 'লক্ষ করো: …');
     }

   Everything here is plain DOM; there is no framework and no bundler.
   Labels are Bangla with English technical terms, like the chapters.
*/

const SVG_NS = 'http://www.w3.org/2000/svg';

/* ---------- element builders ----------
   el('div', { class: 'x', onclick: fn, style: { width: '1px' } }, 'text', child, [more])
   svg('rect', { x: 0, y: 0, width: 10, height: 10, class: 'b-u' })
   Attributes are set with setAttribute; on<event> keys become listeners;
   text: sets textContent; html: sets innerHTML (use only for trusted markup). */

export function el(tag, attrs, ...children) {
  return build(document.createElement(tag), attrs, children);
}

export function svg(tag, attrs, ...children) {
  return build(document.createElementNS(SVG_NS, tag), attrs, children);
}

function build(node, attrs, children) {
  if (attrs) {
    Object.keys(attrs).forEach(function (k) {
      const v = attrs[k];
      if (v === null || v === undefined || v === false) return;
      if (k.slice(0, 2) === 'on' && typeof v === 'function') node.addEventListener(k.slice(2), v);
      else if (k === 'style' && typeof v === 'object') Object.assign(node.style, v);
      else if (k === 'text') node.textContent = v;
      else if (k === 'html') node.innerHTML = v;
      else node.setAttribute(k, v === true ? '' : v);
    });
  }
  append(node, children);
  return node;
}

export function append(node, children) {
  (Array.isArray(children) ? children : [children]).forEach(function (c) {
    if (c === null || c === undefined || c === false) return;
    if (Array.isArray(c)) append(node, c);
    else if (c instanceof Node) node.appendChild(c);
    else node.appendChild(document.createTextNode(String(c)));
  });
  return node;
}

export function clear(node) {
  while (node.firstChild) node.removeChild(node.firstChild);
  return node;
}

/* ---------- layout ----------
   ui(root) appends the standard body: a controls row and a stage.
   Returns { body, controls, stage } — add a note with note(u, text). */

export function ui(root) {
  const controls = el('div', { class: 'sim-controls' });
  const stage = el('div', { class: 'sim-stage' });
  const body = el('div', { class: 'sim-body' }, controls, stage);
  root.appendChild(body);
  return { root: root, body: body, controls: controls, stage: stage, noteEl: null };
}

/* note(u, html, kind): the "লক্ষ করো" line under the stage. kind: '', 'ok', 'd', 'k'.
   Pass trusted markup only (the simulators write their own text). */
export function note(u, html, kind) {
  if (!u.noteEl) { u.noteEl = el('p', { class: 'sim-note' }); u.body.appendChild(u.noteEl); }
  u.noteEl.className = 'sim-note' + (kind ? ' ' + kind : '');
  u.noteEl.innerHTML = html || '';
  return u.noteEl;
}

/* ---------- controls ---------- */

export function button(label, onClick, kind) {
  return el('button', { class: 'sim-btn' + (kind ? ' ' + kind : ''), type: 'button', onclick: onClick }, label);
}

/* range('Core', { min: 1, max: 16, value: 12 }, fn) → { el, input, get(), set(v) }; fn(value) on input */
export function range(label, opts, onInput) {
  const input = el('input', { type: 'range', min: opts.min, max: opts.max, step: opts.step || 1, value: opts.value });
  const val = el('span', { class: 'val' }, fmt(opts.value));
  function fmt(v) { return opts.fmt ? opts.fmt(v) : String(v); }
  const wrap = el('label', { class: 'sim-field' }, label, input, val);
  const api = {
    el: wrap,
    input: input,
    get: function () { return Number(input.value); },
    set: function (v) { input.value = v; val.textContent = fmt(Number(v)); }
  };
  input.addEventListener('input', function () {
    val.textContent = fmt(Number(input.value));
    if (onInput) onInput(Number(input.value));
  });
  return api;
}

/* select('Mode', [{ value: 'a', label: 'A' }], 'a', fn) → { el, input, get(), set(v) } */
export function select(label, options, value, onChange) {
  const input = el('select', null, options.map(function (o) {
    return el('option', { value: o.value, selected: o.value === value ? true : null }, o.label);
  }));
  input.addEventListener('change', function () { if (onChange) onChange(input.value); });
  return {
    el: el('label', { class: 'sim-field' }, label, input),
    input: input,
    get: function () { return input.value; },
    set: function (v) { input.value = v; }
  };
}

export function checkbox(label, checked, onChange) {
  const input = el('input', { type: 'checkbox', checked: checked ? true : null });
  input.addEventListener('change', function () { if (onChange) onChange(input.checked); });
  return { el: el('label', { class: 'sim-field' }, input, label), input: input, get: function () { return input.checked; } };
}

/* a line break inside the controls row */
export function sep() { return el('span', { class: 'sim-sep' }); }

/* ---------- stat chips: chips(u) then c.add('PID', 4101, 'u') → { set(v) } ---------- */
export function chips(parent) {
  const wrap = el('div', { class: 'sim-chips' });
  parent.appendChild(wrap);
  return {
    el: wrap,
    add: function (label, value, kind) {
      const v = el('span', { class: 'v' }, String(value));
      const chip = el('span', { class: 'sim-chip' + (kind ? ' ' + kind : '') }, label, v);
      wrap.appendChild(chip);
      return {
        el: chip,
        set: function (x, k) {
          v.textContent = String(x);
          if (k !== undefined) chip.className = 'sim-chip' + (k ? ' ' + k : '');
        }
      };
    }
  };
}

/* ---------- mode badge: USER / KERNEL ---------- */
export function modeBadge(initial) {
  const b = el('span', { class: 'sim-mode' });
  const api = {
    el: b,
    set: function (mode) {   // 'user' | 'kernel' | 'dead' | ''
      b.className = 'sim-mode' + (mode ? ' ' + mode : '');
      b.textContent = mode === 'user' ? 'USER MODE' : mode === 'kernel' ? 'KERNEL MODE' : mode === 'dead' ? 'KILLED' : '—';
    }
  };
  api.set(initial || 'user');
  return api;
}

/* ---------- log panel: const log = logPanel(parent); log.add('openat(...) = 17', 'k') ---------- */
export function logPanel(parent, max) {
  const box = el('div', { class: 'sim-log', 'aria-live': 'polite' });
  parent.appendChild(box);
  return {
    el: box,
    add: function (text, kind) {
      const line = el('div', { class: kind || null }, text);
      box.appendChild(line);
      while (box.childNodes.length > (max || 60)) box.removeChild(box.firstChild);
      box.scrollTop = box.scrollHeight;
      return line;
    },
    clear: function () { clear(box); }
  };
}

/* ---------- panels and tables ---------- */

/* panel(parent, 'Kernel space', 'k') → the .sim-panel element; append children to it */
export function panel(parent, title, kind) {
  const p = el('div', { class: 'sim-panel' + (kind ? ' ' + kind : '') },
    title !== null && title !== undefined ? el('div', { class: 'sim-panel-title' }, title) : null);
  if (parent) parent.appendChild(p);
  return p;
}

/* table(['PID', 'State'], rows) where a row is an array of cell values or
   { cells: [...], class: 'cur' }; a cell may be a value or { text, class }. */
export function table(headers, rows) {
  const t = el('table', { class: 'sim-table' },
    el('thead', null, el('tr', null, headers.map(function (h) { return el('th', null, h); }))),
    el('tbody', null, (rows || []).map(row)));
  function row(r) {
    const cells = Array.isArray(r) ? r : r.cells;
    return el('tr', { class: (r && r.class) || null }, cells.map(function (c) {
      if (c && typeof c === 'object' && !(c instanceof Node)) return el('td', { class: c.class || null }, c.text);
      return el('td', null, c);
    }));
  }
  t.setRows = function (rows) {
    const tb = t.querySelector('tbody');
    clear(tb);
    rows.forEach(function (r) { tb.appendChild(row(r)); });
  };
  return t;
}

/* code listing: const c = codeList(lines); c.current(i) highlights line i; c.mark(i, 'done') */
export function codeList(lines) {
  const box = el('div', { class: 'sim-code' }, lines.map(function (l) {
    return el('span', { class: 'ln', html: typeof l === 'string' ? escapeHtml(l) : l.html });
  }));
  const spans = Array.prototype.slice.call(box.children);
  box.current = function (i) {
    spans.forEach(function (s, j) {
      s.classList.toggle('cur', j === i);
      s.classList.toggle('done', i !== null && i !== undefined && j < i);
      s.classList.remove('bad');
    });
    if (i !== null && i !== undefined && spans[i]) scrollIntoViewIfNeeded(spans[i]);
  };
  box.mark = function (i, cls) { if (spans[i]) spans[i].classList.add(cls); };
  box.lines = spans;
  return box;
}

/* stepper: numbered steps with one current step.
   const s = stepper(u.controls, steps, render)   — steps: [{ title, detail, kind }]
   render(i, step) is called on every change (i = -1 before the first step).
   Adds "→ পরের ধাপ", "← আগের", "↺" buttons to the controls; the step list
   itself is returned as s.list — append it to the stage or a panel. */
export function stepper(controls, steps, render) {
  let i = -1;
  const list = el('ol', { class: 'sim-steps' }, steps.map(function (s, j) {
    return el('li', null, el('span', { class: 'n' }, String(j + 1)),
      el('span', null, s.title, s.detail ? el('span', { class: 'd' }, s.detail) : null));
  }));
  const items = Array.prototype.slice.call(list.children);
  const prev = button('← আগের', function () { go(i - 1); });
  const next = button('→ পরের ধাপ', function () { go(i + 1); }, 'primary');
  const reset = button('↺ Reset', function () { go(-1); });
  controls.append(next, prev, reset);

  function go(n) {
    if (n < -1 || n >= steps.length) return;
    i = n;
    items.forEach(function (li, j) {
      li.className = (j === i ? 'cur' : j < i ? 'done' : '') + (j === i && steps[j].kind ? ' ' + steps[j].kind : '');
    });
    prev.disabled = i < 0;
    next.disabled = i >= steps.length - 1;
    render(i, i >= 0 ? steps[i] : null);
  }
  const api = { list: list, go: go, next: function () { go(i + 1); }, reset: function () { go(-1); },
    get index() { return i; }, buttons: { prev: prev, next: next, reset: reset } };
  go(-1);
  return api;
}

/* ---------- time ----------
   const t = ticker(root, step, 400); t.start(); t.stop(); t.toggle(); t.setMs(200)
   step() runs every t.ms while running. A simulator inside a hidden chapter
   (display:none) or a background tab stops itself, so nothing keeps
   running after the reader navigates away. */
export function ticker(root, step, ms) {
  let timer = null;
  const t = {
    running: false,
    ms: ms || 400,
    onchange: null,
    start: function () {
      if (t.running) return;
      t.running = true;
      timer = setInterval(tick, t.ms);
      if (t.onchange) t.onchange(true);
    },
    stop: function () {
      if (!t.running) return;
      t.running = false;
      clearInterval(timer);
      timer = null;
      if (t.onchange) t.onchange(false);
    },
    toggle: function () { if (t.running) t.stop(); else t.start(); },
    setMs: function (v) {
      t.ms = v;
      if (t.running) { clearInterval(timer); timer = setInterval(tick, t.ms); }
    }
  };
  function tick() {
    if (!root.isConnected || root.offsetParent === null || document.hidden) { t.stop(); return; }
    step();
  }
  return t;
}

/* a Play/Pause button bound to a ticker */
export function playButton(t, labels) {
  const on = (labels && labels.on) || '⏸ থামাও';
  const off = (labels && labels.off) || '▶ চালাও';
  const b = button(off, function () { t.toggle(); }, 'primary');
  const prevChange = t.onchange;
  t.onchange = function (running) {
    b.textContent = running ? on : off;
    if (prevChange) prevChange(running);
  };
  return b;
}

/* ---------- formatting ---------- */

export function hex(n, digits) {
  let s = Math.max(0, Math.floor(n)).toString(16);
  if (digits) s = s.padStart(digits, '0');
  return '0x' + s;
}

export function pad(s, n) { return String(s).padStart(n, ' '); }

export function escapeHtml(s) {
  return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

/* 1536 → "1.5 KB"; 3145728 → "3 MB" */
export function bytes(n) {
  if (n < 1024) return n + ' B';
  if (n < 1024 * 1024) return trim(n / 1024) + ' KB';
  if (n < 1024 * 1024 * 1024) return trim(n / 1024 / 1024) + ' MB';
  return trim(n / 1024 / 1024 / 1024) + ' GB';
}
function trim(x) { return (Math.round(x * 10) / 10).toString(); }

/* flash(node): replay the .flash animation on a node */
export function flash(node) {
  node.classList.remove('flash');
  void node.getBoundingClientRect();
  node.classList.add('flash');
}

function scrollIntoViewIfNeeded(node) {
  const box = node.parentElement;
  if (!box) return;
  const top = node.offsetTop - box.offsetTop;
  if (top < box.scrollTop || top + node.offsetHeight > box.scrollTop + box.clientHeight) {
    box.scrollTop = Math.max(0, top - box.clientHeight / 2);
  }
}
