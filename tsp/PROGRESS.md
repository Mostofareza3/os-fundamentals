# Build progress — তিনটি সহজ পাঠ

## STATUS: COMPLETE — 30/30 chapters, both checks pass

Autonomous build state. Read this first after any context reset.

## Task
Write 30 Bangla chapters into `tsp/chapters/`, one file each, registering
every chapter in `tsp/chapters/manifest.json`. Source: OSTEP v0.90/0.91
(2015). Extracted source text: see SOURCE below.

## Working mode (user-approved 2026-09-17)
- Write 3 chapters per step, then self-verify, then continue to the next step
  WITHOUT waiting for the user. User is busy; do not block on them.
- On any problem found during verification: fix it myself and carry on.
  Report everything at the end.
- Groups: [3,4,5] → [6,7] → [8,9,10,11] → then Part 2, 3, 4.

## Rules (from the user's original spec — binding)
- Bangla prose in Bangla script; English technical terms stay English
  (process, thread, scheduler, cache, pointer, page table).
- Tone: senior engineer to senior engineer. No "চলুন ভেবে দেখি" filler.
- First use of an abbreviation: full form + short meaning in brackets.
- No word-by-word translation. Expand the source, never summarize it.
- Every concept: what it is → why it exists → what breaks without it →
  concrete example.
- ASCII diagrams for anything structural. Real code, comments in English.
- Connect to Node.js / Docker / Postgres / browser / Git where it applies.
- A "ভুল ধারণা" callout wherever the topic has a known wrong mental model.
- 4–6 understanding-test questions per chapter (not recall).
- All colors/spacing/type as CSS custom properties in css/tokens.css only.

## Verification after each step (all must pass)
1. `python3 tsp/verify.py` — HTML balance, manifest integrity, duplicate
   ids, token discipline, CSS braces.
2. Chrome headless probe (`/tmp/probe.js`, needs server on :8931) — TOC
   count, chapter loads, navigation, search, theme, ZERO console errors.
3. Bangla text is in Bangla script, code comments in English.

## Chapter plan (30 total)
Part 1 — Virtualization
  1  ✅ OS কেন আছে — তিনটি সমস্যা            OSTEP ch2   p24-41
  2  ✅ Process — OS এর প্রধান abstraction    OSTEP ch4   p46-57
  3  ✅ fork, exec, wait — আর COW এর ফাঁদ     OSTEP ch5   p58-68 + ch23 COW
  4  ✅ Limited Direct Execution              OSTEP ch6   p69-82
  5  ✅ Scheduling — FIFO থেকে MLFQ           OSTEP ch7-8 p83-106
  6  ✅ Proportional share — lottery→EEVDF    OSTEP ch9   p107-116
  7  ✅ Multicore scheduling + cgroup throttle OSTEP ch10 p117-127 + new
  8  ✅ Address space আর memory API           OSTEP ch13,14,16,17
  9  ✅ Address translation → paging           OSTEP ch15,18,20
  10 ✅ TLB                                    OSTEP ch19  p209-225
  11 ✅ Swap, reclaim, OOM                     OSTEP ch21,22,23
Part 2 — Concurrency
  12 ✅ Thread আর যে race দেখা যায় না         OSTEP ch26,27
  13 ✅ Cache coherence আর memory consistency  NEW (source has none)
  14 ✅ Memory model — volatile নয়            NEW
  15 ✅ Lock — spin থেকে futex                 OSTEP ch28
  16 ✅ Concurrent data structure, RCU          OSTEP ch29
  17 ✅ Condition variable আর semaphore         OSTEP ch30,31
  18 ✅ Deadlock আর যা সত্যিই আটকায়           OSTEP ch32
  19 ✅ Event loop — epoll, io_uring, libuv     OSTEP ch33 + NEW
Part 3 — Persistence
  20 ✅ I/O device আর interrupt                 OSTEP ch36
  21 ✅ Disk থেকে flash — FTL, write amp        OSTEP ch37 + AppI
  22 ✅ File আর directory — inode, fd, link     OSTEP ch39
  23 ✅ File system implementation              OSTEP ch40,41
  24 ✅ Page cache — লেখা কোথায় যায়           NEW
  25 ✅ Durability contract — fsync             NEW (highest priority)
  26 ✅ Crash consistency — journaling          OSTEP ch42
  27 ✅ LFS থেকে LSM-tree                       OSTEP ch43 + NEW
