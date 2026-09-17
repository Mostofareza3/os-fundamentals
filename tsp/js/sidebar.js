/* sidebar.js
   Mobile drawer. On wide screens the sidebar is always visible and these
   classes are inert.
*/

let sidebar = null;
let scrim = null;

export function openSidebar() {
  if (!sidebar) return;
  sidebar.classList.add('open');
  scrim.classList.add('on');
  const btn = document.getElementById('menuBtn');
  if (btn) btn.setAttribute('aria-expanded', 'true');
}

export function closeSidebar() {
  if (!sidebar) return;
  sidebar.classList.remove('open');
  scrim.classList.remove('on');
  const btn = document.getElementById('menuBtn');
  if (btn) btn.setAttribute('aria-expanded', 'false');
}

export function initSidebar(sidebarEl, scrimEl) {
  sidebar = sidebarEl;
  scrim = scrimEl;

  const btn = document.getElementById('menuBtn');
  if (btn) {
    btn.addEventListener('click', function () {
      if (sidebar.classList.contains('open')) closeSidebar();
      else openSidebar();
    });
  }
  if (scrim) scrim.addEventListener('click', closeSidebar);
}
