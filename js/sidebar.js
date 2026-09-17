/* sidebar.js
   Mobile drawer: hamburger toggle + scrim. On desktop the sidebar is
   always visible and these classes simply never apply.
*/

let sidebar = null;
let scrim = null;

export function closeSidebar() {
  if (!sidebar) return;
  sidebar.classList.remove('open');
  scrim.classList.remove('show');
}

export function initSidebar(sidebarEl, scrimEl) {
  sidebar = sidebarEl;
  scrim = scrimEl;

  document.getElementById('menuBtn').addEventListener('click', function () {
    sidebar.classList.toggle('open');
    scrim.classList.toggle('show', sidebar.classList.contains('open'));
  });

  scrim.addEventListener('click', closeSidebar);
}
