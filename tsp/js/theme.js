/* theme.js
   Dark is the default. An explicit choice is stamped on <html> so it wins
   over the OS setting in both directions; no choice means the OS decides.
*/

import { store, save } from './store.js';

function apply(theme) {
  if (theme === 'light' || theme === 'dark') {
    document.documentElement.setAttribute('data-theme', theme);
  } else {
    document.documentElement.removeAttribute('data-theme');
  }
}

export function currentTheme() {
  const stamped = document.documentElement.getAttribute('data-theme');
  if (stamped) return stamped;
  return window.matchMedia && window.matchMedia('(prefers-color-scheme: light)').matches
    ? 'light'
    : 'dark';
}

export function toggleTheme() {
  const next = currentTheme() === 'dark' ? 'light' : 'dark';
  apply(next);
  store.theme = next;
  save();
}

export function initTheme() {
  apply(store.theme);
  const btn = document.getElementById('themeBtn');
  if (btn) btn.addEventListener('click', toggleTheme);
}
