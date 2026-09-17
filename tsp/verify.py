#!/usr/bin/env python3
"""Static verification for the tsp/ book. Run from repo root:  python3 tsp/verify.py
Exits non-zero on any failure so a build loop can gate on it."""
import html.parser, json, os, re, sys

ROOT = os.path.join(os.path.dirname(os.path.abspath(__file__)))
fails, warns = [], []

def fail(m): fails.append(m)
def warn(m): warns.append(m)

VOID = {'meta','link','br','hr','img','input','source','area','base','col',
        'embed','param','track','wbr'}

class Balance(html.parser.HTMLParser):
    def __init__(self):
        super().__init__(convert_charrefs=True)
        self.stack, self.bad = [], []
    def handle_starttag(self, t, a):
        if t not in VOID: self.stack.append(t)
    def handle_endtag(self, t):
        if t in VOID: return
        if self.stack and self.stack[-1] == t: self.stack.pop()
        elif t in self.stack:
            while self.stack and self.stack.pop() != t: pass
            self.bad.append('crossed </%s>' % t)
        else: self.bad.append('stray </%s>' % t)

# ---- manifest ----
mpath = os.path.join(ROOT, 'chapters', 'manifest.json')
try:
    man = json.load(open(mpath, encoding='utf-8'))
except Exception as e:
    print('FATAL: manifest unreadable:', e); sys.exit(1)

parts, chaps = man.get('parts', {}), man.get('chapters', [])
seen_ids, seen_nums, seen_files = set(), set(), set()
for c in chaps:
    for k in ('id','num','part','title','file'):
        if k not in c: fail('manifest entry missing %s: %r' % (k, c))
    if c['id'] in seen_ids: fail('duplicate manifest id: ' + c['id'])
    if c['num'] in seen_nums: fail('duplicate chapter num: ' + c['num'])
    if c['file'] in seen_files: fail('duplicate file: ' + c['file'])
    seen_ids.add(c['id']); seen_nums.add(c['num']); seen_files.add(c['file'])
    if c.get('part') not in parts: fail('unknown part %r in %s' % (c.get('part'), c['id']))
    p = os.path.join(ROOT, 'chapters', c['file'])
    if not os.path.exists(p): fail('missing chapter file: ' + c['file'])

# manifest order must match chapter numbers
nums = [int(c['num']) for c in chaps if str(c['num']).isdigit()]
if nums != sorted(nums): fail('manifest not in chapter-number order: %s' % nums)

# orphan chapter files
on_disk = {f for f in os.listdir(os.path.join(ROOT,'chapters')) if f.endswith('.html')}
for f in sorted(on_disk - seen_files): warn('chapter file not in manifest: ' + f)

# ---- chapter bodies ----
all_ids = []
for c in chaps:
    p = os.path.join(ROOT, 'chapters', c['file'])
    if not os.path.exists(p): continue
    src = open(p, encoding='utf-8').read()
    b = Balance(); b.feed(src)
    if b.stack: fail('%s: unclosed tags %s' % (c['file'], b.stack))
    if b.bad:   fail('%s: %s' % (c['file'], b.bad[:3]))
    # partials must NOT carry their own <section> wrapper
    if re.search(r'<section\b', src): fail('%s: contains <section> (shell adds it)' % c['file'])
    # raw < or & inside code blocks break rendering
    for m in re.finditer(r'<pre[^>]*>(.*?)</pre>', src, re.S):
        body = m.group(1)
        stripped = re.sub(r'</?code[^>]*>', '', body)
        if re.search(r'<(?![/!])', stripped):
            fail('%s: unescaped "<" in a <pre> (use &lt;)' % c['file'])
            break
    # malformed tag: <strong"> / <em"> — a quote typo that silently
    # breaks the tag structure. Seen twice while writing; catch it by name.
    bad_tag = re.search(r'<(\w+)"', src)
    if bad_tag:
        fail('%s: malformed tag <%s"> — stray quote after the tag name'
             % (c['file'], bad_tag.group(1)))

    all_ids += re.findall(r'\sid="([^"]+)"', src)
    # required per-chapter furniture
    if 'class="qs"' not in src: warn('%s: no questions block' % c['file'])
    if 'box wrong' not in src:  warn('%s: no ভুল ধারণা callout' % c['file'])
    if 'class="ascii"' not in src: warn('%s: no ASCII diagram' % c['file'])
    # Bangla script actually present
    if not re.search(r'[ঀ-৿]', src): fail('%s: no Bangla text' % c['file'])
    # romanized-Bangla smell: long ASCII-only prose paragraphs
    for pm in re.finditer(r'<p>(.*?)</p>', src, re.S):
        t = re.sub(r'<[^>]+>', '', pm.group(1)).strip()
        if len(t) > 80 and not re.search(r'[ঀ-৿]', t):
            warn('%s: ASCII-only paragraph (romanized Bangla?): %s' % (c['file'], t[:60]))
            break

