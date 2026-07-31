# ne_10m_mountain_ranges.geojson

Mountain range outlines for the mountain quiz's "Gebirgszüge" mode — area click targets, same
shape as the region quiz's country files. `{name_de, name_en}` per range.

Source: Natural Earth's `ne_10m_geography_regions_polys`, filtered to `FEATURECLA==='Range/mtn'`.
These are Natural Earth's own cartographer-drawn approximate range boundaries — real mountain
ranges have no official, universally-agreed border (where the Alps end and the Apennines begin is
inherently fuzzy), so "approximate but from a real source" is the ceiling here, not a corner cut
for this project. 222 ranges, covering every major world range (Alps, Andes, Himalayas, Rocky
Mountains, Ural, Caucasus, Appalachians, Pyrenees, Carpathians, Atlas, …) down to smaller named
regional ones.

## Regenerating

```bash
curl -sL -o regions_polys.geojson https://raw.githubusercontent.com/nvkelso/natural-earth-vector/master/geojson/ne_10m_geography_regions_polys.geojson
npx mapshaper regions_polys.geojson -filter "FEATURECLA==='Range/mtn'" -filter-fields NAME_EN,NAME_DE \
  -simplify 15% keep-shapes -o format=geojson ranges_raw.geojson
```

Then reverse ring winding for d3-geo (see `data/regions/README.md` for why) and lowercase the
field names to match the rest of this codebase's data files:

```js
const fs = require('fs');
const d = JSON.parse(fs.readFileSync('ranges_raw.geojson', 'utf8'));
for (const feat of d.features) {
  if (!feat.geometry) continue;
  const polys = feat.geometry.type === 'Polygon' ? [feat.geometry.coordinates] : feat.geometry.coordinates;
  for (const p of polys) for (const ring of p) ring.reverse();
  feat.properties = { name_en: feat.properties.NAME_EN, name_de: feat.properties.NAME_DE };
}
fs.writeFileSync('ne_10m_mountain_ranges.geojson', JSON.stringify(d));
```

`-simplify` reports several hundred self-intersections it can't repair — pre-existing in Natural
Earth's own source polygons (these are hand-drawn illustrative regions, not topologically
rigorous administrative boundaries like the country/state data), not something introduced here.
Rendered as a fill this doesn't visibly matter; hit-testing was verified against the actual
rendered shapes rather than assumed clean.
