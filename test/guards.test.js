// Guards for the rules in CLAUDE.md. Each of these mistakes is invisible on a desktop browser
// with a good connection and only shows up on a phone or offline, so a human reviewer reliably
// misses them — that is exactly why they are enforced here instead of just documented.
const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.join(__dirname, '..');
const read = f => fs.readFileSync(path.join(ROOT, f), 'utf8');

const appJs = read('app.js');
const indexHtml = read('index.html');
const swJs = read('sw.js');

// Remote hosts the app is allowed to talk to. Everything else must be vendored locally.
// Only Firebase is left: it is a network service by nature, is guarded, and falls back to
// localStorage, so the app still starts and plays without it.
const ALLOWED_HOSTS = ['www.gstatic.com', 'firebase.google.com'];

/** Body of a top-level `function name(...) { ... }`, found by brace matching. */
function functionBody(src, name) {
  const start = src.indexOf(`function ${name}(`);
  assert.notStrictEqual(start, -1, `function ${name}() not found — did it get renamed?`);
  const open = src.indexOf('{', start);
  let depth = 0;
  for (let i = open; i < src.length; i++) {
    if (src[i] === '{') depth++;
    else if (src[i] === '}' && --depth === 0) return src.slice(open, i + 1);
  }
  throw new Error(`unbalanced braces in ${name}()`);
}

