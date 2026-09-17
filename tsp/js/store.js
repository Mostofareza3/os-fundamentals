/* store.js
   Tiny localStorage wrapper. Every accessor is guarded: storage throws in
   private mode and comes back empty in previews, so the app must work
   without it.
*/

const KEY = 'tsp.v1';

export const store = load();

function load() {
  try {
    return JSON.parse(localStorage.getItem(KEY)) || {};
  } catch (e) {
    return {};
  }
}

export function save() {
  try {
    localStorage.setItem(KEY, JSON.stringify(store));
  } catch (e) {
    /* ignore — a missing preference is not an error */
  }
}
