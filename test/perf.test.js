// Wächter für die Leistung. Ruckler und Aufhänger fallen auf einem schnellen Entwicklungsrechner kaum auf, auf einem Handy
// aber sofort – deshalb sichern diese Tests die Stellen ab, an denen sie entstehen:
//   • Der Kartenaufbau (renderMap) darf nichts Teures bei jedem Aufruf neu berechnen (Pfade, Netze, zusammengelegte Gebiete).
//   • Die Vereinfachungen (Detailstufen der flachen Karten, Globus) müssen innerhalb ihrer Toleranz bleiben.
// Die eigentliche Messung auf dem Gerät macht perf.js (Seite mit ?perf öffnen).
const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const ROOT = path.join(__dirname, '..');
const read = f => fs.readFileSync(path.join(ROOT, f), 'utf8');
const appJs = read('app.js');

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

/** Lädt eine der Browser-Dateien (IIFE, hängt sich an window) in eine leere Umgebung und gibt window zurück. */
function loadBrowserFile(file) {
  const window = {};
  const ctx = vm.createContext({ window, document: {}, performance: { now: () => 0 }, setTimeout, clearTimeout, console });
  vm.runInContext(read(file), ctx, { filename: file });
  return window;
}

test('Leistung: renderMap berechnet Pfade der flachen Karten nicht bei jedem Aufbau neu', () => {
  const body = functionBody(appJs, 'renderMap');
  assert.ok(body.includes('_cachedGeoPath(projection,proj)'),
    'renderMap muss die Pfade über _cachedGeoPath holen (sonst ~3 MB Pfaddaten je Spielstart: PC ~200 ms, Handy ~1 s)');
  // topojson.feature/mesh/merge liefern jedes Mal neue Objekte: nur innerhalb von _memo(…, ()=>…) erlaubt
  const uncached = [...body.matchAll(/topojson\.(feature|mesh|merge)\(/g)]
    .filter(m => !/\(\)=>\s*$/.test(body.slice(Math.max(0, m.index - 6), m.index)));
  assert.deepStrictEqual(uncached.map(m => m[0]), [],
    'topojson.feature/mesh/merge in renderMap nur über _memo(world,key,()=>…) aufrufen – sonst gehen alle Zwischenspeicher verloren');
  assert.ok(!/\(\{\.\.\.f,_i:i\}\)/.test(body.replace(/game\.(city|mountain)Features\.map\([^)]*\)\)/g, '')),
    'Index-Kopien von Flüssen/Seen/Gebirgen über _withIdx bilden (stabile Objekte), nicht mit ({...f,_i:i})');
});

test('Leistung: der Globus baut seine Pfade mit der schnellen Projektion', () => {
  assert.ok(functionBody(appJs, 'renderMap').includes('window.Globe.pathString(d)'),
    'Globus-Pfade müssen über Globe.pathString kommen (d3.geoPath brauchte 60–120 ms je Neuaufbau = Einfrieren nach jeder Geste)');
});

