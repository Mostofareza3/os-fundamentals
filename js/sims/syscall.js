/* syscall.js — Chapter 1
   The system call boundary, step by step. Three scenarios from the
   chapter: readFileSync (openat → statx → read → close), opening
   /dev/disk0 (the kernel says EPERM), and a user-mode program trying a
   privileged instruction (the CPU traps, the kernel kills it).
*/

import { ui, select, stepper, note, modeBadge, logPanel, panel, el, chips } from './_lib.js';

const SCENARIOS = {
  read: {
    label: "fs.readFileSync('config.json')",
    steps: [
      { title: 'User mode: Node syscall-এর নম্বর আর argument গোছায়', detail: 'openat — "config.json খোলো", read-only', mode: 'user', log: ['[user]   readFileSync("config.json")'] },
      { title: 'syscall instruction (svc) — CPU kernel mode-এ', detail: 'Program নিজে ঠিক করতে পারে না kernel-এর কোথায় ঢুকবে; entry point kernel boot-এর সময়েই ঠিক করা', mode: 'kernel', kind: 'k', log: ['[cpu]    svc → kernel mode, jump to syscall entry'] },
      { title: 'Kernel যাচাই করে: পড়ার অনুমতি আছে? path বৈধ?', detail: 'credentials + file permission', mode: 'kernel', kind: 'k', log: ['[kernel] check: uid 501 may read config.json ✓'] },
      { title: 'File খোলে, fd 17 দেয়, user mode-এ ফেরে', detail: 'openat(AT_FDCWD, "config.json", O_RDONLY) = 17', mode: 'user', log: ['[kernel] openat(AT_FDCWD, "config.json", O_RDONLY|O_CLOEXEC) = 17', '[cpu]    back to user mode'] },
      { title: 'আবার syscall: statx(17) — "file কত বড়?"', detail: 'প্রতিটা syscall মানে আবার mode switch, আবার যাচাই', mode: 'kernel', kind: 'k', log: ['[cpu]    svc → kernel mode', '[kernel] statx(17, …) = 0  (stx_size = 14)', '[cpu]    back to user mode'] },
      { title: 'আবার syscall: read(17, buf, 14) — ১৪ byte copy', detail: 'read(17, "{\\"port\\":3000}\\n", 14) = 14', mode: 'kernel', kind: 'k', log: ['[cpu]    svc → kernel mode', '[kernel] read(17, "{\\"port\\":3000}\\n", 14) = 14', '[cpu]    back to user mode'] },
      { title: 'শেষ syscall: close(17)', detail: 'fd 17 আবার খালি', mode: 'kernel', kind: 'k', log: ['[cpu]    svc → kernel mode', '[kernel] close(17) = 0', '[cpu]    back to user mode'] },
      { title: 'User mode: readFileSync Buffer ফেরত দেয়', detail: 'এক লাইনের JS = ৪টা system call, ৮ বার mode বদল', mode: 'user', kind: '', log: ['[user]   → <Buffer 7b 22 70 6f 72 74 22 3a 33 30 30 30 7d 0a>'] }
    ],
    end: 'এক লাইনের <code>readFileSync</code> kernel-এর কাছে <b>৪ বার</b> গেল (openat, statx, read, close), আর প্রতিবার CPU user → kernel → user mode ঘুরে এল। <code>time</code>-এর <code>system</code> সময় এই kernel-এর ভেতরের অংশটাই।'
  },
  disk: {
    label: "fs.openSync('/dev/disk0', 'r')",
    steps: [
      { title: 'User mode: openat-এর argument — "/dev/disk0 খোলো"', detail: 'পুরো SSD-টা একটা বিশেষ file হিসেবে দেখা যায়', mode: 'user', log: ['[user]   openSync("/dev/disk0", "r")'] },
      { title: 'syscall instruction — CPU kernel mode-এ', detail: 'এখানে পর্যন্ত সব স্বাভাবিক', mode: 'kernel', kind: 'k', log: ['[cpu]    svc → kernel mode'] },
      { title: 'Kernel যাচাই করে: raw disk পড়ার অনুমতি নেই', detail: 'credentials: uid 501 (তুমি), owner: root — মেলে না', mode: 'kernel', kind: 'd', log: ['[kernel] check: uid 501 may open /dev/disk0? ✗'] },
      { title: 'কাজ হয় না — error নিয়ে user mode-এ ফেরে', detail: 'openat("/dev/disk0", O_RDONLY) = -1 EPERM', mode: 'user', kind: 'd', log: ['[kernel] openat(…, "/dev/disk0", O_RDONLY) = -1 EPERM (Operation not permitted)', '[cpu]    back to user mode'] },
      { title: 'User mode: Node error ছোড়ে', detail: 'Error: EPERM: operation not permitted', mode: 'user', kind: 'd', log: ['[user]   throw Error("EPERM: operation not permitted, open \'/dev/disk0\'")'] }
    ],
    end: 'Syscall kernel পর্যন্ত <b>পৌঁছেছিল</b> — kernel যাচাই করে "না" বলেছে। Process মরেনি, শুধু একটা error পেয়েছে। দরজা দিয়ে ঢোকা যায়, কিন্তু ভেতরে সিদ্ধান্ত kernel-এর।'
  },
  priv: {
    label: 'user mode-এ privileged instruction (সরাসরি hardware)',
    steps: [
      { title: 'User mode: syscall ছাড়াই সরাসরি disk controller-কে command', detail: 'privileged instruction — শুধু kernel mode-এ চলে', mode: 'user', log: ['[user]   execute: write to device register (privileged)'] },
      { title: 'CPU instruction-টা চালায়ই না — থেমে kernel-কে ডাকে', detail: 'এই পাহারা hardware-এর, software-এর না', mode: 'kernel', kind: 'd', log: ['[cpu]    TRAP: privileged instruction in user mode → kernel'] },
      { title: 'Kernel: বৈধ syscall না, নিয়ম ভাঙা — process killed', detail: 'যেভাবে ভুল memory ছুঁলে হয়: segmentation fault', mode: 'dead', kind: 'd', log: ['[kernel] illegal instruction → SIGILL, process killed'] }
    ],
    end: 'Kernel মাঝখানে বসে প্রতিটা instruction পরীক্ষা করে না — <b>CPU নিজে</b> user mode-এ privileged instruction আটকায়। তাই নিয়ম রক্ষার ক্ষমতা software-এ না, hardware-এ।'
  }
};

