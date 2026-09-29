/* codeblock.js
   Turns every <pre> in a chapter into a labelled, highlighted block.

   The chapter markup says what a block holds, through the <pre>'s class:
     cmd       commands you type in a terminal — gets a "$" per command
     out       what a program printed — no highlighting, no Copy
     lang-js / lang-py / lang-c / lang-sh / lang-asm   a source file
     plain     anything else — no header
   A block with no class is treated like plain.

   Highlighting is a small hand-written tokenizer per language, not a
   parser: it only has to colour comments, strings, keywords and so on
   well enough to make the code easier to scan. It never changes the
   text, so Copy (and a manual select-and-copy) gives back exactly what
   the chapter wrote. The "$" prompts are CSS ::before, so they are not
   copied either.

   Runs per chapter as its markup arrives, and marks blocks it has
   already handled so re-running is harmless.
*/

const LABELS = { js: 'JavaScript', py: 'Python', c: 'C', sh: 'Shell script', asm: 'Assembly' };

export function enhanceCodeBlocks(scope) {
  scope.querySelectorAll('pre:not(.diagram)').forEach(function (pre) {
    if (pre.dataset.enhanced === '1') return;
    pre.dataset.enhanced = '1';

    const code = pre.querySelector('code') || pre;
    const text = code.textContent;
    const kind = kindOf(pre);

    let wrap = pre.parentElement;
    if (!wrap.classList.contains('codewrap')) {
      wrap = document.createElement('div');
      wrap.className = 'codewrap';
      pre.parentNode.insertBefore(wrap, pre);
      wrap.appendChild(pre);
    }
    wrap.classList.add('k-' + kind.name);

    if (kind.lang) code.innerHTML = render(text, kind.lang, kind.name === 'cmd');

    const copy = kind.name === 'out' ? null : copyButton(text);
    if (kind.name === 'plain') {
      if (copy) wrap.appendChild(copy);
      return;
    }

    wrap.classList.add('framed');
    const head = document.createElement('div');
    head.className = 'code-head';
    const label = document.createElement('span');
    label.className = 'code-label';
    label.textContent = labelFor(kind, text);
    head.appendChild(label);
    if (copy) head.appendChild(copy);
    wrap.insertBefore(head, pre);
  });
}

function kindOf(pre) {
  if (pre.classList.contains('cmd')) return { name: 'cmd', lang: 'sh' };
  if (pre.classList.contains('out')) return { name: 'out', lang: null };
  const m = /\blang-(\w+)/.exec(pre.className);
  if (m && TOKENIZERS[m[1]]) return { name: 'src', lang: m[1] };
  return { name: 'plain', lang: null };
}

function labelFor(kind, text) {
  if (kind.name === 'cmd') return 'Terminal';
  if (kind.name === 'out') return 'Output';
  // A source file whose first line names it ("// validate.js — ...")
  // is labelled with that name; otherwise with its language.
  const m = /^\s*(?:\/\/|#)\s*([\w.-]+\.(?:js|py|sh|c))\b/.exec(text);
  return m ? m[1] : LABELS[kind.lang];
}

function copyButton(text) {
  const btn = document.createElement('button');
  btn.className = 'copybtn';
  btn.type = 'button';
  btn.textContent = 'Copy';

  btn.addEventListener('click', function () {
    function done() {
      btn.textContent = 'Copied ✓';
      btn.classList.add('done');
      setTimeout(function () {
        btn.textContent = 'Copy';
        btn.classList.remove('done');
      }, 1500);
    }

    function fallback() {
      const ta = document.createElement('textarea');
      ta.value = text;
      document.body.appendChild(ta);
      ta.select();
      try { document.execCommand('copy'); done(); } catch (e) {}
      document.body.removeChild(ta);
    }

    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(text).then(done).catch(fallback);
    } else fallback();
  });
  return btn;
}

/* ---------- rendering ----------
   A tokenizer returns [class, text] pairs whose texts join back into
   the input. render() splits them into one <span class="ln"> per line,
   so CSS can give each line a hanging indent, and marks the lines where
   a new command starts (tokenizers report those as a 'start' pair). */

function render(text, lang, prompts) {
  const toks = TOKENIZERS[lang](text);
  const lines = [];
  let cur = '';
  let prompt = false;

  // The newline stays inside its line's span, so the block's text is
  // unchanged; a trailing newline in a block does not add a blank line.
  // --i is the line's own indentation, so when a long line wraps, CSS
  // can hang the rest of it a little to the right of where it began.
  function flush(nl) {
    const lead = /^ */.exec(raw)[0].length;
    lines.push('<span class="ln' + (prompt ? ' p' : '') + '"' +
      (lead ? ' style="--i:' + lead + '"' : '') + '>' + cur + nl + '</span>');
    cur = '';
    raw = '';
    prompt = false;
  }

  let raw = '';
  toks.forEach(function (t) {
    if (t[0] === 'start') { prompt = prompts; return; }
    t[1].split('\n').forEach(function (piece, i) {
      if (i > 0) flush('\n');
      if (piece) cur += t[0] ? '<span class="t-' + t[0] + '">' + esc(piece) + '</span>' : esc(piece);
      raw += piece;
    });
  });
  flush('');
  return lines.join('');
}

