/* progress.js
   Reading progress bar driven by document scroll position.
*/

let bar = null;

export function updateProgress() {
  if (!bar) return;
  const h = document.documentElement;
  const max = h.scrollHeight - h.clientHeight;
  const pct = max > 0 ? (h.scrollTop / max) * 100 : 0;
  bar.style.width = pct + '%';
}

export function initProgress(barEl) {
  bar = barEl;
  window.addEventListener('scroll', updateProgress, { passive: true });
  updateProgress();
}
