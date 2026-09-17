/* copy.js
   A copy button per code block. Skips ASCII diagrams, which are read rather
   than reused.
*/

export function attachCopyButtons(root) {
  if (!root) return;
  const blocks = root.querySelectorAll('pre:not(.ascii)');

  blocks.forEach(function (pre) {
    if (pre.dataset.copy === '1') return;
    pre.dataset.copy = '1';

    let wrap = pre.parentElement;
    if (!wrap || !wrap.classList.contains('codewrap')) {
      wrap = document.createElement('div');
      wrap.className = 'codewrap';
      pre.parentNode.insertBefore(wrap, pre);
      wrap.appendChild(pre);
    }

    const btn = document.createElement('button');
    btn.className = 'copybtn';
    btn.type = 'button';
    btn.textContent = 'copy';
    btn.addEventListener('click', function () {
      const text = pre.innerText;
      const done = function () {
        btn.textContent = 'copied';
        setTimeout(function () { btn.textContent = 'copy'; }, 1200);
      };
      if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(text).then(done, function () {
          btn.textContent = 'failed';
        });
      } else {
        btn.textContent = 'failed';
      }
    });
    wrap.appendChild(btn);
  });
}
