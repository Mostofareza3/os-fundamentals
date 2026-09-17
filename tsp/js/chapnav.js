/* chapnav.js
   Prev/next footer inside the current chapter. Rebuilt per navigation so it
   always reflects the manifest order.
*/

import { chapterMeta, indexOf } from './chapters.js';

export function buildChapNav(section) {
  const old = section.querySelector('.chnav');
  if (old) old.remove();

  const i = indexOf(section.id);
  const prev = chapterMeta[i - 1];
  const next = chapterMeta[i + 1];
  if (!prev && !next) return;

  const wrap = document.createElement('div');
  wrap.className = 'chnav';

  function link(meta, dirLabel, cls) {
    const a = document.createElement('a');
    a.href = '#/' + meta.id;
    a.className = cls;
    const d = document.createElement('span');
    d.className = 'dir';
    d.textContent = dirLabel;
    const t = document.createElement('span');
    t.className = 't';
    t.textContent = meta.title;
    a.appendChild(d);
    a.appendChild(t);
    return a;
  }

  if (prev) wrap.appendChild(link(prev, '← আগের', 'prev'));
  if (next) wrap.appendChild(link(next, 'পরের →', 'next'));
  section.appendChild(wrap);
}