export function mount(root) {
  const u = ui(root);
  let current = 'read';
  let step = null;

  const sel = select('Scenario', Object.keys(SCENARIOS).map(function (k) { return { value: k, label: SCENARIOS[k].label }; }), current, function (v) { current = v; build(); });
  u.controls.appendChild(sel.el);

  const mode = modeBadge('user');
  const counters = chips(u.body);
  const cSys = counters.add('syscall', 0, 'k');
  const cSwitch = counters.add('mode switch', 0);
  u.body.insertBefore(counters.el, u.stage);
  counters.el.insertBefore(mode.el, counters.el.firstChild);

  const cols = el('div', { class: 'sim-cols w-21' });
  const left = panel(cols, 'ধাপ');
  const right = panel(cols, 'strace-এর চোখে', 'k');
  const log = logPanel(right, 40);
  u.stage.appendChild(cols);

  function build() {
    // remove the previous stepper's buttons
    if (step) { Object.keys(step.buttons).forEach(function (k) { step.buttons[k].remove(); }); left.removeChild(step.list); }
    const sc = SCENARIOS[current];
    let sys = 0, sw = 0, lastMode = 'user';
    step = stepper(u.controls, sc.steps, function (i, s) {
      if (i < 0) {
        mode.set('user'); log.clear(); sys = 0; sw = 0; lastMode = 'user';
        cSys.set(0); cSwitch.set(0);
        note(u, 'Scenario বেছে "→ পরের ধাপ" চাপো। বাঁয়ে কী ঘটছে, ডানে <code>strace</code> হলে যা দেখাত।');
        return;
      }
      // recompute counters from the start so going backwards stays right
      sys = 0; sw = 0; lastMode = 'user'; log.clear();
      for (let j = 0; j <= i; j++) {
        const st = sc.steps[j];
        st.log.forEach(function (line) {
          const kind = line.indexOf('[kernel]') === 0 ? 'k' : line.indexOf('[cpu]') === 0 ? 'm' : line.indexOf('throw') > -1 || line.indexOf('killed') > -1 || line.indexOf('TRAP') > -1 ? 'd' : 'u';
          log.add(line, kind);
          if (line.indexOf('svc →') > -1 || line.indexOf('TRAP') > -1) { sw++; sys += line.indexOf('svc') > -1 ? 1 : 0; }
          if (line.indexOf('back to user') > -1) sw++;
        });
        lastMode = st.mode;
      }
      mode.set(lastMode);
      cSys.set(sys); cSwitch.set(sw);
      if (i === sc.steps.length - 1) note(u, sc.end, s.kind === 'd' ? 'd' : 'ok');
      else note(u, s.mode === 'kernel' ? 'এখন CPU <b>kernel mode</b>-এ: kernel-এর code চলছে, তোমার Node-এর না।' : s.mode === 'dead' ? 'Process আর নেই।' : 'CPU <b>user mode</b>-এ: hardware ছোঁয়ার ক্ষমতা নেই, শুধু নিজের memory।', s.mode === 'dead' ? 'd' : s.mode === 'kernel' ? 'k' : '');
    });
    left.appendChild(step.list);
  }

  build();
}