function esc(s) {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

/* ---------- generic rule tokenizer (JS, Python, C, assembly) ----------
   At each position, the first rule whose sticky regex matches wins;
   anything no rule matches is emitted as plain text. */

function ruleTokenizer(rules) {
  const compiled = rules.map(function (r) { return [new RegExp(r[0].source, 'y' + r[0].flags), r[1]]; });
  return function (text) {
    const out = [];
    let i = 0;
    let plain = '';
    while (i < text.length) {
      let hit = null;
      for (const [re, cls] of compiled) {
        re.lastIndex = i;
        const m = re.exec(text);
        if (m && m[0].length) {
          // cls: a class, a function of the match, or one class per group
          hit = Array.isArray(cls)
            ? cls.map((c, g) => [c, m[g + 1] || ''])
            : [[typeof cls === 'function' ? cls(m) : cls, m[0]]];
          i += m[0].length;
          break;
        }
      }
      if (hit) {
        if (plain) { out.push(['', plain]); plain = ''; }
        hit.forEach(t => { if (t[1]) out.push(t); });
      } else {
        plain += text[i++];
      }
    }
    if (plain) out.push(['', plain]);
    return out;
  };
}

const kwSet = s => new Set(s.split(' '));
const JS_KW = kwSet('const let var function return if else for while do break continue new class extends async await try catch finally throw typeof instanceof of in switch case default yield import export from delete void');
const JS_LIT = kwSet('true false null undefined NaN Infinity this');
const PY_KW = kwSet('def class return if elif else for while in import from as with try except finally raise pass break continue lambda and or not is yield global nonlocal async await del assert');
const PY_LIT = kwSet('None True False self');
const C_KW = kwSet('int char void return if else for while do break continue static const unsigned signed long short struct union enum typedef sizeof extern volatile switch case default goto size_t uint8_t uint32_t uint64_t int64_t double float');
const C_LIT = kwSet('NULL true false');

// An identifier is a keyword, a literal, a call ("name(") or nothing.
// Pair with IDENT: group 1 is a name followed by "(", group 2 any other.
function wordClass(kw, lit) {
  return function (m) {
    const w = m[1] || m[2];
    if (kw.has(w)) return 'kw';
    if (lit.has(w)) return 'lit';
    return m[1] ? 'fn' : '';
  };
}
const IDENT = /([A-Za-z_$][\w$]*)(?=\s*\()|([A-Za-z_$][\w$]*)/;

const NUM = [/0[xX][0-9a-fA-F_]+n?|0[oObB][0-7_]+|\b\d[\d_]*(?:\.\d+)?(?:[eE][+-]?\d+)?n?\b/, 'num'];

const TOKENIZERS = {
  js: ruleTokenizer([
    [/\/\/[^\n]*/, 'com'],
    [/\/\*[\s\S]*?\*\//, 'com'],
    [/'(?:\\.|[^'\\\n])*'?|"(?:\\.|[^"\\\n])*"?|`(?:\\.|[^`\\])*`?/, 'str'],
    [/%[A-Za-z]+(?=\()/, 'fn'],                       // V8 natives: %DebugPrint(
    // a regex literal can only follow an operator or an opening bracket
    [/(?<=(?:^|[(,=:[!&|?{};])[ \t]*)\/(?![*\/])(?:\\.|\[(?:\\.|[^\]\\\n])*\]|[^\/\\\n])+\/[dgimsuy]*/m, 'str'],
    [IDENT, wordClass(JS_KW, JS_LIT)],
    NUM,
  ]),
  py: ruleTokenizer([
    [/#[^\n]*/, 'com'],
    [/[rbfRBF]{0,2}(?:'''[\s\S]*?'''|"""[\s\S]*?"""|'(?:\\.|[^'\\\n])*'?|"(?:\\.|[^"\\\n])*"?)/, 'str'],
    [IDENT, wordClass(PY_KW, PY_LIT)],
    NUM,
  ]),
  c: ruleTokenizer([
    [/\/\/[^\n]*/, 'com'],
    [/\/\*[\s\S]*?\*\//, 'com'],
    [/^[ \t]*#\s*\w+[^\n]*/m, 'kw'],                   // #include <stdio.h>
    [/'(?:\\.|[^'\\\n])*'|"(?:\\.|[^"\\\n])*"?/, 'str'],
    [IDENT, wordClass(C_KW, C_LIT)],
    NUM,
  ]),
  asm: ruleTokenizer([
    [/;[^\n]*|\/\/[^\n]*/, 'com'],
    [/#-?(?:0x[0-9a-fA-F]+|\d+)/, 'num'],
    // the mnemonic, after any address / opcode columns an objdump adds
    [/^([ \t]*(?:[0-9a-fA-F]+:?[ \t]+)*)([a-z][a-z0-9.]*)(?=[ \t]|$)/m, ['', 'kw']],
  ]),
  sh: shellTokens,
};

/* ---------- shell ----------
   Walks the text once, tracking just enough state to colour a command
   line: whether the next word names a command, and how deep inside
   do/done, then/fi, { } and $( ) we are. A line that starts at depth 0
   and does not continue the previous one (trailing "\", "|", "&&") is a
   new command — that is where the "$" goes.

   The body of `bash -c '...'`, `node -e "..."` and `python3 -c "..."`,
   and of a `cat > x.js <<'EOF'` heredoc, is highlighted in its own
   language, so a script handed to a container does not render as one
   long string. */

const SH_KW = kwSet('for in do done if then elif else fi while until case esac function select');
const SH_OPEN = kwSet('do then case');
const SH_CLOSE = kwSet('done fi esac');
const SH_CMD_AFTER = kwSet('do then else elif if while until');   // keyword followed by a command
const SH_PREFIX = kwSet('time sudo exec nohup env xargs');
const SH_INTERP = { sh: 'sh', bash: 'sh', zsh: 'sh', node: 'js', python: 'py', python3: 'py' };
const SH_EVAL_FLAG = kwSet('-c -e -p --eval --print');
const EXT_LANG = { js: 'js', py: 'py', sh: 'sh', c: 'c' };

function shellTokens(text) {
  const out = [];
  const push = (cls, s) => out.push([cls, s]);
  let i = 0;
  let cmdPos = true;       // next word names a command
  let depth = 0;
  let cont = false;        // this line continues onto the next
  let interp = null;       // interpreter named so far in this command
  let prevWord = '';
  let forVar = 0;          // words since "for" (its "in" is a keyword)
  let heredoc = null;      // { delim, lang } waiting for the next newline
  let lineStart = true;

  while (i < text.length) {
    const ch = text[i];

    if (lineStart) {
      lineStart = false;
      const next = text[i + /^[ \t]*/.exec(text.slice(i))[0].length];
      if (depth === 0 && !cont && next !== undefined && next !== '\n' && next !== '#') push('start', '');
      cont = false;
    }

    if (ch === '\n') {
      push('', '\n');
      i++;
      if (!cont) { cmdPos = true; interp = null; }
      if (heredoc) {
        const rest = text.slice(i);
        const end = new RegExp('^[ \\t]*' + heredoc.delim + '[ \\t]*$', 'm').exec(rest);
        const body = end ? rest.slice(0, end.index) : rest;
        (heredoc.lang ? TOKENIZERS[heredoc.lang](body) : [['str', body]]).forEach(t => out.push(t));
        if (end) push('str', end[0]);
        i += body.length + (end ? end[0].length : 0);
        heredoc = null;
        continue;          // the newline after the delimiter ends the command
      }
      lineStart = true;
      continue;
    }
    if (ch === ' ' || ch === '\t') {
      const m = /^[ \t]+/.exec(text.slice(i))[0];
      push('', m);
      i += m.length;
      continue;
    }

    // comment: "#" at the start of a word
    if (ch === '#') {
      const m = /^#[^\n]*/.exec(text.slice(i))[0];
      push('com', m);
      i += m.length;
      continue;
    }

    // line continuation
    if (ch === '\\' && text[i + 1] === '\n') {
      push('op', '\\');
      cont = true;
      i++;
      continue;
    }

    // operators and redirections
    const op = /^(?:\|\||&&|<<-?|\d?>>?&?\d?|<|\||;|&)/.exec(text.slice(i));
    if (op) {
      push('op', op[0]);
      i += op[0].length;
      if (/^(?:\|\||&&|\||;|&)$/.test(op[0])) {
        cmdPos = true;
        interp = null;
        cont = /^(?:\|\||&&|\|)$/.test(op[0]) && /^[ \t]*(?:\n|$)/.test(text.slice(i));
      }
      if (op[0].startsWith('<<')) {
        const d = /^[ \t]*(['"]?)([A-Za-z_]\w*)\1/.exec(text.slice(i));
        const line = text.slice(0, i).split('\n').pop() + text.slice(i).split('\n')[0];
        const ext = /\.(js|py|sh|c)\b/.exec(line);
        if (d) heredoc = { delim: d[2], lang: ext ? EXT_LANG[ext[1]] : null };
      }
      continue;
    }

    if (ch === '(' || ch === ')') {
      push('', ch);
      depth = Math.max(0, depth + (ch === '(' ? 1 : -1));
      if (ch === '(') cmdPos = true;
      i++;
      continue;
    }

    // one shell word: runs of plain text, quoted strings and $expansions
    const start = i;
    const word = [];
    let afterSub = false;
    let bare = '';
    let subCmd = false;      // this word opened a $( — its next piece is a command
    while (i < text.length && !/[\s|&;<>()]/.test(text[i])) {
      const c = text[i];
      if (c === "'" || c === '"') {
        const end = findQuote(text, i);
        const body = text.slice(i + 1, end);
        const lang = SH_EVAL_FLAG.has(prevWord) && interp;
        word.push(['str', c]);
        if (lang) {
          const sub = lang === 'sh' ? shellTokens(body).filter(t => t[0] !== 'start') : TOKENIZERS[lang](body);
          sub.forEach(t => word.push(t));
        } else if (c === '"') {
          splitDollars(body).forEach(t => word.push(t));
        } else {
          word.push(['str', body]);
        }
        if (end < text.length) word.push(['str', c]);
        i = end + 1;
        continue;
      }
      if (c === '$') {
        const m = /^\$(?:\{[^}\n]*\}|\(\(|\(|[A-Za-z_]\w*|[$?!#@*0-9])?/.exec(text.slice(i))[0];
        word.push(['var', m]);
        i += m.length;
        if (m === '$(') { depth++; subCmd = true; afterSub = true; }
        if (m === '$((') depth += 2;
        continue;
      }
      if (c === '\\' && i + 1 < text.length) {
        word.push(['', text.slice(i, i + 2)]);
        bare += text[i + 1];
        i += 2;
        continue;
      }
      const m = /^[^\s|&;<>()'"$\\]+/.exec(text.slice(i))[0];
      word.push([afterSub ? 'cm' : '', m]);
      afterSub = false;
      bare += m;
      i += m.length;
    }
    if (i === start) {           // a lone character nothing above claims
      push('', text[i++]);
      continue;
    }

    const whole = text.slice(start, i);
    const simple = word.length === 1 && word[0][0] === '';
    const base = bare.split('/').pop();
    let cls = '';
    forVar = forVar ? forVar + 1 : 0;
    if (simple && cmdPos && SH_KW.has(whole)) {
      cls = 'kw';
      if (SH_OPEN.has(whole)) depth++;
      if (SH_CLOSE.has(whole)) depth = Math.max(0, depth - 1);
      cmdPos = SH_CMD_AFTER.has(whole);
      if (whole === 'for' || whole === 'select' || whole === 'case') forVar = 1;
    } else if (simple && whole === 'in' && forVar === 3) {
      cls = 'kw';
    } else if (simple && cmdPos && (whole === '{' || whole === '}')) {
      depth = Math.max(0, depth + (whole === '{' ? 1 : -1));
    } else if (cmdPos && /^[A-Za-z_]\w*=/.test(whole)) {
      cls = 'var';                                    // FOO=1 cmd
    } else if (cmdPos && whole[0] === '-') {
      cls = 'fl';                                     // time -p cmd
    } else if (cmdPos) {
      cls = 'cm';
      cmdPos = SH_PREFIX.has(base);
      if (SH_INTERP[base]) interp = SH_INTERP[base];
    } else if (whole[0] === '-') {
      cls = 'fl';
    } else if (SH_INTERP[base]) {
      interp = SH_INTERP[base];                       // docker run IMAGE node -e ...
    }

    if (cls === 'var' && simple) {
      const eq = whole.indexOf('=');
      push('var', whole.slice(0, eq + 1));
      push('', whole.slice(eq + 1));
    } else {
      // plain pieces take the word's colour; quotes and $vars keep theirs
      word.forEach(t => push(t[0] || cls, t[1]));
    }
    if (subCmd) cmdPos = false;                       // s=$(date +%s)
    prevWord = whole;
  }
  return out;
}

// Index of the quote closing the one at `i` (text.length if unclosed).
function findQuote(text, i) {
  const q = text[i];
  let j = i + 1;
  while (j < text.length && text[j] !== q) j += (q === '"' && text[j] === '\\') ? 2 : 1;
  return Math.min(j, text.length);
}

// Inside "double quotes": the string colour, with $VAR and $(…) picked out.
function splitDollars(body) {
  const out = [];
  const re = /\$(?:\{[^}\n]*\}|\([^)\n]*\)|[A-Za-z_]\w*|[$?!#@*0-9])/g;
  let last = 0;
  let m;
  while ((m = re.exec(body))) {
    if (m.index > last) out.push(['str', body.slice(last, m.index)]);
    out.push(['var', m[0]]);
    last = re.lastIndex;
  }
  if (last < body.length) out.push(['str', body.slice(last)]);
  return out;
}