dups = sorted({i for i in all_ids if all_ids.count(i) > 1})
if dups: fail('duplicate ids across chapters (breaks anchors): %s' % dups)

# ---- shell ----
shell = open(os.path.join(ROOT,'index.html'), encoding='utf-8').read()
b = Balance(); b.feed(shell)
if b.stack: fail('index.html: unclosed %s' % b.stack)
if b.bad:   fail('index.html: %s' % b.bad[:3])
for el in ('page','sidebar','scrim','progress','searchOverlay','searchInput',
           'searchResults','menuBtn','searchBtn','themeBtn'):
    if 'id="%s"' % el not in shell: fail('index.html missing #%s' % el)

linked = re.findall(r'href="(css/[^"]+)"', shell)
for f in linked:
    if not os.path.exists(os.path.join(ROOT, f)): fail('missing stylesheet: ' + f)
css_disk = sorted(f for f in os.listdir(os.path.join(ROOT,'css')) if f.endswith('.css'))
for f in css_disk:
    if 'css/' + f not in linked: fail('stylesheet on disk but not linked: ' + f)
if linked and os.path.basename(linked[0]) != 'tokens.css':
    fail('tokens.css must be linked first (got %s)' % linked[0])

# ---- css ----
tok_path = os.path.join(ROOT,'css','tokens.css')
tok = open(tok_path, encoding='utf-8').read()
rest = ''.join(open(os.path.join(ROOT,'css',f), encoding='utf-8').read()
               for f in css_disk if f != 'tokens.css')
allcss = tok + rest
if allcss.count('{') != allcss.count('}'): fail('CSS braces unbalanced')
for f in css_disk:
    s = open(os.path.join(ROOT,'css',f), encoding='utf-8').read()
    if s.count('/*') != s.count('*/'): fail('%s: unbalanced comment markers' % f)
    # prose stranded outside a comment (the tokens.css bug that killed :root)
    stripped = re.sub(r'/\*.*?\*/', '', s, flags=re.S)
    depth = 0
    for i, line in enumerate(stripped.split('\n')):
        t = line.strip()
        opens, closes = line.count('{'), line.count('}')
        inside = depth > 0
        depth += opens - closes
        if not t or inside: continue          # declarations live inside blocks
        if '{' in t or '}' in t: continue     # selector or block edge
        if t.endswith(',') or t.endswith(';'): continue  # wrapped value/selector
        if re.match(r'^[A-Za-z]', t) and ':' not in t:
            fail('%s line %d: prose outside a comment: %r' % (f, i, t[:50])); break
hexes = re.findall(r'#[0-9A-Fa-f]{3,8}\b', rest)
if hexes: fail('hardcoded hex outside tokens.css: %s' % sorted(set(hexes)))
rgba = re.findall(r'rgba?\([^)]*\)', rest)
if rgba: fail('raw rgb/rgba outside tokens.css: %s' % sorted(set(rgba)))
if ':root' not in tok: fail('tokens.css has no :root block')
for need in ('--bg','--text','--measure','--font-bn','--font-mono'):
    if need not in tok: fail('tokens.css missing %s' % need)

# ---- js ----
jsdir = os.path.join(ROOT,'js')
jsfiles = sorted(f for f in os.listdir(jsdir) if f.endswith('.js'))
exports = {}
for f in jsfiles:
    s = open(os.path.join(jsdir,f), encoding='utf-8').read()
    names = set(re.findall(r'export\s+(?:async\s+)?function\s+(\w+)', s))
    names |= set(re.findall(r'export\s+(?:let|const|var)\s+(\w+)', s))
    exports[f] = names
for f in jsfiles:
    s = open(os.path.join(jsdir,f), encoding='utf-8').read()
    for block, mod in re.findall(r'import\s*\{([^}]+)\}\s*from\s*\'\./([^\']+)\'', s):
        if not os.path.exists(os.path.join(jsdir, mod)):
            fail('%s imports missing module %s' % (f, mod)); continue
        for n in [x.strip().split(' as ')[0].strip() for x in block.split(',') if x.strip()]:
            if n not in exports.get(mod, set()):
                fail('%s imports %s from %s, not exported' % (f, n, mod))

# ---- report ----
print('chapters: %d | css: %d | js: %d' % (len(chaps), len(css_disk), len(jsfiles)))
for w in warns: print('  WARN  ' + w)
if fails:
    print('\nFAILED (%d):' % len(fails))
    for f in fails: print('  ✗ ' + f)
    sys.exit(1)
print('\nOK — all static checks passed' + (' (%d warnings)' % len(warns) if warns else ''))
