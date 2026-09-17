/* app.js
   Entry point. Boot order matters:
   theme first (before paint), then the chapter manifest, then everything
   that depends on knowing the chapter list.
*/

import { initChapters } from './chapters.js';
import { initTheme } from './theme.js';
import { buildTOC } from './toc.js';
import { initRail } from './rail.js';
import { initProgress } from './progress.js';
import { initSidebar } from './sidebar.js';
import { initRouter } from './router.js';
import { buildResume } from './resume.js';
import { initSearch, buildTitleIndex, warmIndex } from './search.js';
import { initKeys } from './keys.js';
import { attachCopyButtons } from './copy.js';

async function boot() {
  initTheme();

  const page = document.getElementById('page');
  const sidebar = document.getElementById('sidebar');
  const scrim = document.getElementById('scrim');

  initRail(document.getElementById('rail'));
  initProgress(document.getElementById('progress'));
  initSidebar(sidebar, scrim);

  try {
    await initChapters(page);
  } catch (err) {
    page.innerHTML = '<section class="chapter active"><div class="box warn">' +
      '<div class="box-title">Load error</div>' +
      '<p>Chapter manifest load করা গেল না। এই site-টা <code>file://</code> দিয়ে না খুলে ' +
      'একটা local server থেকে চালাও:</p>' +
      '<pre>python3 -m http.server 8000</pre>' +
      '<p>তারপর <code>http://localhost:8000</code> এ যাও।</p></div></section>';
    console.error(err);
    return;
  }

  buildTOC(sidebar);
  buildTitleIndex();

  const search = initSearch();
  initKeys(search);

  initRouter();

  // Background: pull every chapter so search covers full body text,
  // then fill in the cover's resume banner and remaining copy buttons.
  warmIndex().then(function () {
    buildResume();
    attachCopyButtons(document.getElementById('page'));
  });
}

boot();