Part 4 — আজকের বাস্তবতা
  28 ✅ Data integrity, RAID → erasure coding   OSTEP ch38,44
  29 ✅ Container — namespace, cgroup, overlayfs AppB inverted + NEW
  30 ✅ Runtime টা OS এর client (capstone)      NEW

## Cuts that fund the additions (binding — do not silently restore)
segmentation 9pp→2 · VAX/VMS 9pp→0 (mechanisms redistributed) · AFS 14pp→3
· HDD scheduling 17pp→8 (drop SPTF/SATF, F-SCAN/C-SCAN, anticipatory,
track skew, multi-zone) · RAID 19pp→12 (drop RAID-4, add RAID-6/erasure)
· semaphores 18pp→8 (drop dining philosophers) · Banker's Algorithm →
historical note · worst-fit dropped · monitors appendix D dropped ·
trap-and-emulate + shadow page tables → 2pp note · NFS 16pp→6 · all 7
dialogue chapters dropped

## Key corrections to make (verified against source)
- EEVDF replaced CFS in Linux 6.6 (2023). OSTEP's "proportional share never
  achieved wide adoption" sentence must be DELETED, not softened: stride's
  pass/stride IS CFS vruntime; cgroup cpu.weight IS ticket assignment.
- `volatile` is NOT a synchronization primitive. OSTEP's threads.c teaches
  this by example. A data race is UB, not just a wrong answer.
- Segmentation is dead as translation: x86-64 long mode forces CS/DS/ES/SS
  bases to 0; only FS/GS keep bases (TLS, per-CPU).
- Loading is lazy: execve mmaps PT_LOAD segments; pages arrive by page
  fault. OSTEP's "OS reads bytes from disk into memory" contradicts its own
  paging chapters.
- HDD numbers are 2009 Seagate (300GB/1TB, 125MB/s). NVMe collapses the
  random/sequential gap from 200-300x to 2-5x; what remains is queue depth.
- OSTEP teaches only select()/poll(). libuv runs on epoll/kqueue. io_uring
  absent entirely.
- Appendix B VMM is Disco (1997, MIPS, software trap-and-emulate), predates
  VT-x/EPT and containers.
- DO NOT claim NVMe/MSI-X makes OSTEP's "lost interrupt" discussion wrong —
  an adversarial critic rejected that flag. Interrupt loss is real for
  edge-triggered sources and the pedagogical point stands.

## Source text (extracted from the PDF)
SOURCE=/private/tmp/claude-501/-Users-mostofareza-Desktop-Personal-os-fundamental/bdf9979c-3a56-4f10-9945-f77126a0fdf1/scratchpad/ostep/
  all.txt         whole book with "===== PDF PAGE N =====" markers
  brief.md        680KB consolidated survey: 64-chapter inventory,
                  180 dated items, 157 gaps, 128 dev connections,
                  129 misconceptions, 209 adversarial verdicts
  inv.json        per-slice inventory (structured)
  cri.json        adversarial critiques (structured)
If the scratchpad is gone, re-extract with pypdf from
HaPOS-master/"Operating Systems - Three Easy Pieces.pdf".

## Log
- 2026-09-17: ch 1, 2 written. Refactored monolith → tsp/ (13 css, 12 js,
  per-chapter files + manifest). Fixed: tokens.css broken comment killed
  the whole :root block (caught only by Chrome probe, not static checks);
  favicon 404; --measure 68ch → 920px for Bangla.
- 2026-09-17: ch 3,4,5 written (fork/COW, LDE, scheduling). verify.py +
  probe.js both pass; per-chapter render probe confirms 6 questions, 2-3
  ভুল ধারণা boxes, 5-10 ASCII diagrams each, no overflow, zero console
  errors. Added tsp/verify.py (catches the stranded-prose CSS bug that
  broke :root) and tsp/probe.js (Chrome DevTools, pass/fail verdict).
  Next group: ch 6 (EEVDF) and ch 7 (multicore + cgroup throttling).
