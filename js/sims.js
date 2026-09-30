/* sims.js
   Mounts the interactive simulators a chapter declares.

   A chapter's markup holds only a placeholder:

     <div class="sim" data-sim="timeshare">
       <div class="sim-head"><span class="sim-tag">Simulator</span>
         <span class="sim-title">…</span></div>
       <p class="sim-desc">one line: what to try, what to notice</p>
     </div>

   Chapter markup is injected with innerHTML, so no <script> inside it
   could run. Instead, the first time a chapter is shown, this module
   imports js/sims/<name>.js and calls its mount(root). The module builds
   its own controls and stage inside the placeholder (see js/sims/_lib.js
   for the shared building blocks). A placeholder is mounted once; the
   text inside it stays readable if the module fails to load.
*/

export function initSims(scope) {
  scope.querySelectorAll('.sim[data-sim]').forEach(function (root) {
    if (root.dataset.mounted === '1') return;
    root.dataset.mounted = '1';

    const name = root.dataset.sim;
    if (!/^[a-z0-9-]+$/.test(name)) return;

    import('./sims/' + name + '.js')
      .then(function (mod) { return mod.mount(root); })
      .catch(function (err) {
        console.error('simulator "' + name + '" failed to mount:', err);
        const p = document.createElement('p');
        p.className = 'sim-error';
        p.textContent = 'Simulator-টা load করা গেল না (' + name + ') — console দেখো।';
        root.appendChild(p);
      });
  });
}
