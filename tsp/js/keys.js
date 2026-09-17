/* keys.js
   Keyboard shortcuts: / search, t theme, j/k or arrows for chapter nav.
   Ignored while typing in a field or with a modifier held.
*/

import { goRelative } from './router.js';
import { closeSidebar } from './sidebar.js';

export function initKeys(search) {
  document.addEventListener('keydown', function (e) {
    if (e.key === 'Escape') {
      if (search.isOpen()) search.close();
      else closeSidebar();
      return;
    }

    const typing = /^(INPUT|TEXTAREA|SELECT)$/.test(e.target.tagName || '');
    if (typing || e.metaKey || e.ctrlKey || e.altKey) return;

    if (e.key === '/') { e.preventDefault(); search.open(); return; }
    if (e.key === 't' || e.key === 'T') {
      const btn = document.getElementById('themeBtn');
      if (btn) btn.click();
      return;
    }
    if (e.key === 'j' || e.key === 'ArrowRight') goRelative(1);
    if (e.key === 'k' || e.key === 'ArrowLeft') goRelative(-1);
  });
}
