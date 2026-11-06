# Relief-Kacheln (Theme "Relief")

`data/relief/{z}/{x}/{y}.png` (Web-Mercator, z0–z5, indizierte PNGs, Meer transparent) plus `index.json`
(welche Kacheln existieren). Gebaut mit `node tools/build-relief-tiles.js <ordner>`.

Quelle der Höhen: "Terrain Tiles" (AWS Open Data, `s3.amazonaws.com/elevation-tiles-prod/terrarium/{z}/{x}/{y}.png`).
Die Daten stammen u. a. aus NASA SRTM, USGS GMTED2010/NED, ETOPO1 u. a.; verlangt wird eine Quellenangabe
(Liste: https://github.com/tilezen/joerd/blob/master/docs/attribution.md). Die Rohkacheln (ca. 90 MB) liegen nicht
im Projekt; zum Neubauen wieder herunterladen (Zoom 0–5, 1365 Kacheln).

Farben/Schummerung stehen oben in `tools/build-relief-tiles.js` (RAMP, LEVELS, exag). Gezeichnet wird in `relief.js`.
