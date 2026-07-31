# admin1-borders-10m.json

Worldwide state/province (admin-1) boundary lines, purely decorative — orientation help for
placing a pin precisely in Drop-a-Pin, faded in at strong zoom (see `applyDotR()` in `app.js`).
Not a quiz target and not clickable, so unlike the region-quiz datasets in `data/regions/` it
carries no `name`/`admin` properties, no ring-winding fix (only ever stroked, never filled — see
`data/regions/README.md` for why winding matters for fills but not for a mesh-drawn outline), and
no per-country dissolve. It's rendered at runtime as a `topojson.mesh(...)`, exactly like the
existing country-border layer (`borderMesh` in `renderMap()`).

Source: Natural Earth's `ne_10m_admin_1_states_provinces` (10m cultural, the same layer the
region-quiz per-country files in `data/regions/` are built from).

## Regenerating

```bash
curl -sL -o adm1.zip https://naciscdn.org/naturalearth/10m/cultural/ne_10m_admin_1_states_provinces.zip
unzip -oq adm1.zip -d adm1
npx mapshaper adm1/ne_10m_admin_1_states_provinces.shp name=admin1 \
  -filter-fields "" -simplify 8% keep-shapes \
  -o format=topojson admin1-borders-10m.json
```

`-simplify 8%` (rougher than the region quiz's 50%) is deliberate: this layer is a faint reference
overlay shown small and zoomed-in, not something a player has to trace precisely, so the extra
detail from a gentler simplification wouldn't be visible — it would only cost download size
(~4600 polygons worldwide vs. a handful of regions per country file).

Not in `sw.js`'s precache `ASSETS` list (it's pin-mode-only and ~1.2 MB) — `RUNTIME_CACHEABLE`
picks it up on first fetch instead, same as `countries-10m.json` for the outline quiz. Adding or
regenerating this file still means bumping `CACHE_NAME`, same as any other `data/` change.
