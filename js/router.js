/* router.js
   Hash routing. "#chapter-09" opens a chapter; "#chapter-09@chapter-09-s2"
   opens it scrolled to a heading. Navigation waits for the chapter partial
   to arrive, then shows exactly one chapter at a time.
*/

import { chapterMeta, getSection, indexOf, loadChapter, metaOf } from './chapters.js';
import { setActiveTOC } from './toc.js';
import { buildRail, updateRailSpy } from './rail.js';
import { buildChapNav } from './chapnav.js';
import { attachCopyButtons } from './copy.js';
import { updateProgress } from './progress.js';
import { closeSidebar } from './sidebar.js';
import { store, save } from './store.js';

const TITLE_SUFFIX = ' — Operating Systems ভিতর থেকে';

let current = null;

export function currentId() {
  return current;
}

export async function showChapter(id, scrollTarget) {
  let meta = metaOf(id);
  if (!meta) { meta = chapterMeta[0]; id = meta.id; }

  await loadChapter(id);
  const target = getSection(id);
  if (!target) return;

  // First render for this chapter: wire up its code blocks.
  if (target.dataset.enhanced !== '1') {
    attachCopyButtons(target);
    target.dataset.enhanced = '1';
  }

  chapterMeta.forEach(function (m) {
    const el = getSection(m.id);
    if (el) el.classList.remove('active');
  });
  target.classList.add('active');
  current = id;

  store.last = id;
  save();

  setActiveTOC(id);
  buildChapNav(target);
  buildRail(target);

  if (scrollTarget) {
    const el = document.getElementById(scrollTarget);
    if (el) setTimeout(function () { el.scrollIntoView({ block: 'start' }); updateRailSpy(); }, 40);
  } else {
    window.scrollTo(0, 0);
  }

  updateProgress();
  updateRailSpy();
  closeSidebar();
  document.title = meta.title + TITLE_SUFFIX;
}

export function route() {
  const hash = location.hash.replace('#', '');
  if (!hash) { showChapter('cover'); return; }
  if (hash.indexOf('@') > -1) {
    const parts = hash.split('@');
    showChapter(parts[0], parts[1]);
  } else {
    showChapter(hash);
  }
}

export function goRelative(step) {
  const idx = indexOf(current);
  const next = chapterMeta[idx + step];
  if (next) location.hash = '#' + next.id;
}

export function initRouter() {
  window.addEventListener('hashchange', route);
  route();
}