- 2026-09-17: ch 6,7 written (EEVDF, multicore+cgroup throttling). Deleted
  OSTEP's "proportional share never achieved wide adoption" claim outright
  and showed stride's pass == CFS vruntime == cgroup cpu.weight. verify.py
  caught a real bug: unescaped `<` in ch6's EEVDF lag diagram would have
  swallowed part of the ASCII art in the browser. Both checks pass.
  Next group: ch 8,9,10,11 (address space → translation → TLB → swap/OOM).
- 2026-09-17: ch 8,9,10,11 written — PART 1 COMPLETE (11/30).
  ch8 compressed segmentation 9pp -> 2 paragraphs as planned, and replaced
  OSTEP's first/best/worst-fit survey with size classes + per-thread caches
  (no shipped allocator hunts a list). ch9 reframed multi-level tables as
  necessity not optimization (512GB linear table in 64-bit). ch10 added
  TLB shootdown/IPI, which OSTEP omits entirely, plus a runnable stride
  benchmark. ch11 deleted OSTEP's "buy more memory" advice and replaced it
  with PSI, MGLRU, zswap, memory.max vs memory.high, and the runtime-heap-
  vs-cgroup-limit bug. verify.py caught two real bugs this group: an
  unescaped `<` (ch6) and a malformed `<strong">` tag (ch8).
  Next group: Part 2 starts — ch 12 (thread), 13 (cache coherence),
  14 (memory model). 13 and 14 are near-net-new; OSTEP has nothing on
  memory models and its threads.c actively teaches the volatile mistake.
- 2026-09-17: ch 12,13,14 written (14/30). Part 2 under way.
  ch13 and ch14 are the two near-net-new chapters the pedagogy critic
  ranked as the top concurrency additions, and they pay off chapter 1's
  promise: OSTEP's `volatile int counter` is not merely wrong, it is a
  data race and therefore UB. ch13 carries a runnable false-sharing
  benchmark (~12x) and the x86-TSO vs ARM64 reordering table framed around
  develop-on-Apple-Silicon / deploy-on-Graviton. ch14 separates data race
  from race condition (check-then-act is a race with no data race) and
  gives the happens-before checklist. verify.py caught an unescaped Go
  channel arrow (`ch <- c`) in ch14.
  Next group: ch 15 (lock: spin -> futex), 16 (concurrent DS, RCU),
  17 (condvar + semaphore; drop dining philosophers per the cuts).
- 2026-09-17: ch 15,16,17 written (17/30). ch15 covers TAS -> TTAS -> ticket
  -> MCS -> futex two-path design, with the lock-holder-preemption failure
  that makes userspace spin locks dangerous under cpu.max. ch16 adds the
  cache-line padding requirement OSTEP omits from its sloppy counter, the
  "rdlock is itself a write" rwlock trap, RCU, and the ABA/reclamation
  problem that is the real difficulty in lock-free code. ch17 drops dining
  philosophers per the cuts and states why (its shape never appears in
  practice; the 2-row-lock-order deadlock does — that lands in ch18).
  Added a verify.py check for the malformed `<strong">` tag typo, which
  occurred twice; proved it fires, then restored the file.
  Next group: ch 18 (deadlock, Postgres 40P01, TSan/lockdep),
  19 (event loop: select -> epoll -> io_uring, libuv, Go netpoller),
  then Part 3 starts at ch 20.
- 2026-09-17: ch 18,19,20 written (20/30). PART 2 COMPLETE; Part 3 started.
  ch18 cut Banker's Algorithm to a note as planned and spent the space on
  TSan lock-order-inversion, lockdep, and Postgres 40P01 with the
  ORDER BY ... FOR UPDATE fix — showing it is the same total-order trick as
  comparing lock addresses in C. ch19 is the biggest source gap closed:
  OSTEP teaches only select()/poll() (epoll and io_uring appear zero times
  in the whole book) while teaching the very architecture libuv implements
  on epoll/kqueue. Added level vs edge triggered, the O_NONBLOCK-is-a-lie
  fact for regular files that forces libuv's 4-thread pool, io_uring rings,
  and Go's GMP/netpoller as the two-level alternative. ch20 covers the
  polling -> interrupt -> polling-again cycle (NVMe at ~20us makes a ~3us
  interrupt a 15% tax), DMA needing pinning + IOMMU, and why iostat %util
  is misleading on NVMe.
  Next group: ch 21 (flash/FTL, promoted out of Appendix I), 22 (files,
  inodes, fd), 23 (file system implementation + FFS).
