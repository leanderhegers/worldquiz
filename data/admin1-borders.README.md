# admin1-borders-10m.json

Worldwide state/province (admin-1) boundary lines, purely decorative — orientation help for
placing a pin precisely in Drop-a-Pin, faded in only near the top of the zoom range (see
`applyDotR()` in `app.js`). Not a quiz target and not clickable, so unlike the region-quiz
datasets in `data/regions/` it carries no ring-winding fix (only ever stroked, never filled — see
`data/regions/README.md` for why winding matters for fills but not for a mesh-drawn outline) and
no per-country dissolve of the actual geometry.

Source: Natural Earth's `ne_10m_admin_1_states_provinces` (10m cultural, the same layer the
region-quiz per-country files in `data/regions/` are built from) — **all ~4600 raw polygons are
kept**, not simplified down to one polygon per region.

## Why raw polygons, and what `grp` is

Natural Earth's admin-1 layer is wildly inconsistent in granularity: Germany is correctly 16
Bundesländer, but France is 101 *départements* and Slovenia is 193 municipalities — the féature
that's actually one administrative level below what a "state border" overlay should show. There's
no single field that marks the right level consistently worldwide, but most (not all) of these
over-fine countries also carry a `region` property naming their real coarser region.

So every feature keeps its original geometry, and gets exactly one derived property, `grp`
(`"<country>||<label>"`), and `topojson.mesh()` at runtime only draws a line where the two
polygons on either side have a *different* `grp` — this suppresses internal borders (e.g. between
two French départements in the same région) without needing an actual geometry union, so there's
no risk of a mis-dissolve leaving a gap or a sliver.

`label` is picked per **country** (`admin`), not per feature — either the whole country dissolves
or none of it does, so a partially-fixed country never happens:

- `region` if the country's raw feature count is > 40 **and** dissolving on `region` would cut
  that count to ≤ 40% of the original (catches the genuinely over-fine countries: France 101→18,
  Slovenia 193→12, Italy 110→20, UK 232→16, Spain 52→19, Japan 47→11, …)
- `name` (the raw, undissolved admin-1 unit) for everything else — including the USA, which is
  explicitly excluded even though it clears the same bar (51→4): its `region` field holds Census
  regions (West/Midwest/Northeast/South), not a real subdivision, and collapsing all 50 states
  into 4 blobs would be useless as a pin-placement aid for the best-known federal country in the
  quiz. If another country turns out to have the same problem, add it to `KEEP_NATIVE` in the
  regeneration script below.

## Regenerating

```bash
curl -sL -o adm1.zip https://naciscdn.org/naturalearth/10m/cultural/ne_10m_admin_1_states_provinces.zip
unzip -oq adm1.zip -d adm1
npx mapshaper adm1/ne_10m_admin_1_states_provinces.shp -o format=geojson full_props.geojson
```

```js
// compute grp, then hand off to mapshaper for simplify + topojson conversion
const fs = require('fs');
const d = JSON.parse(fs.readFileSync('full_props.geojson', 'utf8'));
const byAdmin = {};
d.features.forEach(f => (byAdmin[f.properties.admin] ??= []).push(f));
const KEEP_NATIVE = new Set(['United States of America']);
Object.entries(byAdmin).forEach(([admin, feats]) => {
  const dissolved = new Set(feats.map(f => f.properties.region || f.properties.name)).size;
  const willDissolve = !KEEP_NATIVE.has(admin) && feats.length > 40 && dissolved <= feats.length * 0.4;
  feats.forEach(f => {
    const label = willDissolve ? (f.properties.region || f.properties.name) : f.properties.name;
    f.properties = { grp: admin + '||' + label };
  });
});
fs.writeFileSync('admin1_grp.geojson', JSON.stringify(d));
```

```bash
npx mapshaper admin1_grp.geojson name=admin1 -simplify 8% keep-shapes -o format=topojson admin1-borders-10m.json
```

`-simplify 8%` (rougher than the region quiz's 50%) is deliberate: this layer is a faint reference
overlay shown small at deep zoom, not something a player has to trace precisely, so a gentler
simplification wouldn't be visible — it would only cost download size. Simplifying doesn't touch
which polygons get merged (that's `grp`, applied first and separately), so a small border sliver
from simplification can never accidentally split a region that should read as one.

Not in `sw.js`'s precache `ASSETS` list (it's pin-mode-only and ~1.4 MB) — `RUNTIME_CACHEABLE`
picks it up on first fetch instead, same as `countries-10m.json` for the outline quiz. Adding or
regenerating this file still means bumping `CACHE_NAME`, same as any other `data/` change.