test('Leistung: die Messroutine perf.js wird nur auf Wunsch geladen', () => {
  assert.ok(fs.existsSync(path.join(ROOT, 'perf.js')), 'perf.js fehlt');
  assert.ok(!read('index.html').includes('perf.js'), 'perf.js darf nicht fest in index.html stehen');
  assert.ok(!read('sw.js').includes('perf.js'), 'perf.js gehört nicht in den Offline-Cache');
  assert.match(appJs, /if\(\/\[\?&\]perf[^\n]*\.test\(location\.search\)\)\{[^\n]*perf\.js/, 'app.js lädt perf.js nur bei ?perf');
});

test('Detailstufen: Pfade werden richtig zerlegt', () => {
  const { parseSubpaths } = loadBrowserFile('canvas-map.js').CanvasMap._test;
  const subs = parseSubpaths('M1.5,2L3,-4.25L5e1,6ZM7,8L9,10');
  assert.strictEqual(subs.length, 2);
  assert.deepStrictEqual(Array.from(subs[0].x), [1.5, 2, 3, -4.25, 50, 6]);
  assert.strictEqual(subs[0].closed, true);
  assert.deepStrictEqual(Array.from(subs[1].x), [7, 8, 9, 10]);
  assert.strictEqual(subs[1].closed, false);
  // Bögen oder andere Befehle: keine Detailstufen (voller Pfad wird gezeichnet)
  assert.strictEqual(parseSubpaths('M0,0A5,5,0,1,1,10,0Z'), null);
  assert.strictEqual(parseSubpaths('M0,0H10V10Z'), null);
});

test('Detailstufen: die Vereinfachung bleibt innerhalb der Toleranz und behält die Endpunkte', () => {
  const { dpFlat } = loadBrowserFile('canvas-map.js').CanvasMap._test;
  // Zickzack-Linie mit kleiner Auslenkung (0.05) und einem echten Knick (Höhe 3)
  const x = [];
  for (let i = 0; i <= 200; i++) x.push(i * 0.1, (i % 2 ? 0.05 : 0) + (i === 100 ? 3 : 0));
  const tol = 0.25, out = dpFlat(x, tol);
  assert.ok(out.length < x.length / 10, 'kleine Auslenkungen müssen verschwinden');
  assert.deepStrictEqual(Array.from(out.slice(0, 2)), x.slice(0, 2));
  assert.deepStrictEqual(Array.from(out.slice(-2)), x.slice(-2));
  // jeder Originalpunkt liegt höchstens tol von der vereinfachten Linie entfernt
  const distToOut = (px, py) => {
    let best = Infinity;
    for (let i = 0; i + 3 < out.length; i += 2) {
      const ax = out[i], ay = out[i + 1], dx = out[i + 2] - ax, dy = out[i + 3] - ay, l2 = dx * dx + dy * dy;
      let u = l2 ? ((px - ax) * dx + (py - ay) * dy) / l2 : 0; u = Math.max(0, Math.min(1, u));
      best = Math.min(best, Math.hypot(px - ax - u * dx, py - ay - u * dy));
    }
    return best;
  };
  for (let i = 0; i < x.length; i += 2) assert.ok(distToOut(x[i], x[i + 1]) <= tol + 1e-9, 'Punkt ' + i / 2 + ' weicht zu weit ab');
});

test('Detailstufen: gewählt wird die gröbste Stufe unter einem halben Gerätepixel', () => {
  const { lodLevel, LOD_TOL } = loadBrowserFile('canvas-map.js').CanvasMap._test;
  for (const f of [0.4, 0.8, 1.5, 3, 6, 9]) {
    const lv = lodLevel(f);
    assert.ok(lv >= 0, 'Maßstab ' + f + ' braucht eine Detailstufe');
    assert.ok(LOD_TOL[lv] * f <= 0.5, 'Abweichung über einem halben Pixel bei Maßstab ' + f);
  }
  assert.strictEqual(lodLevel(40), -1, 'stark hineingezoomt: voller Pfad');
});

test('Globus: lange gerade Grenzen werden unterteilt, der Sprung über die Datumsgrenze nicht', () => {
  const { densify } = loadBrowserFile('globe.js').Globe._test;
  const out = densify([[-125, 49], [-95, 49]]); // 49. Breitengrad: 30° ohne Zwischenpunkt
  assert.ok(out.length >= 11);
  for (let i = 1; i < out.length; i++) {
    assert.ok(Math.abs(out[i][0] - out[i - 1][0]) <= 3 + 1e-9);
    assert.strictEqual(out[i][1], 49);
  }
  const seam = [[179, -80], [-179, -80]];
  assert.deepStrictEqual(densify(seam), seam);
  const short = [[10, 50], [11, 51], [12, 50]];
  assert.strictEqual(densify(short), short, 'kurze Stücke bleiben unverändert (dasselbe Feld)');
});
