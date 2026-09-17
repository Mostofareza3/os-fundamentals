/* store.js
   localStorage-backed reading state: last chapter + theme choice.
   Writes are debounced so rapid navigation doesn't thrash storage.
*/

const LS = 'osbook.v1';

export const store = { last: null, theme: null };

try {
  const raw = localStorage.getItem(LS);
  if (raw) {
    const parsed = JSON.parse(raw);
    if (parsed && typeof parsed === 'object') {
      store.last = parsed.last || null;
      store.theme = parsed.theme || null;
    }
  }
} catch (e) {}

let saveTimer = null;

export function save() {
  clearTimeout(saveTimer);
  saveTimer = setTimeout(function () {
    try { localStorage.setItem(LS, JSON.stringify(store)); } catch (e) {}
  }, 250);
}
