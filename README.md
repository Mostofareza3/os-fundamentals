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
  code.css              Code block, ASCII diagram, copy button
  components.css        Callout box, details, prev/next nav
  search.css            Search overlay
  cover.css             Cover hero + resume banner
  print.css             Print stylesheet
js/                   ES modules (no bundler)
  app.js                Entry point — boot order
  chapters.js           Manifest load + per-chapter fetch/cache
  router.js             Hash routing (#chapter-09, #chapter-09@heading-id)
  toc.js                Sidebar table of contents
  rail.js               "On this page" + scroll spy
  chapnav.js            Prev/next footer
  search.js             Search index + overlay
  copy.js               Code copy buttons
  theme.js              Dark/light toggle
  store.js              localStorage (last chapter, theme)
  progress.js           Reading progress bar
  sidebar.js            Mobile drawer
  keys.js               Keyboard shortcuts
  resume.js             "Last read" banner
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

## Keyboard

| Key | কাজ |
|---|---|
| `/` | Search |
| `←` `→` | আগের / পরের chapter |
| `t` | Theme toggle |
| `Esc` | Search বা sidebar বন্ধ |
