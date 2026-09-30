# OS Fundamentals

Operating System Fundamentals in Bangla — একটা static, dependency-free book site.

## চালানোর নিয়ম

Chapter গুলো runtime-এ `fetch()` দিয়ে load হয়, তাই `index.html` সরাসরি
double-click করে (`file://`) খুললে browser CORS block করবে। একটা local server লাগবে:

```bash
python3 -m http.server 8000
# → http://localhost:8000
```

যেকোনো static server চলবে (`npx serve`, `php -S localhost:8000`, ইত্যাদি)।
কোনো build step বা npm install নেই।

## Structure

```
index.html            App shell — topbar, sidebar, rail, search overlay
css/                  Stylesheet modules, index.html-এ order মেনে link করা
  tokens.css            Design tokens + light theme override
  base.css              Reset, scrollbar, selection, focus ring
  layout.css            Shell layout + responsive breakpoints
  typography.css        Headings, body, table, inline code
  code.css              Code block (header, syntax colour), ASCII diagram
  components.css        Callout box, details, prev/next nav
  search.css            Search overlay
  cover.css             Cover hero + resume banner
  sim.css               Interactive simulator (frame, controls, stage, SVG helper class)
  print.css             Print stylesheet
js/                   ES modules (no bundler)
  app.js                Entry point — boot order
  chapters.js           Manifest load + per-chapter fetch/cache
  router.js             Hash routing (#chapter-09, #chapter-09@heading-id)
  toc.js                Sidebar table of contents
  rail.js               "On this page" + scroll spy
  chapnav.js            Prev/next footer
  search.js             Search index + overlay
  codeblock.js          Code block label, highlighting, Copy
  theme.js              Dark/light toggle
  store.js              localStorage (last chapter, theme)
  progress.js           Reading progress bar
  sidebar.js            Mobile drawer
  keys.js               Keyboard shortcuts
  resume.js             "Last read" banner
  sims.js               Chapter-এর simulator placeholder mount করে (router থেকে ডাকা হয়)
  sims/                 এক file = এক simulator; _lib.js হলো shared building block
chapters/
  manifest.json         Chapter order, id, part, title, filename
  NN-slug.html          একটা chapter-এর ভিতরের markup
```

## নতুন chapter যোগ করা

1. `chapters/` এ নতুন HTML file বানাও — শুধু ভিতরের markup, কোনো
   `<section>` wrapper লাগবে না (ওটা JS বানায়)।
2. `chapters/manifest.json` এ entry যোগ করো যেখানে চাও:

```json
{ "id": "chapter-41", "part": "Part 12 — Engineering Intuition",
  "title": "New Chapter", "file": "41-new-chapter.html" }
```

TOC, prev/next, search — সব manifest থেকে আসে, তাই আর কিছু বদলাতে হবে না।

## Simulator

Chapter-এর ভেতরে interactive simulator বসানো যায়। Chapter markup `innerHTML` দিয়ে
inject হয়, তাই ওখানে `<script>` চলে না — simulator-এর code থাকে `js/sims/<name>.js`-এ,
আর chapter-এ থাকে শুধু একটা placeholder:

```html
<div class="sim" data-sim="timeshare">
  <div class="sim-head"><span class="sim-tag">Simulator</span><span class="sim-title">Time-sharing</span></div>
  <p class="sim-desc">এক লাইনে: কী করবে, কী লক্ষ করবে।</p>
</div>
```

Chapter প্রথমবার দেখানোর সময় `js/sims.js` ওই নাম ধরে `js/sims/timeshare.js` import করে
`mount(root)` ডাকে; module নিজের control আর stage placeholder-এর ভেতরে বানায়।

নতুন simulator যোগ করতে:

1. `js/sims/<name>.js` বানাও — `export function mount(root)`; building block-এর জন্য
   `./_lib.js` (el, svg, ui, button, range, select, stepper, ticker, playButton, logPanel,
   table, codeList, chips, note …) — প্রতিটা helper-এর মাথায় ব্যবহারের উদাহরণ আছে।
   দুইটা নমুনা: `timeshare.js` (animation, play/step) আর `syscall.js` (stepper)।
2. Chapter-এ ওপরের placeholder বসাও, `data-sim` = file-এর নাম।
3. রং শুধু `css/sim.css`-এর class আর token দিয়ে — তাহলে dark/light দুটোতেই চলে।

Animation `ticker(root, step, ms)` দিয়ে চালাও: chapter লুকিয়ে গেলে সেটা নিজে থামে।

## Code block

প্রতিটা code block-এর `<pre>`-এ একটা class দাও — সেটা দেখেই JS label, রং আর Copy বসায়:

| Class | কী | দেখতে |
|---|---|---|
| `cmd` | Terminal-এ যা টাইপ করবে | "Terminal" label, প্রতিটা command-এর আগে `$` |
| `lang-js` `lang-py` `lang-c` `lang-sh` `lang-asm` | Source file | প্রথম লাইনে `// name.js` থাকলে সেটাই label |
| `out` | Program-এর output | "Output" label, রং নেই, Copy নেই |
| `plain` | বাকি সব | Label নেই |

```html
<div class="codewrap"><pre class="cmd"><code>node -e "console.log(1)"</code></pre></div>
```

## Keyboard

| Key | কাজ |
|---|---|
| `/` | Search |
| `←` `→` | আগের / পরের chapter |
| `t` | Theme toggle |
| `Esc` | Search বা sidebar বন্ধ |
