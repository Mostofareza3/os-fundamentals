/* search.js
   Client-side search over chapter text. Titles are indexed immediately from
   the manifest so search works before any chapter body has loaded; the full
   body index is warmed in the background.
*/

import { chapterMeta, allSections, loadAll, metaOf } from './chapters.js';

let index = null;      // [{id, chapter, anchor, text, weight}]
let selIdx = -1;

/** Title-only index — available before chapter bodies arrive. */
export function buildTitleIndex() {
  index = chapterMeta.map(function (m) {
    return { id: m.id, chapter: m.title, anchor: null, text: m.title, weight: 5 };
  });
}

/** Full-text index over every loaded chapter. */
export function buildFullIndex() {
  const out = [];
  chapterMeta.forEach(function (m) {
    out.push({ id: m.id, chapter: m.title, anchor: null, text: m.title, weight: 5 });
  });

  allSections().forEach(function (sec) {
    if (!sec || sec.dataset.loaded !== '1') return;
    const meta = metaOf(sec.id);
    const title = meta ? meta.title : sec.id;
    const blocks = sec.querySelectorAll('h2, h3, p, li, .box, pre');
    for (let i = 0; i < blocks.length; i++) {
      const txt = (blocks[i].textContent || '').replace(/\s+/g, ' ').trim();
      if (txt.length < 18) continue;
      const tag = blocks[i].tagName;
      out.push({
        id: sec.id,
        chapter: title,
        anchor: blocks[i].id || null,
        text: txt,
        weight: (tag === 'H2' || tag === 'H3') ? 3 : 1
      });
    }
  });

  index = out;
}

export function warmIndex() {
  return loadAll().then(buildFullIndex);
}

function search(q) {
  if (!index) buildTitleIndex();
  const query = q.trim().toLowerCase();
  if (query.length < 2) return [];

  const terms = query.split(/\s+/);
  const hits = [];

  for (let i = 0; i < index.length; i++) {
    const low = index[i].text.toLowerCase();
    let score = 0;
    let all = true;
    for (let t = 0; t < terms.length; t++) {
      const at = low.indexOf(terms[t]);
      if (at === -1) { all = false; break; }
      score += index[i].weight + (at === 0 ? 2 : 0);
    }
    if (all) hits.push({ rec: index[i], score: score, at: low.indexOf(terms[0]) });
  }

  hits.sort(function (a, b) { return b.score - a.score; });

  const seen = {};
  const out = [];
  for (let j = 0; j < hits.length && out.length < 40; j++) {
    const k = hits[j].rec.id + '|' + hits[j].rec.text.slice(0, 40);
    if (seen[k]) continue;
    seen[k] = 1;
    out.push(hits[j]);
  }
  return out;
}

/** Build a highlighted snippet without innerHTML. */
function snippet(text, at, term) {
  const start = Math.max(0, at - 55);
  const s = (start > 0 ? '…' : '') + text.slice(start, at + 130) + '…';
  const frag = document.createDocumentFragment();
  const low = s.toLowerCase();
  let pos = 0;

  for (;;) {
    const i = low.indexOf(term, pos);
    if (i === -1) {
      frag.appendChild(document.createTextNode(s.slice(pos)));
      break;
    }
    frag.appendChild(document.createTextNode(s.slice(pos, i)));
    const mk = document.createElement('mark');
    mk.textContent = s.slice(i, i + term.length);
    frag.appendChild(mk);
    pos = i + term.length;
  }
  return frag;
}

function render(q) {
  const box = document.getElementById('searchResults');
  box.textContent = '';
  selIdx = -1;

  if (!q.trim()) {
    const d = document.createElement('div');
    d.className = 'search-empty';
    d.textContent = 'Chapter এর নাম বা যেকোনো technical term লেখো।';
    box.appendChild(d);
    return;
  }

  const res = search(q);
  if (!res.length) {
    const d = document.createElement('div');
    d.className = 'search-empty';
    d.textContent = 'কিছু পাওয়া যায়নি।';
    box.appendChild(d);
    return;
  }

  const term = q.trim().toLowerCase().split(/\s+/)[0];
  res.forEach(function (h) {
    const a = document.createElement('a');
    a.className = 'sr';
    a.href = '#/' + h.rec.id + (h.rec.anchor ? '@' + h.rec.anchor : '');

    const t = document.createElement('span');
    t.className = 'sr-t';
    t.textContent = h.rec.chapter;

    const c = document.createElement('span');
    c.className = 'sr-c';
    c.appendChild(snippet(h.rec.text, Math.max(0, h.at), term));

    a.appendChild(t);
    a.appendChild(c);
    a.addEventListener('click', close);
    box.appendChild(a);
  });
}

export function open() {
  document.getElementById('searchOverlay').classList.add('on');
  const inp = document.getElementById('searchInput');
  inp.value = '';
  render('');
  inp.focus();
}

export function close() {
  document.getElementById('searchOverlay').classList.remove('on');
}

export function isOpen() {
  return document.getElementById('searchOverlay').classList.contains('on');
}

export function initSearch() {
  const btn = document.getElementById('searchBtn');
  if (btn) btn.addEventListener('click', open);

  const overlay = document.getElementById('searchOverlay');
  overlay.addEventListener('click', function (e) {
    if (e.target.id === 'searchOverlay') close();
  });

  const inp = document.getElementById('searchInput');
  inp.addEventListener('input', function (e) { render(e.target.value); });

  inp.addEventListener('keydown', function (e) {
    const items = document.querySelectorAll('a.sr');
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault();
      if (!items.length) return;
      if (selIdx >= 0) items[selIdx].classList.remove('sel');
      selIdx += (e.key === 'ArrowDown' ? 1 : -1);
      if (selIdx < 0) selIdx = items.length - 1;
      if (selIdx >= items.length) selIdx = 0;
      items[selIdx].classList.add('sel');
      items[selIdx].scrollIntoView({ block: 'nearest' });
    } else if (e.key === 'Enter') {
      if (selIdx >= 0 && items[selIdx]) items[selIdx].click();
      else if (items.length) items[0].click();
    }
  });

  return { open: open, close: close, isOpen: isOpen };
}
