// Integrity checks on the static game data. These files are edited by hand, so a typo or a
// half-finished entry is easy to introduce and produces a broken question ("?" as the answer,
// a flag that never loads) rather than a crash — which means nobody notices until a player does.
const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const ROOT = path.join(__dirname, '..');

// countries.js / capitals.js / cities.js are plain `const X = {...}` data files with no DOM
// access, so they can be evaluated directly to get at the data the game actually ships.
// They must be concatenated into a single script: top-level `const` is scoped to its script and
// never lands on the sandbox object, so loading them separately would leave everything invisible.
const sandbox = {};
vm.createContext(sandbox);
const dataSrc = ['countries.js', 'capitals.js', 'cities.js']
  .map(f => fs.readFileSync(path.join(ROOT, f), 'utf8'))
  .join('\n;\n');
const _data = vm.runInContext(
  `${dataSrc}\n;({ C, MICROSTATES, MS_IDS })`, sandbox, { filename: 'game-data' });
// Values built inside the sandbox belong to a different realm, and assert.deepStrictEqual
// compares prototypes — so even two empty arrays would not match. Copy into host arrays.
const C = _data.C;
const MICROSTATES = Array.from(_data.MICROSTATES);
const MS_IDS = _data.MS_IDS;
const appJs = fs.readFileSync(path.join(ROOT, 'app.js'), 'utf8');

test('every country has a German and an English name plus a continent', () => {
  const CONTINENTS = new Set(['EU', 'AF', 'AS', 'NA', 'SA', 'OC']);
  const broken = Object.entries(C)
    .filter(([, v]) => !v.de || !v.en || !CONTINENTS.has(v.c))
    .map(([id, v]) => `${id} (${v.de || '?'})`);
  assert.deepStrictEqual(broken, [], `Countries with a missing name or bad continent: ${broken.join(', ')}`);
});

test('country ids are numeric and unique', () => {
  const ids = Object.keys(C);
  const nonNumeric = ids.filter(id => !/^\d+$/.test(id));
  assert.deepStrictEqual(nonNumeric, [], `Non-numeric country ids: ${nonNumeric.join(', ')}`);
  assert.strictEqual(new Set(ids).size, ids.length, 'duplicate country id');
});

test('every microstate dot points at a real country and a plausible coordinate', () => {
  const unknown = MICROSTATES.filter(m => !C[m.id]).map(m => m.id);
  assert.deepStrictEqual(unknown, [], `Microstate dots for unknown country ids: ${unknown.join(', ')}`);

  const offMap = MICROSTATES
    .filter(m => !(m.lon >= -180 && m.lon <= 180 && m.lat >= -90 && m.lat <= 90))
    .map(m => `${C[m.id].de} (${m.lon}/${m.lat})`);
  assert.deepStrictEqual(offMap, [], `Microstates with impossible coordinates: ${offMap.join(', ')}`);

  assert.strictEqual(MS_IDS.size, MICROSTATES.length, 'MS_IDS is out of sync with MICROSTATES');
});

test('flag quiz difficulty buckets are disjoint and reference real countries', () => {
  const buckets = {};
  for (const name of ['FLAG_BEGINNER', 'FLAG_EASY', 'FLAG_MEDIUM']) {
    const m = appJs.match(new RegExp(`const ${name}=new Set\\(\\[([^\\]]+)\\]\\)`));
    assert.ok(m, `${name} not found in app.js`);
    buckets[name] = m[1].split(',').map(s => Number(s.trim()));
  }

  for (const [name, ids] of Object.entries(buckets)) {
    const unknown = ids.filter(id => !C[id]);
    assert.deepStrictEqual(unknown, [], `${name} references unknown country ids: ${unknown.join(', ')}`);
  }

  // A country in two buckets would be asked at two different difficulties.
  const names = Object.keys(buckets);
  for (let i = 0; i < names.length; i++) {
    for (let j = i + 1; j < names.length; j++) {
      const overlap = buckets[names[i]].filter(id => buckets[names[j]].includes(id));
      assert.deepStrictEqual(overlap, [],
        `${names[i]} and ${names[j]} both contain: ${overlap.map(id => C[id].de).join(', ')}`);
    }
  }
});

test('the ISO2 flag codes cover the countries the flag quiz can ask for', () => {
  const m = appJs.match(/const ISO2=\{([^}]+)\}/);
  assert.ok(m, 'ISO2 map not found in app.js');
  const iso2 = {};
  for (const pair of m[1].split(',')) {
    const [k, v] = pair.split(':');
    if (k && v) iso2[k.trim()] = v.trim().replace(/'/g, '');
  }
  const bad = Object.entries(iso2).filter(([id, code]) => !C[id] || !/^[a-z]{2}$/.test(code));
  assert.deepStrictEqual(bad.map(([id]) => id), [],
    `ISO2 entries with an unknown country or malformed code: ${bad.map(([id, c]) => `${id}=${c}`).join(', ')}`);
});

test('the bundled map data still contains what the quizzes expect', () => {
  const world = JSON.parse(fs.readFileSync(path.join(ROOT, 'data/countries-50m.json'), 'utf8'));
  assert.strictEqual(world.type, 'Topology');
  assert.ok(world.objects.countries.geometries.length > 150,
    `world map has only ${world.objects.countries.geometries.length} countries`);

  const lakes = JSON.parse(fs.readFileSync(path.join(ROOT, 'data/ne_50m_lakes.geojson'), 'utf8'));
  const namedLakes = lakes.features.filter(f => f.properties && f.properties.name).length;
  // The lake quiz's hardest tier offers 321 lakes; fewer named lakes than that means the quiz
  // would silently run short.
  assert.ok(namedLakes >= 321, `only ${namedLakes} named lakes, but the quiz offers up to 321`);

  const rivers = JSON.parse(fs.readFileSync(path.join(ROOT, 'data/ne_50m_rivers_lake_centerlines.geojson'), 'utf8'));
  const namedRivers = rivers.features.filter(f => f.properties && f.properties.name).length;
  assert.ok(namedRivers >= 214, `only ${namedRivers} named rivers, but the quiz offers up to 214`);
});

test('each region quiz dataset exists and has the advertised number of regions', () => {
  const expected = { DE: 16, US: 51, FR: 13 };
  const urls = [...appJs.matchAll(/url:'(data\/regions\/[^']+)'/g)].map(m => m[1]);
  assert.strictEqual(urls.length, 3, `expected 3 region datasets, found ${urls.length}`);

  for (const url of urls) {
    const full = path.join(ROOT, url);
    assert.ok(fs.existsSync(full), `${url} is missing`);
    const d = JSON.parse(fs.readFileSync(full, 'utf8'));
    const count = d.objects
      ? d.objects.states.geometries.length            // TopoJSON (DE, US)
      : d.features.length;                            // GeoJSON (FR)
    assert.ok(count > 0, `${url} contains no regions`);
  }

  // Counts shown on the menu cards must match what the data can actually deliver.
  for (const [key, n] of Object.entries(expected)) {
    const m = appJs.match(new RegExp(`${key}:\\{[\\s\\S]*?count:(\\d+)`));
    assert.ok(m, `region quiz ${key} not found`);
    assert.strictEqual(Number(m[1]), n, `region quiz ${key} advertises ${m[1]} regions, expected ${n}`);
  }
});
