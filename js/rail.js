/* rail.js
   "On this page" rail — one link per <h3> in the active chapter,
   plus a scroll spy that highlights the heading you're reading.
   Hidden when a chapter has fewer than two headings.
*/

let rail = null;
let railLinks = [];

export function initRail(railEl) {
  rail = railEl;
}

export function buildRail(target) {
  rail.innerHTML = '';
  railLinks = [];

  const hs = Array.prototype.slice.call(target.querySelectorAll('h3'));
  if (hs.length < 2) { rail.classList.add('empty'); return; }
  rail.classList.remove('empty');

  const title = document.createElement('div');
  title.className = 'rail-title';
  title.textContent = 'On this page';
  rail.appendChild(title);

  hs.forEach(function (h, i) {
    if (!h.id) h.id = target.id + '-s' + (i + 1);
    const a = document.createElement('a');
    a.href = '#' + target.id + '@' + h.id;
    a.textContent = h.textContent;
    a.addEventListener('click', function (e) {
      e.preventDefault();
      h.scrollIntoView({ block: 'start' });
      history.replaceState(null, '', '#' + target.id + '@' + h.id);
    });
    rail.appendChild(a);
    railLinks.push({ a: a, h: h });
  });
}

export function updateRailSpy() {
  if (!railLinks.length) return;
  let best = 0;
  for (let i = 0; i < railLinks.length; i++) {
    if (railLinks[i].h.getBoundingClientRect().top <= 120) best = i;
  }
  railLinks.forEach(function (r, i) { r.a.classList.toggle('active', i === best); });
}
