/* theme.js
   Dark (default) / light toggle. Persisted choice wins; otherwise
   we follow the OS preference on first visit.
*/

import { store, save } from './store.js';

const root = document.documentElement;

export function applyTheme(t) {
  if (t === 'light') root.setAttribute('data-theme', 'light');
  else root.removeAttribute('data-theme');
}

export function toggleTheme() {
  const next = root.getAttribute('data-theme') === 'light' ? 'dark' : 'light';
  applyTheme(next);
  store.theme = next;
  save();
}

export function initTheme() {
  if (store.theme) applyTheme(store.theme);
  else if (window.matchMedia && window.matchMedia('(prefers-color-scheme: light)').matches) applyTheme('light');

  document.getElementById('themeBtn').addEventListener('click', toggleTheme);
}
