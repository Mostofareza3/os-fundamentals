// Drive real Chrome over the DevTools protocol — no npm install needed.
const { spawn } = require('child_process');
const http = require('http');

const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const URL = process.env.PROBE_URL || 'http://localhost:8931/tsp/index.html';
const PORT = Number(process.env.PROBE_PORT || 9222);

function get(path) {
  return new Promise((res, rej) => {
    http.get({ host: '127.0.0.1', port: PORT, path }, r => {
      let d = ''; r.on('data', c => d += c); r.on('end', () => res(JSON.parse(d)));
    }).on('error', rej);
  });
}
const sleep = ms => new Promise(r => setTimeout(r, ms));

(async () => {
  const chrome = spawn(CHROME, [
    '--headless=new', `--remote-debugging-port=${PORT}`,
    '--no-first-run', '--no-default-browser-check',
    '--user-data-dir=/tmp/probe-profile', URL
  ], { stdio: 'ignore' });

  let targets = null;
  for (let i = 0; i < 40; i++) {
    await sleep(300);
    try { targets = await get('/json/list'); if (targets.some(t => t.type === 'page')) break; } catch {}
  }
  if (!targets) { console.log('CHROME_FAILED'); chrome.kill(); process.exit(1); }

  const page = targets.find(t => t.type === 'page');
  let WebSocket;
  for (const base of ['/tmp', process.cwd(), __dirname]) {
    try { WebSocket = require(require.resolve('ws', { paths: [base] })); break; } catch {}
  }
  if (!WebSocket) { console.log('NO_WS_MODULE — run: npm install ws --prefix /tmp'); chrome.kill(); process.exit(2); }
  let ws;
  try { ws = new WebSocket(page.webSocketDebuggerUrl); }
  catch (e) { console.log('NO_WS_MODULE'); chrome.kill(); process.exit(2); }

  const logs = [];
  let id = 0; const waiting = new Map();
  const send = (method, params) => new Promise(res => {
    const n = ++id; waiting.set(n, res);
    ws.send(JSON.stringify({ id: n, method, params }));
  });

  ws.on('message', m => {
    const msg = JSON.parse(m);
    if (msg.id && waiting.has(msg.id)) { waiting.get(msg.id)(msg.result); waiting.delete(msg.id); }
    if (msg.method === 'Runtime.consoleAPICalled') {
      logs.push(msg.params.type + ': ' + msg.params.args.map(a => a.value ?? a.description ?? '').join(' '));
    }
    if (msg.method === 'Log.entryAdded') logs.push('LOG ' + msg.params.entry.level + ': ' + msg.params.entry.text);
    if (msg.method === 'Runtime.exceptionThrown') {
      logs.push('EXCEPTION: ' + (msg.params.exceptionDetails.exception?.description || msg.params.exceptionDetails.text));
    }
  });

  await new Promise(r => ws.on('open', r));
  await send('Runtime.enable'); await send('Log.enable'); await send('Page.enable');
  await send('Page.navigate', { url: URL });
  await sleep(3000);

  const ev = async expr => {
    const r = await send('Runtime.evaluate', { expression: expr, returnByValue: true });
    return r?.result?.value;
  };

  const out = {
    title: await ev('document.title'),
    tocItems: await ev('document.querySelectorAll(".toc-item").length'),
    tocParts: await ev('document.querySelectorAll(".toc-part").length'),
    sections: await ev('document.querySelectorAll("#page > section.chapter").length'),
    visibleChapter: await ev('(document.querySelector("section.chapter.on")||{}).id'),
    loadedBodies: await ev('[...document.querySelectorAll("section.chapter")].filter(s=>s.dataset.loaded==="1").length'),
    h2InVisible: await ev('document.querySelectorAll("section.chapter.on h2").length'),
    asciiDiagrams: await ev('document.querySelectorAll("section.chapter.on pre.ascii").length'),
    copyButtons: await ev('document.querySelectorAll("section.chapter.on .copybtn").length'),
    hash: await ev('location.hash'),
    bodyBg: await ev('getComputedStyle(document.body).backgroundColor'),
    contentWidth: await ev('document.querySelector(".page").getBoundingClientRect().width'),
    horizScroll: await ev('document.documentElement.scrollWidth > document.documentElement.clientWidth'),
  };

  // navigate to chapter 2 via hash, confirm lazy load
  await ev('location.hash = "#/chapter-2"');
  await sleep(1200);
  out.afterNav_visible = await ev('(document.querySelector("section.chapter.on")||{}).id');
  out.afterNav_h2 = await ev('document.querySelectorAll("section.chapter.on h2").length');
  out.afterNav_title = await ev('document.title');

  // search works
  await ev('document.getElementById("searchBtn").click()');
  await sleep(300);
  await ev('(()=>{const i=document.getElementById("searchInput");i.value="page table";i.dispatchEvent(new Event("input"));})()');
  await sleep(600);
  out.searchResults = await ev('document.querySelectorAll("a.sr").length');
  out.searchOpen = await ev('document.getElementById("searchOverlay").classList.contains("on")');

  // theme toggle
  await ev('document.getElementById("searchOverlay").classList.remove("on")');
  await ev('document.getElementById("themeBtn").click()');
  await sleep(200);
  out.themeAfterToggle = await ev('document.documentElement.getAttribute("data-theme")');
  out.bgAfterToggle = await ev('getComputedStyle(document.body).backgroundColor');

  console.log(JSON.stringify(out, null, 2));
  const errs = logs.filter(l => !/favicon/i.test(l));
  console.log('--- console/errors ---');
  console.log(errs.length ? errs.join('\n') : '(none)');

  const problems = [];
  if (!out.tocItems) problems.push('TOC empty');
  if (out.tocItems !== out.sections) problems.push('TOC count != section count');
  if (!out.visibleChapter) problems.push('no chapter visible at boot');
  if (!out.h2InVisible) problems.push('visible chapter has no headings — body did not load');
  if (out.loadedBodies !== out.sections) problems.push('not every chapter body loaded');
  if (out.horizScroll) problems.push('page scrolls horizontally');
  if (!/^rgb/.test(out.bodyBg || '')) problems.push('body has no background — tokens not applied');
  if (out.afterNav_visible !== 'chapter-2') problems.push('hash navigation failed');
  if (!out.searchResults) problems.push('search returned nothing');
  if (errs.length) problems.push(errs.length + ' console error(s)');

  console.log('\n' + (problems.length ? 'PROBE FAILED: ' + problems.join('; ') : 'PROBE OK'));
  ws.close(); chrome.kill();
  process.exit(problems.length ? 1 : 0);
})();
