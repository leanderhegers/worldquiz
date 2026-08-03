# exports.json

Total goods exports per country in current US$ millions (~2024), keyed by the same ISO
3166-1 numeric id used everywhere else in the app (`C[id]` in `countries.js`). Used by the
trivia quiz (`startTriviaGame()` in `app.js`) to build "highest/lowest export volume"
rounds.

Source: [Wikipedia — List of countries by exports](https://en.wikipedia.org/wiki/List_of_countries_by_exports)
(World Bank / WTO figures). Covers 193 of the 197 countries in `C`; a handful of
territories in the source table (Hong Kong, Macau, Puerto Rico, and similar non-sovereign
entries) were deliberately dropped since they aren't in `C` at all.

Not auto-regenerable via a script — hand-transcribed from the published table. Re-check
against a fresh year's data if the numbers start to feel stale.
