# mountains.json

Named individual peaks for the mountain quiz's "Gipfel" mode — point targets, same shape as the
city quiz's dots. `{name_de, name_en, elevation, lon, lat, region}` per peak.

Source: Natural Earth's `ne_10m_geography_regions_elevation_points`, filtered to
`featurecla==='mountain'` (the layer also carries spot elevations, depressions, plateaus, passes
and capes — none of those are a "Gipfel"). Unlike the rivers layer, this one already ships a real
`name_de` field, so no hand-translation was needed.

## Regenerating

```bash
curl -sL -o elevation_points.geojson https://raw.githubusercontent.com/nvkelso/natural-earth-vector/master/geojson/ne_10m_geography_regions_elevation_points.geojson
```

```js
const fs = require('fs');
const elev = JSON.parse(fs.readFileSync('elevation_points.geojson', 'utf8'));
const mountains = elev.features.filter(f => f.properties.featurecla === 'mountain');
const out = mountains.map(f => {
  const p = f.properties;
  return { name_de: p.name_de || p.name_en || p.name, name_en: p.name_en || p.name,
    elevation: p.elevation, lon: p.long_x, lat: p.lat_y, region: p.region };
}).filter(m => m.name_en); // one entry (Zambia's high point) has no name in any field at all
fs.writeFileSync('mountains.json', JSON.stringify(out));
```

632 peaks total. `app.js`'s `MOUNTAIN_FAME_ORDER` curates the beginner/easy tiers (Natural Earth
elevation alone puts several very tall but obscure Central Asian peaks ahead of iconic ones like
the Matterhorn or Fuji) — see the comment there, mirrors the same fix applied to the river quiz.
