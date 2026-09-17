/* search.js
   Overlay search across chapter titles and section headings.

   The index is built in two passes: chapter titles are available from the
   manifest right away, and per-heading entries are added once the chapter
   partials finish loading in the background.
*/

import { chapterMeta, getSection, loadAll } from './chapters.js';

let index = [];

export function buildTitleIndex() {
  index = chapterMeta.map(function (meta) {
    return {
      chap: meta.id,
      anchor: null,
      part: meta.part,
      title: meta.title,
      text: meta.title.toLowerCase()
    };
  });
}

/** Add one entry per <h3>, mirroring the original single-file indexer. */
export function indexHeadings() {
  chapterMeta.forEach(function (meta) {
    const ch = getSection(meta.id);
    if (!ch || ch.dataset.indexed === '1') return;
    ch.dataset.indexed = '1';

    let hcount = 0;
    ch.querySelectorAll('h3').forEach(function (h) {
      hcount++;
      if (!h.id) h.id = meta.id + '-s' + hcount;

      const text = h.textContent;
      let body = '';
      let el = h.nextElementSibling;
      let steps = 0;
      while (el && el.tagName !== 'H3' && steps < 6) {
        body += ' ' + el.textContent;
        el = el.nextElementSibling;
        steps++;
      }

      index.push({
        chap: meta.id,
        anchor: h.id,
        part: meta.title,
        title: text,
        text: (text + ' ' + body).toLowerCase(),
        snip: body.trim().replace(/\s+/g, ' ').slice(0, 140)
      });
    });
  });
}

function esc(s) {
  const d = document.createElement('div');
  d.textContent = s;
  return d.innerHTML;
}

function highlight(text, terms) {
  let out = esc(text);
  terms.forEach(function (t) {
    if (t.length < 2) return;
    out = out.replace(new RegExp('(' + t.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + ')', 'gi'), '<mark>$1</mark>');
  });
  return out;
}

export function initSearch() {
  const overlay = document.getElementById('searchOverlay');
  const input = document.getElementById('searchInput');
  const results = document.getElementById('searchResults');
  let selIdx = -1;

  function openSearch() {
    overlay.classList.add('show');
    input.value = '';
    results.innerHTML = '';
    selIdx = -1;
    setTimeout(function () { input.focus(); }, 20);
  }

  function closeSearch() { overlay.classList.remove('show'); }

  document.getElementById('searchBtn').addEventListener('click', openSearch);
  overlay.addEventListener('click', function (e) { if (e.target === overlay) closeSearch(); });

  function doSearch(q) {
    results.innerHTML = '';
    selIdx = -1;
    q = q.trim().toLowerCase();
    if (q.length < 2) return;

    const terms = q.split(/\s+/);
    const hits = index.filter(function (item) {
      return terms.every(function (t) { return item.text.indexOf(t) > -1; });
    }).slice(0, 12);

    if (hits.length === 0) {
      results.innerHTML = '<div class="sr-empty">কিছু পাওয়া গেল না — অন্য keyword দিয়ে চেষ্টা করো</div>';
      return;
    }

    hits.forEach(function (h) {
      const a = document.createElement('a');
      a.className = 'sr-item';
      a.href = '#' + h.chap + (h.anchor ? '@' + h.anchor : '');
      a.innerHTML = '<div class="sr-ch">' + esc(h.part) + '</div>' +
        '<div class="sr-t">' + highlight(h.title, terms) + '</div>' +
        (h.snip ? '<div class="sr-snip">' + esc(h.snip) + '</div>' : '');
      a.addEventListener('click', function () { closeSearch(); });
      results.appendChild(a);
    });

    selIdx = 0;
    results.querySelector('.sr-item').classList.add('sel');
  }

  input.addEventListener('input', function () { doSearch(input.value); });

  input.addEventListener('keydown', function (e) {
    const items = results.querySelectorAll('.sr-item');
    if (e.key === 'ArrowDown') { e.preventDefault(); selIdx = Math.min(selIdx + 1, items.length - 1); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); selIdx = Math.max(selIdx - 1, 0); }
    else if (e.key === 'Enter' && selIdx >= 0 && items[selIdx]) { items[selIdx].click(); return; }
    else return;
    items.forEach(function (it, i) { it.classList.toggle('sel', i === selIdx); });
    if (items[selIdx]) items[selIdx].scrollIntoView({ block: 'nearest' });
  });

  return { openSearch: openSearch, closeSearch: closeSearch, isOpen: function () { return overlay.classList.contains('show'); } };
}

/** Pull in every chapter in the background, then index their headings. */
export function warmIndex() {
  return loadAll().then(indexHeadings).catch(function (e) { console.error(e); });
}
