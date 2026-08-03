# heritage.json

Number of UNESCO World Heritage Sites per country (cultural + natural + mixed combined),
keyed by the same ISO 3166-1 numeric id used everywhere else in the app (`C[id]` in
`countries.js`). Used by the trivia quiz (`startTriviaGame()` in `app.js`) — "most
heritage sites" rounds only, deliberately no "least" direction: dozens of countries tie
at 1 site (or aren't listed at all, meaning 0), so a "least" ranking would mostly be
arbitrary tie-breaking rather than real trivia.

Source: [worldpopulationreview.com](https://worldpopulationreview.com/country-rankings/unesco-sites-by-country),
~2025/2026 figures. Covers 168 of the 197 countries in `C`; countries with zero sites
simply don't appear in the source table.

Not auto-regenerable via a script — hand-transcribed from the published ranking. Re-check
periodically — UNESCO adds new sites most years.
