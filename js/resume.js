/* resume.js
   "Last time you were reading…" banner on the cover, built from the
   stored chapter id. Rendered into #resumeSlot once the cover loads.
*/

import { metaOf } from './chapters.js';
import { store } from './store.js';

export function buildResume() {
  const slot = document.getElementById('resumeSlot');
  if (!slot || slot.dataset.built === '1') return;
  if (!store.last || store.last === 'cover') return;

  const meta = metaOf(store.last);
  if (!meta) return;
  slot.dataset.built = '1';

  const box = document.createElement('div');
  box.className = 'resume';

  const txt = document.createElement('div');
  txt.className = 'rt';
  txt.innerHTML = 'শেষবার পড়ছিলে — <b></b>';
  txt.querySelector('b').textContent = meta.title;

  const link = document.createElement('a');
  link.href = '#' + meta.id;
  link.textContent = 'আবার শুরু করো →';

  const x = document.createElement('button');
  x.className = 'dismiss';
  x.type = 'button';
  x.setAttribute('aria-label', 'Dismiss');
  x.textContent = '×';
  x.addEventListener('click', function () { box.remove(); });

  box.appendChild(txt);
  box.appendChild(link);
  box.appendChild(x);
  slot.appendChild(box);
}
