/* router.js
   Hash routing. "#/chapter-2" opens a chapter; "#/chapter-2@c2-pcb" opens it
   scrolled to a heading. Navigation waits for the chapter partial to arrive,
   then shows exactly one chapter at a time.
*/

import { chapterMeta, getSection, indexOf, loadChapter, metaOf } from './chapters.js';
import { setActiveTOC } from './toc.js';
import { buildChapNav } from './chapnav.js';
import { attachCopyButtons } from './copy.js';
import { updateProgress } from './progress.js';
import { closeSidebar } from './sidebar.js';
import { store, save } from './store.js';

const TITLE_SUFFIX = ' — তিনটি সহজ পাঠ';

let current = null;

export function currentId() {
  return current;
}

export async function showChapter(id, scrollTarget) {
  let meta = metaOf(id);
  if (!meta) { meta = chapterMeta[0]; if (!meta) return; id = meta.id; }

  await loadChapter(id);
  const target = getSection(id);
  if (!target) return;

  if (target.dataset.enhanced !== '1') {
    attachCopyButtons(target);
    target.dataset.enhanced = '1';
  }

  chapterMeta.forEach(function (m) {
    const el = getSection(m.id);
    if (el) el.classList.remove('on');
  });
  target.classList.add('on');
  current = id;

  store.last = id;
  save();

  setActiveTOC(id);
  buildChapNav(target);

  if (scrollTarget) {
    const el = document.getElementById(scrollTarget);
    if (el) {
      setTimeout(function () { el.scrollIntoView({ block: 'start' }); }, 40);
    }
  } else {
    window.scrollTo(0, 0);
  }

  updateProgress();
  closeSidebar();
  document.title = meta.title + TITLE_SUFFIX;
}

/** Accepts "#/id", "#/id@anchor" and bare "#id" for older links. */
export function route() {
  const hash = location.hash || '';
  let body = hash.replace(/^#\/?/, '');
  if (!body) {
    showChapter(store.last || (chapterMeta[0] && chapterMeta[0].id));
    return;
  }
  if (body.indexOf('@') > -1) {
    const parts = body.split('@');
    showChapter(parts[0], parts[1]);
  } else {
    showChapter(body);
  }
}

export function goRelative(step) {
  const idx = indexOf(current);
  const next = chapterMeta[idx + step];
  if (next) location.hash = '#/' + next.id;
}

export function initRouter() {
  window.addEventListener('hashchange', route);
  route();
}
