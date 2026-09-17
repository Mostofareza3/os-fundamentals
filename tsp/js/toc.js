/* toc.js
   Sidebar table of contents, grouped by part with a per-part accent colour.
   Built once from the manifest; only the active row changes on navigation.
*/

import { chapterMeta, partNames } from './chapters.js';

let sidebar = null;

export function buildTOC(sidebarEl) {
  sidebar = sidebarEl;
  sidebar.textContent = '';
  let lastPart = null;

  chapterMeta.forEach(function (meta) {
    if (meta.part !== lastPart) {
      const pl = document.createElement('div');
      pl.className = 'toc-part p' + meta.part;
      pl.textContent = partNames[meta.part] || meta.part;
      sidebar.appendChild(pl);
      lastPart = meta.part;
    }

    const a = document.createElement('a');
    a.className = 'toc-item p' + meta.part;
    a.href = '#/' + meta.id;
    a.dataset.target = meta.id;

    const num = document.createElement('span');
    num.className = 'num';
    num.textContent = meta.num || '•';

    const t = document.createElement('span');
    t.textContent = meta.title;

    a.appendChild(num);
    a.appendChild(t);
    sidebar.appendChild(a);
  });
}

export function setActiveTOC(id) {
  if (!sidebar) return;
  const items = sidebar.querySelectorAll('.toc-item');
  for (let i = 0; i < items.length; i++) {
    const on = items[i].dataset.target === id;
    items[i].classList.toggle('active', on);
    if (on) {
      const r = items[i].getBoundingClientRect();
      if (r.top < 60 || r.bottom > window.innerHeight) {
        items[i].scrollIntoView({ block: 'center' });
      }
    }
  }
}