test('Rule 1: app.js never loads data from an external URL', () => {
  // xmlns="http://www.w3.org/2000/svg" in the inline SVG icons is an XML namespace identifier,
  // never fetched — strip those first so a genuine request to w3.org would still be caught.
  const scannable = appJs.replace(/xmlns(:[a-z]+)?=("|')[^"']*\2/g, '');
  const urls = [...scannable.matchAll(/https?:\/\/([^/'"`\s]+)/g)].map(m => m[1]);
  const offenders = [...new Set(urls)].filter(h => !ALLOWED_HOSTS.includes(h));
  assert.deepStrictEqual(offenders, [],
    `Found external host(s) in app.js: ${offenders.join(', ')}. ` +
    `The service worker can only cache same-origin responses, so this breaks offline support. ` +
    `Download the file into data/ and reference it with a relative path instead.`);
});

test('Rule 1: index.html loads its scripts locally', () => {
  const srcs = [...indexHtml.matchAll(/<script[^>]+src="([^"]+)"/g)].map(m => m[1]);
  const remote = srcs.filter(s => /^https?:\/\//.test(s));
  const offenders = remote.filter(s => !ALLOWED_HOSTS.some(h => s.includes(h)));
  assert.deepStrictEqual(offenders, [],
    `index.html loads script(s) from an unexpected host: ${offenders.join(', ')}. ` +
    `Without these cached the app cannot boot offline at all.`);
  // D3 and TopoJSON specifically must stay local — the app cannot even start without them.
  assert.ok(srcs.some(s => s.startsWith('vendor/') && s.includes('d3')), 'D3 must be loaded from vendor/');
  assert.ok(srcs.some(s => s.startsWith('vendor/') && s.includes('topojson')), 'TopoJSON must be loaded from vendor/');
});

test('Rule 2: every local data path referenced in app.js exists on disk', () => {
  const refs = [...new Set([...appJs.matchAll(/['"`]((?:data|vendor)\/[^'"`]*)['"`]/g)].map(m => m[1]))];
  assert.ok(refs.length > 0, 'expected app.js to reference bundled data — did the paths change?');

  const missing = refs.filter(ref => {
    // Paths built by concatenation (e.g. 'data/outline/' + name + '.json') can only be checked
    // as far as their literal prefix, so fall back to asserting the directory exists.
    const target = ref.endsWith('/') ? ref : ref;
    return !fs.existsSync(path.join(ROOT, target));
  });
  assert.deepStrictEqual(missing, [],
    `app.js references bundled file(s) that do not exist: ${missing.join(', ')}`);
});

test('Rule 2: the service worker can cache every bundled data file', () => {
  // Mirrors the RUNTIME_CACHEABLE regex in sw.js. If that pattern is narrowed, or a data file is
  // put somewhere it does not match, this fails instead of silently breaking offline support.
  const m = swJs.match(/const RUNTIME_CACHEABLE\s*=\s*(\/.+?\/[gimsuy]*)\s*;/);
  assert.ok(m, 'RUNTIME_CACHEABLE not found in sw.js');
  const runtimeCacheable = eval(m[1]);
  const precached = [...swJs.matchAll(/'\.\/([^']+)'/g)].map(x => x[1]);

  const walk = dir => fs.readdirSync(path.join(ROOT, dir), { withFileTypes: true })
    .flatMap(e => e.isDirectory() ? walk(`${dir}/${e.name}`) : [`${dir}/${e.name}`]);
  const bundled = [...walk('data'), ...walk('vendor')];
  assert.ok(bundled.length >= 12, `expected the bundled assets to still be there, found ${bundled.length}`);

  const uncacheable = bundled.filter(f => !runtimeCacheable.test('/' + f) && !precached.includes(f));
  assert.deepStrictEqual(uncacheable, [],
    `These bundled files would never be cached, so they are unavailable offline: ${uncacheable.join(', ')}. ` +
    `Add them to ASSETS in sw.js or make RUNTIME_CACHEABLE cover them.`);
});

test('Rule 2: sw.js precaches only files that exist', () => {
  const precached = [...swJs.matchAll(/'\.\/([^']+)'/g)].map(m => m[1]).filter(Boolean);
  const missing = precached.filter(f => !fs.existsSync(path.join(ROOT, f)));
  assert.deepStrictEqual(missing, [],
    `sw.js precaches file(s) that do not exist: ${missing.join(', ')}`);
});

test('Rule 3: the zoom hot path never forces a synchronous layout', () => {
  // getBoundingClientRect() inside these forces a layout. It used to sit inside a per-element d3
  // accessor in applyDotR, costing ~36 forced layouts on every animation frame of a pinch and
  // freezing zoom on iOS. The measurement lives in the commit that fixed it.
  for (const fn of ['applyDotR', 'dotR', 'hitR']) {
    const body = functionBody(appJs, fn);
    assert.ok(!body.includes('getBoundingClientRect'),
      `${fn}() calls getBoundingClientRect(), which forces a synchronous layout on every zoom ` +
      `frame. Use the cached _sc value instead (refreshed by the ResizeObserver).`);
  }
});

test('every country in the flag quiz has a bundled flag image', () => {
  // A missing file here shows up as a blank card mid-quiz, which is easy to ship and easy to miss.
  const m = appJs.match(/const ISO2=\{([^}]+)\}/);
  assert.ok(m, 'ISO2 map not found in app.js');
  const codes = [...new Set(m[1].split(',').map(p => p.split(':')[1]).filter(Boolean)
    .map(s => s.trim().replace(/'/g, '')))];

  const missing = codes.filter(c => !fs.existsSync(path.join(ROOT, `data/flags/w320/${c}.png`)));
  assert.deepStrictEqual(missing, [],
    `No flag image for: ${missing.join(', ')}. Fetch it into data/flags/w320/ and regenerate ` +
    `data/flags/index.json.`);
});

test('the flag index the service worker precaches from is in sync with the files', () => {
  const idx = JSON.parse(read('data/flags/index.json'));
  for (const [size, codes] of [['w320', idx.w320], ['h20', idx.h20]]) {
    const onDisk = fs.readdirSync(path.join(ROOT, 'data/flags', size))
      .filter(f => f.endsWith('.png')).map(f => f.replace('.png', '')).sort();
    assert.deepStrictEqual([...codes].sort(), onDisk,
      `data/flags/index.json disagrees with data/flags/${size}/ — regenerate it, or the service ` +
      `worker will precache a file that is gone (or miss one that is new).`);
  }
  assert.ok(swJs.includes('data/flags/index.json'),
    'sw.js must read the flag index, otherwise the flag quiz will not work offline');
});

test('Rule 4: BUILD_ID is present and looks like a version', () => {
  const m = appJs.match(/const BUILD_ID\s*=\s*'([^']+)'/);
  assert.ok(m, 'BUILD_ID not found at the top of app.js — it is what tells you whether a change is live.');
  assert.match(m[1], /\d{4}-\d{2}-\d{2}/, `BUILD_ID "${m[1]}" should contain a date`);
  assert.ok(indexHtml.includes('build-stamp'), 'index.html must keep the build-stamp element that shows BUILD_ID');
});
