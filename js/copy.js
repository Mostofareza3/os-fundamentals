/* copy.js
   Adds a Copy button to every code block (ASCII diagrams excluded).
   Runs per chapter as its markup arrives, and marks blocks it has
   already handled so re-running is harmless.
*/

export function attachCopyButtons(scope) {
  scope.querySelectorAll('pre:not(.diagram)').forEach(function (pre) {
    if (pre.dataset.copy === '1') return;
    pre.dataset.copy = '1';

    let wrap = pre.parentElement;
    if (!wrap.classList.contains('codewrap')) {
      wrap = document.createElement('div');
      wrap.className = 'codewrap';
      pre.parentNode.insertBefore(wrap, pre);
      wrap.appendChild(pre);
    }

    const btn = document.createElement('button');
    btn.className = 'copybtn';
    btn.type = 'button';
    btn.textContent = 'Copy';

    btn.addEventListener('click', function () {
      const text = pre.innerText;

      function done() {
        btn.textContent = 'Copied ✓';
        btn.classList.add('done');
        setTimeout(function () {
          btn.textContent = 'Copy';
          btn.classList.remove('done');
        }, 1500);
      }

      function fallback() {
        const ta = document.createElement('textarea');
        ta.value = text;
        document.body.appendChild(ta);
        ta.select();
        try { document.execCommand('copy'); done(); } catch (e) {}
        document.body.removeChild(ta);
      }

      if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(text).then(done).catch(fallback);
      } else fallback();
    });

    wrap.appendChild(btn);
  });
}