- 2026-09-17: ch 21,22,23 written (23/30). ch21 promoted flash out of
  Appendix I and cut HDD scheduling (SPTF/SATF/F-SCAN/C-SCAN/anticipatory/
  track skew) per the cuts, keeping only the 190x random:sequential ratio
  because it explains every later design. Core additions: erase/program
  asymmetry -> FTL -> GC -> write amplification chain, SLC/MLC/TLC/QLC
  endurance, WAF math against drive lifetime, SLC-cache write cliff, TRIM,
  ZNS, and that WAF multiplies across layers. ch22 built everything on the
  two-names insight (inode has no name), covering fd/open-file-table/inode
  three-level structure, the du-vs-df deleted-but-open case with lsof +L1,
  TOCTOU and the *at() family. ch23 gives the vsfs layout, the 5-read
  open() and ~10-I/O create() counts that motivate ch24 and ch26, extents
  vs pointers, FFS locality reframed for flash, and df -i inode exhaustion.
  verify.py caught an unescaped `<` inside a shell comment in ch22.
  Next group: ch 24 (page cache), 25 (durability contract — highest
  priority addition in the whole book), 26 (crash consistency, journaling).
- 2026-09-17: ch 24,25,26 written (26/30). ch25 was the plan's #1 addition
  and it is done: the full chain (app buffer -> page cache -> device cache
  -> NAND), process-crash vs power-loss as distinct failure modes, the
  parent-directory fsync everyone omits, the 5-step safe-replace protocol,
  fsyncgate (a failed fsync must not be retried -> Postgres PANICs), PLP
  and why a consumer SSD can benchmark faster yet lose on fsync-heavy work,
  group commit, and per-language recipes. ch24 established page cache first
  so ch25 had somewhere to stand: free-vs-available, readahead/fadvise,
  writeback and the dirty_ratio cliff, mmap's SIGBUS (why Postgres avoids
  it), O_DIRECT and the Postgres-vs-MySQL split, and cgroup counting cache.
  ch26 tied the fs journal to Postgres WAL step for step, covered ext4's
  three data= modes, torn writes/full_page_writes, and corrected OSTEP's
  "ext3 is relatively modern" (driver removed in 4.3) and barrier BIOs
  (removed 2010, now REQ_PREFLUSH/REQ_FUA).
  Next group (FINAL): ch 27 (LFS -> LSM-tree), 28 (data integrity, RAID ->
  erasure coding), 29 (containers), 30 (runtime-as-OS-client capstone).
- 2026-09-17: ch 27,28,29,30 written. **BOOK COMPLETE — 30/30.**
  ch27 tied LFS to LSM-tree (memtable=segment buffer, SSTable=segment,
  compaction=cleaning) and added the RUM/amplification triangle plus bloom
  filters; noted LFS failed as a filesystem but won as an idea at three
  layers (FTL, LSM, CoW fs). ch28 cut RAID-4 and compressed RAID per the
  cuts, added erasure coding/S3, and built the chapter on checksum
  PLACEMENT (what each position can and cannot catch, incl. the lost-write
  case only a merkle tree catches). ch29 inverted OSTEP's Disco-based VMM
  appendix: containers lead as composed primitives (8 namespaces, cgroup
  v2, overlayfs copy_up, seccomp/caps/userns), hardware virt (VT-x/EPT)
  follows, classical trap-and-emulate is a note, and isolation is presented
  as a spectrum ending at Firecracker. ch30 is the capstone: five leak
  classes (container-limit blindness, RSS reporting, GC-meets-paging,
  hidden blocking, cloud storage), a layer-identification triage method
  with a runnable script, and the four chapter-1 misconceptions answered.
  Final: 68,744 words, 166 ASCII diagrams, 212 code blocks, 65 ভুল ধারণা
  callouts, 35 dev-connection boxes, 53 tables, 180 questions.
  verify.py + probe.js both clean; responsive verified 400-1800px.
