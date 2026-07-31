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

test('the population-based difficulty tiers partition all 197 countries exactly once', () => {
  const m = appJs.match(/const DIFFICULTY_TIERS=\[([\s\S]*?)\n\];/);
  assert.ok(m, 'DIFFICULTY_TIERS not found in app.js');
  const tiers = [...m[1].matchAll(/\[([^\]]+)\]/g)].map(t => t[1].split(',').map(Number));
  assert.strictEqual(tiers.length, 5, `expected 5 difficulty tiers, found ${tiers.length}`);

  const all = tiers.flat();
  const unknown = all.filter(id => !C[id]);
  assert.deepStrictEqual(unknown, [], `DIFFICULTY_TIERS references unknown country ids: ${unknown.join(', ')}`);

  const countryIds = Object.keys(C).map(Number);
  const missing = countryIds.filter(id => !all.includes(id));
  assert.deepStrictEqual(missing, [],
    `these countries appear in no difficulty tier: ${missing.map(id => C[id].de).join(', ')}`);

  assert.strictEqual(new Set(all).size, all.length, 'a country appears in more than one difficulty tier');
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

test('the curated river fame list has no duplicates and full German names', () => {
  const fameM = appJs.match(/const RIVER_FAME_ORDER=\[([\s\S]*?)\];/);
  assert.ok(fameM, 'RIVER_FAME_ORDER not found in app.js');
  const fame = [...fameM[1].matchAll(/'([^']+)'/g)].map(m => m[1]);
  assert.ok(fame.length >= 30, `expected a substantial curated list, found ${fame.length}`);
  assert.strictEqual(new Set(fame).size, fame.length, 'RIVER_FAME_ORDER has a duplicate entry');

  const deM = appJs.match(/const RIVER_NAME_DE=\{([\s\S]*?)\n\};/);
  assert.ok(deM, 'RIVER_NAME_DE not found in app.js');
  // Keys are bare identifiers ("Nile:") or quoted ("'Rio Grande':") — both forms appear.
  const deKeys = [...deM[1].matchAll(/(?:^|,)\s*(?:'([^']+)'|(\w[\w ]*)):/g)].map(m => m[1] ?? m[2]);
  const missingDe = fame.filter(name => !deKeys.includes(name));
  assert.deepStrictEqual(missingDe, [], `RIVER_FAME_ORDER entries with no RIVER_NAME_DE translation: ${missingDe.join(', ')}`);
});

test('mountain range outlines are wound the way d3-geo expects', () => {
  // Same requirement as data/regions/ (see the test below) — d3-geo needs clockwise exterior
  // rings, the opposite of mapshaper/RFC 7946 output. This file lives outside data/regions/
  // (it's not a per-country region quiz dataset), so it needs its own check.
  const d = JSON.parse(fs.readFileSync(path.join(ROOT, 'data/ne_10m_mountain_ranges.geojson'), 'utf8'));
  let counterclockwise = 0;
  for (const feat of d.features) {
    if (!feat.geometry) continue;
    const polys = feat.geometry.type === 'Polygon' ? [feat.geometry.coordinates] : feat.geometry.coordinates;
    for (const rings of polys) {
      const r = rings[0];
      let a = 0;
      for (let i = 0; i < r.length - 1; i++) a += r[i][0] * r[i + 1][1] - r[i + 1][0] * r[i][1];
      if (a > 0) counterclockwise++;
    }
  }
  assert.strictEqual(counterclockwise, 0,
    `${counterclockwise} exterior ring(s) in ne_10m_mountain_ranges.geojson run counterclockwise`);
});

test('the curated mountain range fame list has no duplicates and matches real ranges', () => {
  const fameM = appJs.match(/const RANGE_FAME_ORDER=\[([\s\S]*?)\];/);
  assert.ok(fameM, 'RANGE_FAME_ORDER not found in app.js');
  const fame = [...fameM[1].matchAll(/'([^']+)'/g)].map(m => m[1]);
  assert.ok(fame.length >= 15, `expected a substantial curated list, found ${fame.length}`);
  assert.strictEqual(new Set(fame).size, fame.length, 'RANGE_FAME_ORDER has a duplicate entry');

  const ranges = JSON.parse(fs.readFileSync(path.join(ROOT, 'data/ne_10m_mountain_ranges.geojson'), 'utf8'));
  const realNames = new Set(ranges.features.map(f => f.properties.name_en));
  const missing = fame.filter(name => !realNames.has(name));
  assert.deepStrictEqual(missing, [], `RANGE_FAME_ORDER entries not found in the range data: ${missing.join(', ')}`);
});

test('the curated mountain peak fame list has no duplicates and matches real peaks', () => {
  const fameM = appJs.match(/const MOUNTAIN_FAME_ORDER=\[([\s\S]*?)\];/);
  assert.ok(fameM, 'MOUNTAIN_FAME_ORDER not found in app.js');
  const fame = [...fameM[1].matchAll(/'([^']+)'/g)].map(m => m[1]);
  assert.ok(fame.length >= 10, `expected a substantial curated list, found ${fame.length}`);
  assert.strictEqual(new Set(fame).size, fame.length, 'MOUNTAIN_FAME_ORDER has a duplicate entry');

  const mountains = JSON.parse(fs.readFileSync(path.join(ROOT, 'data/mountains.json'), 'utf8'));
  const realNames = new Set(mountains.map(m => m.name_en));
  const missing = fame.filter(name => !realNames.has(name));
  assert.deepStrictEqual(missing, [], `MOUNTAIN_FAME_ORDER entries not found in the mountain data: ${missing.join(', ')}`);

  const missingDe = mountains.filter(m => !m.name_de);
  assert.deepStrictEqual(missingDe.map(m => m.name_en), [], 'mountains.json entries with no German name');
});

test('every country has a population figure for the population quiz', () => {
  const pop = JSON.parse(fs.readFileSync(path.join(ROOT, 'data/population.json'), 'utf8'));
  const missing = Object.keys(C).filter(id => pop[id] == null);
  assert.deepStrictEqual(missing, [],
    `Countries with no population entry (startPopGame() can't build a round for them): ${missing.map(id => `${id} (${C[id].de})`).join(', ')}`);
  const nonPositive = Object.entries(pop).filter(([, v]) => !(v > 0));
  assert.deepStrictEqual(nonPositive, [], `Non-positive population values: ${JSON.stringify(nonPositive)}`);
});

test('every region quiz delivers exactly the number of regions it advertises', () => {
  // Driven by REGION_QUIZZES itself, so a newly added quiz is checked automatically. The count
  // is printed on the menu card, and the quiz asks for every feature in the file — if the two
  // disagree the round silently runs short or repeats.
  const block = appJs.match(/const REGION_QUIZZES=\{([\s\S]*?)\n\};/);
  assert.ok(block, 'REGION_QUIZZES not found in app.js');

  // Split into per-quiz chunks on the two-space-indented keys.
  const chunks = block[1].split(/\n  (?=[A-Z]{2}:\{)/).filter(c => /url:/.test(c));
  assert.ok(chunks.length >= 7, `expected at least 7 region quizzes, found ${chunks.length}`);

  for (const chunk of chunks) {
    const key = chunk.match(/^\s*([A-Z]{2}):/)[1];
    const url = chunk.match(/url:'([^']+)'/)[1];
    const declared = Number(chunk.match(/count:(\d+)/)[1]);
    const objectKey = (chunk.match(/objectKey:'([^']+)'/) || [])[1];
    const filtered = /filter:f=>/.test(chunk);

    const full = path.join(ROOT, url);
    assert.ok(fs.existsSync(full), `${key}: ${url} is missing`);
    const d = JSON.parse(fs.readFileSync(full, 'utf8'));
    const features = d.objects ? d.objects[objectKey].geometries : d.features;
    assert.ok(features && features.length > 0, `${key}: ${url} contains no regions`);

    // Quizzes with a filter drop entries at runtime, so the file legitimately holds more.
    if (filtered) {
      assert.ok(features.length >= declared,
        `${key}: file has ${features.length} regions but the quiz advertises ${declared}`);
    } else {
      assert.strictEqual(features.length, declared,
        `${key}: ${url} has ${features.length} regions but the quiz advertises ${declared}`);
    }

    // Every region needs a usable name — it is the question being asked.
    const nameKey = chunk.match(/nameKey:'([^']+)'/)[1];
    const props = d.objects ? features.map(g => g.properties) : features.map(f => f.properties);
    const unnamed = props.filter(p => !p || !p[nameKey]).length;
    assert.strictEqual(unnamed, 0, `${key}: ${unnamed} regions have no "${nameKey}" property`);

    // …and a shape. Simplification can delete a very small region entirely, leaving a feature
    // with null geometry: it draws nothing, so the quiz would ask for something unclickable.
    if (!d.objects) {
      const shapeless = features.filter(f => !f.geometry || !f.geometry.coordinates ||
        !f.geometry.coordinates.length).map(f => f.properties[nameKey]);
      assert.deepStrictEqual(shapeless, [],
        `${key}: these regions have no geometry and could never be answered: ${shapeless.join(', ')}`);
    }
  }
});

test('region outlines are wound the way d3-geo expects', () => {
  // d3-geo predates RFC 7946 and uses the OPPOSITE winding: exterior rings must run clockwise
  // in lon/lat order. mapshaper (and RFC 7946) emit counterclockwise, and d3 then treats each
  // polygon as covering the whole sphere, rendering the country as one filled rectangle.
  // That is a silent, total rendering failure, so it is worth asserting. france-regions.geojson
  // is the reference: it has always rendered correctly and is wound clockwise throughout.
  const dir = path.join(ROOT, 'data/regions');
  const files = fs.readdirSync(dir).filter(f => f.endsWith('.geojson'));
  assert.ok(files.length > 0, 'expected GeoJSON region datasets');

  for (const file of files) {
    const d = JSON.parse(fs.readFileSync(path.join(dir, file), 'utf8'));
    let counterclockwise = 0;
    for (const feat of d.features) {
      if (!feat.geometry) continue;
      const polys = feat.geometry.type === 'Polygon'
        ? [feat.geometry.coordinates] : feat.geometry.coordinates;
      for (const rings of polys) {
        const r = rings[0];
        // Shoelace sum; positive means counterclockwise, which is what d3 cannot use here.
        let a = 0;
        for (let i = 0; i < r.length - 1; i++) a += r[i][0] * r[i + 1][1] - r[i + 1][0] * r[i][1];
        if (a > 0) counterclockwise++;
      }
    }
    assert.strictEqual(counterclockwise, 0,
      `${file}: ${counterclockwise} exterior ring(s) run counterclockwise. d3-geo needs them ` +
      `clockwise — reverse every ring after exporting, or the country renders as a filled box.`);
  }
});
