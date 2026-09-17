/* progress.js
   Top reading-progress bar, plus the single rAF-throttled scroll
   listener shared with the rail scroll spy.
*/

import { updateRailSpy } from './rail.js';

let bar = null;
let ticking = false;

export function updateProgress() {
  if (!bar) return;
  const h = document.documentElement;
  const max = h.scrollHeight - h.clientHeight;
  const pct = max > 0 ? (h.scrollTop / max) * 100 : 0;
  bar.style.width = pct + '%';
}

export function initProgress(barEl) {
  bar = barEl;
  window.addEventListener('scroll', function () {
    if (ticking) return;
    ticking = true;
    requestAnimationFrame(function () {
      updateProgress();
      updateRailSpy();
      ticking = false;
    });
  }, { passive: true });
}
