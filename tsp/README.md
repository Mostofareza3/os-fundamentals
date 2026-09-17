# তিনটি সহজ পাঠ

Operating Systems — Virtualization · Concurrency · Persistence।
OSTEP (Arpaci-Dusseau) এর ভিত্তিতে, কিন্তু source এর চেয়ে বেশি সম্পূর্ণ:
যা পুরনো হয়ে গেছে তা সংশোধন করা, আর যা নেই (io_uring, container, memory
model, NVMe/FTL) তা যোগ করা।

**৩০টা chapter, ৪ ভাগ, ~৬৯,০০০ শব্দ** — ১৬৬টা ASCII diagram,
২১২টা code block, ৬৫টা "ভুল ধারণা" callout, ১৮০টা প্রশ্ন।

| Part | Chapter | বিষয় |
|------|---------|------|
| 1 — Virtualization | 1–11 | process, fork/COW, trap ও context switch, scheduling (MLFQ → EEVDF → cgroup), address space, paging, TLB, swap/OOM |
| 2 — Concurrency | 12–19 | thread, cache coherence, memory model, lock/futex, concurrent data structure, condvar, deadlock, event loop (epoll/io_uring) |
| 3 — Persistence | 20–27 | I/O device, flash/FTL, inode, file system, page cache, **durability contract**, journaling, LSM-tree |
| 4 — আজকের বাস্তবতা | 28–30 | data integrity ও erasure coding, container, runtime-as-OS-client (capstone) |

## চালানোর নিয়ম

Chapter গুলো runtime-এ `fetch()` দিয়ে load হয়, তাই `index.html` সরাসরি
double-click করে (`file://`) খুললে browser CORS block করবে। একটা local
server লাগবে — repo root থেকে:

```bash
python3 -m http.server 8000
# → http://localhost:8000/tsp/
```

## Structure

```
tsp/
  index.html            App shell — topbar, sidebar, search overlay
  css/                  13টা module, index.html-এ order মেনে link করা
    tokens.css            Design token + light theme override
                          — সব color/spacing/type scale এখানে,
                            বাইরে কোথাও hardcode নেই
    base.css              Reset, body, selection, focus, reduced motion
    topbar.css            Fixed top bar + progress bar
    layout.css            Shell layout, wide-screen breakout, mobile drawer
    toc.css               Sidebar সূচিপত্র, part accent সহ
    typography.css        Heading, body, list, chapter header, inline code
    code.css              Code block, ASCII diagram, copy button
    tables.css            Scrollable table wrapper
    callouts.css          ভুল ধারণা / note / dev / warn / পুরনো-source box
    chapnav.css           Prev/next footer
    search.css            Search overlay
    cover.css             Cover hero
    util.css              Chapter show/hide, skip link
  js/                   ES module, কোনো bundler নেই
    app.js                Entry point — boot order
    store.js              localStorage wrapper (try/catch দেওয়া)
    theme.js              Dark/light, system preference respect করে
    chapters.js           Manifest load + per-chapter lazy fetch/cache
    router.js             Hash routing (#/chapter-2, #/chapter-2@anchor)
    toc.js                Sidebar সূচিপত্র
    chapnav.js            Prev/next
    sidebar.js            Mobile drawer
    progress.js           Reading progress
    search.js             Title index সাথে সাথে, full-text background-এ
    keys.js               / search, t theme, j/k chapter
    copy.js               Code block-এ copy button
  chapters/
    manifest.json         Part নাম + chapter তালিকা (id, num, part, title, file)
    01-os-keno-ache.html  প্রতিটা chapter-এর ভিতরের markup মাত্র,
    02-process.html       <section> wrapper টা shell বানায়
```

## নতুন chapter যোগ করা

1. `chapters/NN-slug.html` লেখো — শুধু ভিতরের markup, `<section>` ছাড়া।
2. `chapters/manifest.json` এ একটা entry যোগ করো:
   ```json
   { "id": "chapter-3", "num": "3", "part": "1",
     "title": "…", "file": "03-slug.html" }
   ```
3. আর কিছু লাগবে না — TOC, router, prev/next, search সব manifest থেকে
   নিজে তৈরি হয়।

## Keyboard

| key | কাজ |
|-----|-----|
| `/` | search |
| `t` | theme toggle |
| `j` / `→` | পরের chapter |
| `k` / `←` | আগের chapter |
| `Esc` | overlay বন্ধ |
