// Unit tests for the pure logic in app.js, loaded through the fake-browser harness.
const { test } = require('node:test');
const assert = require('node:assert');
const { loadApp } = require('./helpers/load-app.js');

const app = loadApp([
  'norm', 'haversine', 'shuffle', 'eff', 'cn', 'flagIdsForDifficulty',
  'C', 'CAPITALS', 'ISO2', 'FLAG_BEGINNER', 'FLAG_EASY', 'FLAG_MEDIUM'
]);
const { norm, haversine, shuffle, eff, cn, flagIdsForDifficulty, C, CAPITALS, ISO2 } = app;

test('norm() folds the accents players cannot easily type', () => {
  // Typed answers are compared after norm(), so each left-hand side must reduce to something a
  // player can enter on a plain keyboard.
  assert.strictEqual(norm('Ägypten'), 'agypten');
  assert.strictEqual(norm('Österreich'), 'osterreich');
  assert.strictEqual(norm('Curaçao'), 'curacao');
  assert.strictEqual(norm('Côte d`Ivoire'.replace('`', "'")), "cote d'ivoire");
  assert.strictEqual(norm('Łódź'), 'lodz');       // Polish ł has no combining form
  assert.strictEqual(norm('Ørsted'), 'orsted');   // Danish ø likewise
  assert.strictEqual(norm('Æthelred'), 'aethelred');
  assert.strictEqual(norm('Đà Nẵng'), 'da nang');
});

test('norm() is case-insensitive and idempotent', () => {
  assert.strictEqual(norm('DEUTSCHLAND'), norm('deutschland'));
  assert.strictEqual(norm(norm('Ägypten')), norm('Ägypten'));
});

test('every country and capital name reduces to plain ASCII', () => {
  // Data-driven on purpose: adding a country whose name uses a character norm() does not fold
  // would make that answer untypeable, and this catches it without anyone maintaining a list.
  const offenders = [];
  const check = (label, s) => {
    const n = norm(s);
    if (/[^\x20-\x7e]/.test(n)) offenders.push(`${label}: "${s}" -> "${n}"`);
  };
  for (const [id, v] of Object.entries(C)) {
    check(`country ${id} de`, v.de);
    check(`country ${id} en`, v.en);
  }
  for (const [id, v] of Object.entries(CAPITALS)) {
    check(`capital ${id} de`, v.de);
    check(`capital ${id} en`, v.en);
  }
  assert.deepStrictEqual(offenders, [],
    `These names contain characters norm() does not fold, so players cannot type them:\n  ` +
    offenders.join('\n  '));
});

test('haversine() returns real-world distances', () => {
  const km = (a, b) => Math.round(haversine(a[0], a[1], b[0], b[1]));
  const BERLIN = [13.405, 52.52], PARIS = [2.352, 48.857], SYDNEY = [151.209, -33.868];
  assert.ok(Math.abs(km(BERLIN, PARIS) - 878) <= 15, `Berlin-Paris was ${km(BERLIN, PARIS)} km, expected ~878`);
  assert.ok(Math.abs(km(BERLIN, SYDNEY) - 16096) <= 200, `Berlin-Sydney was ${km(BERLIN, SYDNEY)} km, expected ~16096`);
  assert.strictEqual(km(BERLIN, BERLIN), 0);
  // Symmetric, or the pin quiz would score differently depending on argument order.
  assert.strictEqual(km(BERLIN, PARIS), km(PARIS, BERLIN));
});

test('shuffle() keeps every element and leaves the input untouched', () => {
  const input = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];
  const copy = [...input];
  const out = shuffle(input);
  assert.deepStrictEqual(input, copy, 'shuffle() must not mutate its argument');
  assert.strictEqual(out.length, input.length);
  assert.deepStrictEqual([...out].sort((a, b) => a - b), copy, 'shuffle() lost or invented elements');
});

test('shuffle() actually reorders', () => {
  // 20 elements: the odds of an unchanged order by chance are ~1 in 20!, so a failure here means
  // shuffle() is not shuffling rather than bad luck.
  const input = Array.from({ length: 20 }, (_, i) => i);
  const same = Array.from({ length: 5 }, () => shuffle(input))
    .filter(out => out.every((v, i) => v === input[i])).length;
  assert.ok(same < 5, 'shuffle() returned the original order every time');
});

test('eff() resolves ids and cn() names them in the current language', () => {
  // REDIRECTS is only populated while the map renders, so unmapped ids must pass through
  // unchanged rather than becoming undefined.
  assert.strictEqual(eff(276), 276);
  assert.strictEqual(cn(276), 'Deutschland');
  assert.strictEqual(cn(840), 'USA');
  assert.strictEqual(cn(999999), '?', 'unknown ids should degrade to "?" rather than crash');
});

test('flag difficulty tiers partition exactly the countries that have a flag', () => {
  const tiers = ['beginner', 'easy', 'medium', 'hard'].map(d => flagIdsForDifficulty(d));
  const all = new Set(Object.keys(C).map(Number).filter(id => ISO2[id]));

  const union = new Set(tiers.flat());
  assert.strictEqual(union.size, all.size,
    `tiers cover ${union.size} countries but ${all.size} have a flag code`);
  for (const id of all) {
    assert.ok(union.has(id), `${cn(id)} has a flag but appears in no difficulty tier`);
  }
  // No country may appear twice, or it could be asked at two difficulties.
  assert.strictEqual(tiers.flat().length, union.size, 'a country appears in more than one tier');
  for (const t of tiers) assert.ok(t.length > 0, 'a difficulty tier is empty');
});
