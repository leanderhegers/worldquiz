// Loads app.js in Node so its logic can be unit-tested.
//
// app.js is a browser script: it has no exports, its last line calls renderHome() and friends,
// and it reads `document` and `window` while loading. Rather than restructure the app for
// testability (a large, risky change), this provides just enough of a fake browser for the file
// to evaluate, after which every top-level function and constant is available for testing.
//
// Only load-time needs are stubbed. Anything that actually draws the map (renderMap and the d3
// calls inside it) is out of reach here and is not what these tests target.
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const ROOT = path.join(__dirname, '..', '..');

function fakeElement() {
  const el = {
    style: {}, textContent: '', innerHTML: '', value: '', checked: false, className: '',
    dataset: {}, children: [], firstChild: null, parentNode: null,
    clientWidth: 960, clientHeight: 500, scrollTop: 0, offsetWidth: 960, offsetHeight: 500,
    classList: { add() {}, remove() {}, toggle() {}, contains() { return false; } },
    addEventListener() {}, removeEventListener() {}, dispatchEvent() { return true; },
    appendChild(c) { return c; }, removeChild(c) { return c; }, insertBefore(c) { return c; },
    setAttribute() {}, removeAttribute() {}, getAttribute() { return null; },
    remove() {}, focus() {}, blur() {}, click() {}, scrollTo() {}, scrollIntoView() {},
    querySelector() { return fakeElement(); }, querySelectorAll() { return []; },
    getBoundingClientRect() { return { width: 960, height: 500, top: 0, left: 0, right: 960, bottom: 500, x: 0, y: 0 }; }
  };
  return el;
}

function createSandbox() {
  const store = new Map();
  const sandbox = {
    console,
    setTimeout, clearTimeout, setInterval, clearInterval,
    requestAnimationFrame: fn => setTimeout(() => fn(0), 0),
    cancelAnimationFrame: clearTimeout,
    // Every lookup yields a fresh tolerant element, so DOM-touching code at load time is inert
    // instead of throwing on null.
    document: {
      getElementById: () => fakeElement(),
      querySelector: () => fakeElement(),
      querySelectorAll: () => [],
      createElement: () => fakeElement(),
      addEventListener() {}, removeEventListener() {},
      body: fakeElement(), documentElement: fakeElement()
    },
    localStorage: {
      getItem: k => (store.has(k) ? store.get(k) : null),
      setItem: (k, v) => store.set(k, String(v)),
      removeItem: k => store.delete(k),
      clear: () => store.clear()
    },
    navigator: { serviceWorker: { register() { return Promise.resolve(); } }, language: 'de' },
    location: { href: 'http://localhost/', origin: 'http://localhost' },
    fetch: () => Promise.reject(new Error('network disabled in tests')),
    ResizeObserver: class { observe() {} unobserve() {} disconnect() {} },
    // COARSE is derived from this at load time; false = behave like a desktop pointer.
    matchMedia: () => ({ matches: false, addEventListener() {}, removeEventListener() {} })
  };
  sandbox.window = sandbox;
  sandbox.globalThis = sandbox;
  vm.createContext(sandbox);
  return sandbox;
}

/**
 * Evaluates the game's scripts and returns the requested top-level bindings.
 * Names must be listed explicitly because top-level `const`/`function` declarations are scoped
 * to the script and never appear on the sandbox object.
 */
function loadApp(names) {
  const sandbox = createSandbox();
  const src = ['countries.js', 'capitals.js', 'cities.js', 'app.js']
    .map(f => fs.readFileSync(path.join(ROOT, f), 'utf8'))
    .join('\n;\n');
  const bindings = vm.runInContext(
    `${src}\n;({ ${names.join(', ')} })`, sandbox, { filename: 'app-under-test' });
  // Exposed so a test can swap sandbox.setTimeout and assert on scheduled work (e.g. that a
  // correct answer queues the next question) instead of waiting for it in real time.
  Object.defineProperty(bindings, 'sandbox', { value: sandbox, enumerable: false });
  return bindings;
}

module.exports = { loadApp };
