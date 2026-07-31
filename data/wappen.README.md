# data/wappen/

Country coats of arms for the input quiz's "Wappen" mode — one PNG per country, keyed by the
same numeric ISO 3166-1 id used everywhere else (`C[id]` in `countries.js`), same as
`data/flags/` is keyed by ISO2 but scoped to this app's own id space. 196 of 197 countries;
Turkey has no entry because it has no official heraldic coat of arms (no `P94` claim on Wikidata,
and no widely-recognised substitute — its state emblem is a seal/crescent-star mark, not a coat
of arms, so making one up would be worse than leaving it out).

Source: Wikidata's `P94` ("coat of arms image") claim, which points at a Wikimedia Commons file.
Rendered to PNG locally rather than shipped as SVG — some of these are extremely detailed
heraldic illustrations (Kenya's was 3.6 MB of raw SVG, 1810 `<path>` elements) and SVGO only cuts
that by ~40%; rasterizing at a fixed size is what actually makes 196 of these vendorable at all
(8.3 MB total vs. the 69 MB the raw SVGs would have been).

## Regenerating

1. Query Wikidata for every sovereign state's ISO2 code and coat-of-arms file:

```bash
curl -s -G "https://query.wikidata.org/sparql" \
  --data-urlencode 'query=SELECT ?iso2 ?coa WHERE {
    ?country wdt:P31 wd:Q3624078.
    ?country wdt:P297 ?iso2.
    ?country wdt:P94 ?coa.
  }' \
  -H "Accept: application/sparql-results+json" \
  -H "User-Agent: <your-project>/1.0 (contact info)" \
  -o coa_query.json
```

2. Match each result's ISO2 code against this app's own `ISO2` map in `app.js` (same lookup the
   flag quiz uses) to get the numeric country id. A handful of fixups are needed by hand:
   - **Denmark** isn't typed as `wd:Q3624078` in Wikidata (a classification quirk, not a data
     gap) and needs a direct query for `wd:Q35`'s `P94` instead of the bulk one above.
   - **Ukraine** and **Netherlands** each have two `P94` values (a historical/Soviet-era emblem
     alongside the current one for Ukraine; a "Royal" and a "State" coat of arms for the
     Netherlands, both current). Picked the current Ukrainian one and — since the "Royal" one
     failed to rasterize at all (`glib: maximum depth of 50 nested layers has been exceeded`,
     a genuine malformed-SVG problem in that particular Commons file) — the Netherlands' "State"
     coat of arms.
   - **Turkey**: no `P94` value exists at all. Excluded (see above).

3. Download each `Special:FilePath` URL (it 302-redirects to the actual file) and rasterize:

```js
const sharp = require('sharp'); // npm install sharp — not a project dependency, one-time tool
await sharp(svgPath, { density: 150 })
  .resize({ width: 240, height: 240, fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } })
  .png({ compressionLevel: 9 })
  .toFile(`data/wappen/${id}.png`);
```

`density: 150` renders the source SVG at higher internal resolution before downscaling, so fine
heraldic detail doesn't turn to mush; `fit: 'contain'` keeps each coat of arms's real proportions
(some are tall shields, some are wide seals) inside a consistent square canvas instead of
stretching them.

Space out requests to Commons (a few hundred ms between them) — this is a few hundred individual
file fetches against a shared public service, and Wikimedia's API etiquette expects exactly that.

Not in `sw.js`'s precache `ASSETS` list (it's input-quiz-mode-only and 8.3 MB) —
`RUNTIME_CACHEABLE` picks it up on first use, same as the outline quiz's `countries-10m.json`.
