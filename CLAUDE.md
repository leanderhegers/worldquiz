# Weltkarten-Quiz

Browser geography quiz (German/English). Vanilla JS, no build step, no framework, no bundler:
`index.html` loads every script globally via `<script>` tags, so all functions are globals and
the UI is wired with inline `onclick=` handlers. Renders with D3 + TopoJSON into an SVG.

Deployed as a static site to GitHub Pages (geo-quiz.de) — pushing to `main` deploys.
Local dev server: start the `Weltkarten-Quiz` config from `.claude/launch.json` (port 3000).

## Rules that are easy to break by accident

These four mistakes are invisible on a desktop browser with a good connection, and only surface
on a phone or offline. Each one has cost real debugging time before.

**1. Never fetch data from an external URL.** Everything the game needs is vendored under
`data/` (map data) and `vendor/` (D3, TopoJSON) and is fetched with a relative path. The service
worker can only cache same-origin responses, so a CDN URL silently breaks offline support — the
app previously could not even boot without a network because D3 itself was remote. To add a
dataset: download it into `data/`, commit it, reference it as `data/…`.
Still deliberately remote: Firebase (guarded, falls back to localStorage) and flag images
(flagcdn.com — so the flag quiz alone needs a connection).

**2. Adding a file under `data/` means touching `sw.js`.** Decide which it is:
- needed for the core world-map quiz → add it to the `ASSETS` precache list
- mode-specific or large → leave it out; `RUNTIME_CACHEABLE` caches it on first use
Either way bump `CACHE_NAME` (`weltquiz-vN`), otherwise existing installs keep the old cache.

**3. In `renderMap()`, put new layers in the right group.** `wrapG` holds two children:
- `g` (`#map-main`) — static content only. The Mercator infinite-wrap `<use>` clones reference
  this subtree, and in WebKit *any* DOM mutation inside a `<use>` source can force a rebuild of
  every shadow tree referencing it.
- `dynG` (`g.dyn`) — anything `applyDotR()` resizes on zoom: dots, hit circles, pin markers.
  Nothing `<use>`-references it, so mutating it per frame is cheap.
A new per-zoom-mutated layer belongs in `dynG`. Wrap copies of dots are real circles tiled at
`dx = -W / 0 / +W`; hit circles exist only on the centre tile, because taps on a clone are
resolved by `wrapFind()`.

**4. Bump `BUILD_ID` (top of `app.js`) on every push that changes what the app does.** It is
shown in the home-screen footer and is the only way to confirm on a phone whether a change is
actually live yet. (Docs-only commits don't need it.)

## Performance traps in the map

`applyDotR()` runs on every animation frame of a zoom gesture (it sits behind `scaleChanged`),
so anything in it is in the hot path:
- Never call `getBoundingClientRect()` there, especially not from inside a per-element d3
  accessor — that forces a synchronous layout per element. The SVG scale is cached in `_sc` and
  refreshed only by the ResizeObserver. This exact bug made pinch-zoom freeze for seconds on iOS
  while one-finger panning stayed smooth (panning leaves `k` unchanged, so this path never ran).
- Zoom transforms belong on `wrapG` as a single transform; don't re-render paths per frame.
- Programmatic `zoomBehavior.transform()` calls must never run reentrantly from inside d3-zoom's
  own event dispatch — the wrap re-normalization only runs on `end` and defers via `setTimeout(0)`.

## Layout

- `app.js` — everything gameplay: screens, all quiz modes, `renderMap()` (one ~370-line
  function), colours, i18n (`TX`). Entry points: `loadMap()`, `renderMap()`, `handleClick()`,
  `nextCountry()`, `updateColors()`.
- `auth.js` — Firebase auth + Firestore persistence, with a localStorage fallback; also scores,
  achievements, friends.
- `countries.js` / `capitals.js` / `cities.js` — static game data.
- `sw.js` — offline cache. `style.css`, `index.html` — UI shell (8 screens, toggled by
  `showScreen()`).

Quiz modes are distinguished by flags on the `game` object (`game.lakeMode`, `game.cityMode`,
`game.pinMode`, …). These are checked in ~40 places, and each mode has its own near-duplicate
`handle*Click` and `get*Color`/`update*Colors` functions — so adding a mode currently means
touching ~10 scattered places. Worth refactoring behind one mode descriptor before adding more.

## Testing

`npm test` — Node's built-in runner, no dependencies to install, nothing to build.

- `test/guards.test.js` enforces the four rules above. If you break one, this is what tells you.
- `test/data.test.js` checks the hand-edited game data (names, ids, difficulty tiers, region
  counts) and that the bundled map files still hold what the quizzes advertise.
- `test/logic.test.js` covers pure logic — `norm()` diacritics folding, `haversine()`, `shuffle()`,
  flag difficulty tiers — via `test/helpers/load-app.js`, which evaluates app.js against a fake
  DOM. Add a name to that helper's argument list to reach a new function.

Run it after any change, and add a case when fixing a bug that unit-testable logic caused.

What tests cannot cover here: rendering, touch gestures and offline behaviour. Several bugs in
this project were touch-only or offline-only and looked fine on a desktop browser. So when
changing map interaction, say plainly that it was only checked on desktop and ask for a check on
a phone, rather than implying it is verified.
