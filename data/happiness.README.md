# happiness.json

Happiness score per country (roughly 0–8), keyed by the same ISO 3166-1 numeric id used
everywhere else in the app (`C[id]` in `countries.js`). Used by the trivia quiz
(`startTriviaGame()` in `app.js`) to build "highest/lowest happiness" rounds.

Source: World Happiness Report 2025 (life-evaluation average over 2022–2024), via
[worldpopulationreview.com](https://worldpopulationreview.com/country-rankings/happiest-countries-in-the-world).
Covers 143 of the 197 countries in `C` — the report only ranks countries with sufficient
Gallup World Poll survey data, so this is intentionally sparse (unlike `population.json`,
which is complete). `startTriviaGame()` filters to `id => happiness[id] != null` before
building rounds, same pattern as the population/area quizzes.

Not auto-regenerable via a script — hand-transcribed from the published ranking. Re-check
against a fresh year's report if the numbers start to feel stale.
