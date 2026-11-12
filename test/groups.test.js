// Prüft die Ländergruppen für "Alle … anklicken" (groups.js): jeder Code muss ein Land auf der Karte sein, jede Frage in allen
// vier Sprachen vorliegen, und eine Gruppe darf kein Land doppelt enthalten.
const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const ROOT = path.join(__dirname, '..');
const read = f => fs.readFileSync(path.join(ROOT, f), 'utf8');

const win = {};
vm.runInContext(read('groups.js'), vm.createContext({ window: win }));
const ctx = vm.createContext({});
vm.runInContext(read('countries.js') + ';this.C=C;this.MICRO=MICROSTATES;', ctx);
const iso2 = JSON.parse(read('app.js').match(/const ISO2=(\{[^}]*\})/)[1].replace(/(\d+):/g, '"$1":').replace(/'/g, '"'));
const known = new Set(Object.values(iso2));
const Q = win.GROUP_Q, CATS = win.GROUP_CATS.map(c => c.key);

test('Ländergruppen: Schlüssel eindeutig, Kategorie gültig, vier Sprachen vorhanden', () => {
  const keys = Q.map(r => r[0]).concat(win.GROUP_NUM.map(r => r[0]));
  assert.strictEqual(new Set(keys).size, keys.length, 'doppelter Schlüssel');
  for (const r of Q.concat(win.GROUP_NUM)) {
    assert.ok(CATS.includes(r[1]), r[0] + ': unbekannte Kategorie ' + r[1]);
    for (let i = 2; i <= 5; i++) assert.ok(r[i] && r[i].length > 5, r[0] + ': Text ' + (i - 1) + ' fehlt');
  }
  win.GROUP_CATS.forEach(c => { assert.strictEqual(c.t.length, 4); assert.strictEqual(c.s.length, 4); });
});

test('Ländergruppen: alle Länder-Codes gibt es auf der Karte, keine Doppelten, mindestens 2 je Gruppe', () => {
  const unknown = [];
  for (const r of Q) {
    const codes = r[6].split(' ');
    assert.strictEqual(new Set(codes).size, codes.length, r[0] + ': doppelter Code');
    assert.ok(codes.length >= 2, r[0] + ': zu klein');
    codes.forEach(c => { if (!known.has(c)) unknown.push(r[0] + ':' + c); });
  }
  // Codes ohne Karten-Land werden im Spiel übersprungen (z. B. Westsahara, Palästina) – hier nur melden, wenn es zu viele sind
  assert.ok(unknown.length <= 3, 'unbekannte Codes: ' + unknown.join(', '));
});

test('Ländergruppen: jede Kategorie hat Fragen', () => {
  for (const c of CATS) assert.ok(Q.concat(win.GROUP_NUM).some(r => r[1] === c), 'leere Kategorie ' + c);
});
