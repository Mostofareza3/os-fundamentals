/* keys.js
   Global shortcuts: "/" search, ←/→ chapter, "t" theme, Esc close.
   Typing in an input always wins.
*/

import { goRelative } from './router.js';
import { closeSidebar } from './sidebar.js';

function isTyping() {
  const el = document.activeElement;
  if (!el) return false;
  return el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.isContentEditable;
}

export function initKeys(search) {
  document.addEventListener('keydown', function (e) {
    if (e.key === 'Escape') {
      if (search.isOpen()) { search.closeSearch(); return; }
      closeSidebar();
      return;
    }
    if (e.metaKey || e.ctrlKey || e.altKey) return;
    if (search.isOpen()) return;

    if (e.key === '/' && !isTyping()) { e.preventDefault(); search.openSearch(); return; }
    if (isTyping()) return;

    if (e.key === 'ArrowRight') { e.preventDefault(); goRelative(1); }
    else if (e.key === 'ArrowLeft') { e.preventDefault(); goRelative(-1); }
    else if (e.key === 't' || e.key === 'T') { document.getElementById('themeBtn').click(); }
  });
}
