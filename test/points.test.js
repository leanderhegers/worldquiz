// Punkte pro Frage im Challenge-/Duell-Modus: 100 Punkte, ab 3 s minus 2 pro Sekunde,
// Hinweis / falsches Ziel minus 30 % vom aktuellen Stand, Überspringen = 0.
const { test } = require('node:test');
const assert = require('node:assert');
const vm = require('node:vm');
const { loadApp } = require('./helpers/load-app.js');

function setup(ageMs) {
  const app = loadApp(['_qNew', '_qPts', '_qPenalty', '_qZero', '_challengeScore']);
  vm.runInContext('_challenge={pos:0,firstTry:0,total:10,pts:0}', app.sandbox);
  app._qNew();
  const age = ms => vm.runInContext(`_challenge.qp.t0-=${ms};_challenge.qp.ts-=${ms};`, app.sandbox);
  if (ageMs) age(ageMs);
  return { ...app, age };
}

test('die ersten 3 Sekunden sind frei, danach minus 2 Punkte pro Sekunde', () => {
  assert.strictEqual(Math.round(setup(0)._qPts()), 100);
  assert.strictEqual(Math.round(setup(3000)._qPts()), 100);
  assert.strictEqual(Math.round(setup(13000)._qPts()), 80);
  assert.strictEqual(Math.round(setup(60000)._qPts()), 0);
});

test('ein Fehler nimmt 30 % der aktuellen Punkte', () => {
  const s = setup(13000);            // 80 Punkte
  s._qPenalty();
  assert.strictEqual(Math.round(s._qPts()), 56);
  s._qPenalty();
  assert.strictEqual(Math.round(s._qPts()), 39);
});

test('Überspringen und Flagge malen: keine Zeitpunkte', () => {
  const s = setup(0);
  s._qZero();
  assert.strictEqual(s._qPts(), 0);
});

test('Gesamtwertung = Summe der Fragen plus Flaggen-Prozent', () => {
  assert.strictEqual(setup(0)._challengeScore({ pts: 540, extraPts: 62 }), 602);
  assert.strictEqual(setup(0)._challengeScore({ pts: 0 }), 0);
});
