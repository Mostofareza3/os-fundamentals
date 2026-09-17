/* chapnav.js
   Prev / next chapter footer, appended to the active chapter.
   Rebuilt on each navigation so it always reflects manifest order.
*/

import { chapterMeta, indexOf } from './chapters.js';

export function buildChapNav(target) {
  const old = target.querySelector('.chapnav');
  if (old) old.remove();

  const idx = indexOf(target.id);
  const nav = document.createElement('div');
  nav.className = 'chapnav';
  nav.appendChild(navLink(chapterMeta[idx - 1], 'prev'));
  nav.appendChild(navLink(chapterMeta[idx + 1], 'next'));
  target.appendChild(nav);
}

function navLink(meta, dir) {
  const a = document.createElement('a');
  a.className = dir + (meta ? '' : ' hidden');
  if (meta) {
    a.href = '#' + meta.id;
    const d = document.createElement('span');
    d.className = 'dir';
    d.textContent = dir === 'prev' ? '← আগের' : 'পরের →';
    const t = document.createElement('span');
    t.className = 't';
    t.textContent = meta.title;
    a.appendChild(d);
    a.appendChild(t);
  }
  return a;
}
