// Bump this whenever the precached asset list or any file in it changes — activating a new
// cache name is what evicts the old one.
const CACHE_NAME = 'weltquiz-v10';

// Precached on install: the app shell plus everything the world-map quiz (the entry point for
// most players) needs. After this the core game is fully playable with no network at all.
const ASSETS = [
  './',
  './index.html',
  './style.css',
  './app.js',
  './auth.js',
  './countries.js',
  './capitals.js',
  './cities.js',
  './languages.js',
  './currencies.js',
  './manifest.json',
  './icons/icon-192.png',
  './icons/icon-512.png',
  './vendor/d3.v7.min.js',
  './vendor/topojson.v3.min.js',
  './data/countries-50m.json',
  './data/ne_50m_lakes.geojson',
  './data/ne_50m_rivers_lake_centerlines.geojson'
];

// Deliberately NOT precached — fetched on first use and cached from then on, so the initial
// install stays light. countries-10m.json alone is 3.5 MB and only the outline quiz needs it.
const RUNTIME_CACHEABLE = /\/(data|vendor)\//;

// The flag quiz needs ~700 KB of images. Listing them here by hand would rot the moment a
// country is added, so the list is read from a generated index instead.
async function flagAssets() {
  try {
    const idx = await fetch('./data/flags/index.json').then(r => r.json());
    return [
      ...(idx.w320 || []).map(c => `./data/flags/w320/${c}.png`),
      ...(idx.h20 || []).map(c => `./data/flags/h20/${c}.png`)
    ];
  } catch (err) {
    // Not fatal: without the index the flags simply get cached on first use instead.
    console.warn('[sw] flag index unavailable, flags will be cached on demand', err);
    return [];
  }
}

self.addEventListener('install', e => {
  e.waitUntil((async () => {
    const cache = await caches.open(CACHE_NAME);
    const urls = [...ASSETS, ...await flagAssets()];
    // addAll() is atomic: a single 404 would reject the whole install and leave the app with
    // no service worker at all. Adding individually keeps one bad entry from breaking the rest.
    await Promise.all(
      urls.map(url => cache.add(url).catch(err => console.warn('[sw] skipped', url, err)))
    );
    await self.skipWaiting();
  })());
});

self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.filter(k => k !== CACHE_NAME).map(k => caches.delete(k)))
    ).then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', e => {
  if (e.request.method !== 'GET') return;

  const url = new URL(e.request.url);
  if (url.origin !== location.origin) return; // let the browser handle Firebase, flag images, …

  // Map data and libraries are large and effectively immutable (a new version means a new
  // CACHE_NAME), so serve them from cache first — that spares repeat visitors megabytes.
  if (RUNTIME_CACHEABLE.test(url.pathname)) {
    e.respondWith(
      caches.match(e.request).then(hit => hit || fetch(e.request).then(res => {
        if (res.ok) {
          const clone = res.clone();
          caches.open(CACHE_NAME).then(c => c.put(e.request, clone));
        }
        return res;
      }))
    );
    return;
  }

  // App code stays network-first so a deploy reaches users immediately; cache is the offline
  // fallback. Navigations fall back to index.html so a deep link still opens the app offline.
  e.respondWith(
    fetch(e.request).then(res => {
      if (res.ok) {
        const clone = res.clone();
        caches.open(CACHE_NAME).then(c => c.put(e.request, clone));
      }
      return res;
    }).catch(() =>
      caches.match(e.request).then(hit =>
        hit || (e.request.mode === 'navigate' ? caches.match('./index.html') : undefined)
      )
    )
  );
});
