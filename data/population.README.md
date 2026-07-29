# population.json

Population estimate per country, keyed by the same ISO 3166-1 numeric id used everywhere else in
the app (`C[id]` in `countries.js`). Used by the population quiz (`startPopGame()` in `app.js`) to
build "most/least populous" rounds.

Source: Natural Earth's `ne_10m_admin_0_countries` (10m cultural), field `POP_EST` (year 2019,
per `POP_YEAR`). Same provenance family as the region-quiz datasets — see `data/regions/README.md`.

## Regenerating

```bash
curl -sL -o adm0.zip https://naciscdn.org/naturalearth/10m/cultural/ne_10m_admin_0_countries.zip
unzip -oq adm0.zip -d adm0
npx mapshaper adm0/ne_10m_admin_0_countries.shp \
  -filter-fields NAME,ISO_N3,ISO_N3_EH,POP_EST \
  -o format=geojson admin0_props.geojson
```

Then join on the numeric id, preferring `ISO_N3` and falling back to `ISO_N3_EH` when the primary
field is `-99` (Natural Earth marks a handful of countries — e.g. France, Norway — this way in the
un-dissolved layer). Kosovo has no ISO 3166 code at all and is joined by name instead, to id 383.

`test/data.test.js` checks that every country in `C` has a population entry, so a bad regeneration
fails the suite rather than shipping a quiz that can't build its round list.
