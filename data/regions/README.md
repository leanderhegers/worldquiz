# Region quiz datasets

All of these are bundled rather than fetched at runtime — see rule 1 in `CLAUDE.md`.

| File | Regions | Source |
|---|---|---|
| `germany.json` | 16 Bundesländer | [AliceWi/TopoJSON-Germany](https://github.com/AliceWi/TopoJSON-Germany) (TopoJSON, object `states`) |
| `us-states-10m.json` | 50 states | [us-atlas](https://github.com/topojson/us-atlas) (TopoJSON, object `states`). DC is in the file but filtered out at runtime — at this map scale it's a sliver invisible next to Virginia/Maryland. |
| `france-regions.geojson` | 13 régions | [gregoiredavid/france-geojson](https://github.com/gregoiredavid/france-geojson) |
| `italy.geojson` | 20 regioni | Natural Earth admin-1, dissolved |
| `spain.geojson` | 19 comunidades | Natural Earth admin-1, dissolved |
| `austria.geojson` | 9 Bundesländer | Natural Earth admin-1, full 10m detail (not simplified — see below) |
| `japan.geojson` | 47 prefectures | Natural Earth admin-1 |

## Regenerating the Natural Earth ones

Natural Earth's admin-1 layer is the *province* level, which is the right granularity for Japan
and Austria but far too fine for Italy (110 provinces) and Spain (52). For those two the
provinces are dissolved on the `region` attribute, which holds the level players actually learn:
Italy's 20 regions and Spain's 17 autonomous communities plus Ceuta and Melilla.

```bash
curl -sL -o adm1.zip https://naciscdn.org/naturalearth/10m/cultural/ne_10m_admin_1_states_provinces.zip
unzip -oq adm1.zip -d adm1
SHP=adm1/ne_10m_admin_1_states_provinces.shp

npx mapshaper $SHP -filter "admin==='Japan'"   -filter-fields name -simplify 50% keep-shapes -o japan.geojson
npx mapshaper $SHP -filter "admin==='Austria'" -filter-fields name -o austria.geojson
npx mapshaper $SHP -filter "admin==='Spain' && region!=='Ceuta' && region!=='Melilla'" -dissolve region -each 'name=region' -filter-fields name -simplify 50% keep-shapes -o spain.geojson
npx mapshaper $SHP -filter "admin==='Italy'" -dissolve region -each 'name=region' -filter-fields name -simplify 50% keep-shapes -o italy.geojson
```

`-simplify 12%` (the original recipe) was too aggressive — it left these four visibly blockier
than the hand-authored Germany/France datasets. 50% keeps enough of Natural Earth's original 10m
detail to look sharp at the quiz's render size while still keeping file sizes reasonable;
`keep-shapes` stops small regions from being simplified into a null geometry.

Austria is the one exception: no `-simplify` at all, i.e. full 10m detail. Its raw admin-1 data
is small to begin with (9 simple, landlocked Bundesländer — no coastline, no islands), so even at
50% it looked noticeably softer than it needed to; skipping simplification entirely only costs
~50 KB more (98 KB vs. 50 KB) and there was no size problem to solve for this one. This 50%
default is not meant to be re-derived per country by a formula — see the discussion in the git
history around this commit for why a "bigger input → simplify harder" rule was considered and
rejected: raw vertex count doesn't distinguish redundant points from ones that carry real shape
information (many small islands, fjords), so a country added later with genuinely complex
geometry could end up silently blockier under an automatic rule. Eyeball each new country's
render at 50% first, and only back off the percentage (per-country, not via a formula) if it
still looks soft, the same way this file was.

Spain additionally excludes Ceuta and Melilla via the filter above: they are autonomous
*cities*, and at ~12–19 km² they would be simplified away to a null geometry, which would leave
the quiz asking for something that cannot be drawn or clicked.

### Then reverse the ring winding — this is not optional

mapshaper emits RFC 7946 winding (counterclockwise exterior rings). **d3-geo predates RFC 7946
and needs the opposite**: exterior rings clockwise in lon/lat order. Skip this and d3 treats
every polygon as covering the whole sphere, so the country renders as one filled rectangle —
a total but completely silent failure. `d3.geoArea()` over 2π (≈6.28 steradians) is the tell.

```js
// for each file: reverse every ring of every polygon
for (const feat of d.features) {
  if (!feat.geometry) continue;
  const polys = feat.geometry.type === 'Polygon'
    ? [feat.geometry.coordinates] : feat.geometry.coordinates;
  for (const p of polys) for (const ring of p) ring.reverse();
}
```

Spain and Japan also have a `fitFilter` in `REGION_QUIZZES` (app.js) that excludes Canarias /
Okinawa from the map's fit-extent calculation — those outlying islands would otherwise shrink
the mainland down to a fraction of the map. The islands still render and are still valid quiz
targets; only the auto-zoom ignores them.

Finally rename the handful of entries where Natural Earth mixes English names or abbreviations
into an otherwise native-language set, so each quiz stays in one language as the German and
French ones do:

- Spain: `Canary Is.` → `Canarias`, `Foral de Navarra` → `Navarra`, `Valenciana` → `Comunidad Valenciana`
- Italy: `Apulia` → `Puglia`, `Sicily` → `Sicilia`

Adding or changing any file here also means bumping `CACHE_NAME` in `sw.js`; data is served
cache-first, so existing installs would otherwise keep the old version indefinitely.

`test/data.test.js` checks every dataset against the region count declared in `REGION_QUIZZES`,
so a bad regeneration fails the suite rather than shipping a quiz that runs short.
