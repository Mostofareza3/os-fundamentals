/* chapters.js
   Loads chapters/manifest.json, then fetches each chapter partial on demand
   and caches it. Every chapter becomes a <section class="chapter"> in #page,
   exactly as it was when the book lived in one file.

   A chapter's markup is inserted once; after that it is only shown/hidden.
*/

const BASE = 'chapters/';

/** @type {{id:string, part:string, title:string, file:string}[]} */
export let chapterMeta = [];

const sections = new Map();   // id -> <section> element
const pending = new Map();    // id -> in-flight fetch promise

let page = null;

export async function initChapters(pageEl) {
  page = pageEl;
  const res = await fetch(BASE + 'manifest.json');
  if (!res.ok) throw new Error('manifest.json load failed: ' + res.status);
  chapterMeta = await res.json();

  // Create an empty shell per chapter up front so ordering, prev/next and
  // the table of contents never depend on load order.
  chapterMeta.forEach(function (meta) {
    const el = document.createElement('section');
    el.className = 'chapter';
    el.id = meta.id;
    el.setAttribute('data-part', meta.part);
    el.setAttribute('data-title', meta.title);
    sections.set(meta.id, el);
    page.appendChild(el);
  });

  return chapterMeta;
}

export function getSection(id) {
  return sections.get(id) || null;
}

export function allSections() {
  return chapterMeta.map(function (m) { return sections.get(m.id); });
}

export function indexOf(id) {
  return chapterMeta.findIndex(function (m) { return m.id === id; });
}

export function metaOf(id) {
  return chapterMeta.find(function (m) { return m.id === id; }) || null;
}

export function isLoaded(id) {
  const el = sections.get(id);
  return !!el && el.dataset.loaded === '1';
}

/** Fetch + inject one chapter's markup. Safe to call repeatedly. */
export function loadChapter(id) {
  const el = sections.get(id);
  const meta = metaOf(id);
  if (!el || !meta) return Promise.resolve(null);
  if (el.dataset.loaded === '1') return Promise.resolve(el);
  if (pending.has(id)) return pending.get(id);

  const p = fetch(BASE + meta.file)
    .then(function (r) {
      if (!r.ok) throw new Error(meta.file + ': ' + r.status);
      return r.text();
    })
    .then(function (html) {
      el.innerHTML = html;
      el.dataset.loaded = '1';
      pending.delete(id);
      return el;
    })
    .catch(function (err) {
      pending.delete(id);
      el.innerHTML = '<div class="box warn"><div class="box-title">Load error</div>' +
        '<p>এই chapter-টা load করা গেল না (<code>' + meta.file + '</code>)। ' +
        'File-টা <code>file://</code> দিয়ে খুললে browser fetch block করে — ' +
        'একটা local server থেকে চালাও।</p></div>';
      el.dataset.loaded = '1';
      console.error(err);
      return el;
    });

  pending.set(id, p);
  return p;
}

/** Load every chapter — used by search indexing and printing. */
export function loadAll() {
  return Promise.all(chapterMeta.map(function (m) { return loadChapter(m.id); }));
}
