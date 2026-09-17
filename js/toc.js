/* toc.js
   Sidebar table of contents, grouped by part label.
   Built once from the manifest; the active row is updated on navigation.
*/

import { chapterMeta } from './chapters.js';

let sidebar = null;

export function buildTOC(sidebarEl) {
  sidebar = sidebarEl;
  let lastPart = null;

  chapterMeta.forEach(function (meta) {
    if (meta.part !== lastPart) {
      const pl = document.createElement('div');
      pl.className = 'toc-part';
      pl.textContent = meta.part;
      sidebar.appendChild(pl);
      lastPart = meta.part;
    }

    const m = meta.id.match(/chapter-(\d+)/);
    const a = document.createElement('a');
    a.className = 'toc-link';
    a.href = '#' + meta.id;
    a.dataset.target = meta.id;

    const num = document.createElement('span');
    num.className = 'num';
    num.textContent = m ? String(parseInt(m[1], 10)) : '•';

    const t = document.createElement('span');
    t.className = 'ttl';
    t.textContent = meta.title;

    a.appendChild(num);
    a.appendChild(t);
    sidebar.appendChild(a);
  });
}

export function setActiveTOC(id) {
  if (!sidebar) return;
  sidebar.querySelectorAll('.toc-link').forEach(function (l) {
    l.classList.toggle('active', l.dataset.target === id);
  });
  const active = sidebar.querySelector('.toc-link.active');
  if (active) active.scrollIntoView({ block: 'nearest' });
}
