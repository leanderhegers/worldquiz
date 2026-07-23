// Build-time only — regenerates terrain-relief.webp. Not loaded by the app itself.
//
// Reprojects the Natural Earth equirectangular shaded-relief raster into Web Mercator
// (matching d3.geoMercator's y = ln(tan(pi/4 + lat/2))), so it can be placed as a static
// background <image> under the SVG map using the same projection math app.js already uses
// (RELIEF_LAT_MAX/RELIEF_LAT_MIN) — no per-user runtime reprojection needed.
//
// Usage:
//   npm install sharp --no-save
//   curl -L -o relief.zip https://naciscdn.org/naturalearth/50m/raster/HYP_50M_SR_W.zip
//   unzip -o relief.zip -d relief_raw
//   node build-terrain-relief.js
const sharp = require('sharp');

const SRC = 'relief_raw/HYP_50M_SR_W.tif';
const OUT = 'terrain-relief.webp';
const LAT_MAX = 85.05112878; // standard Web Mercator limit — must match RELIEF_LAT_MAX in app.js
const LAT_MIN = -85.05112878;
const SRC_W = 2700; // downsample columns before warping (longitude maps 1:1, no resampling needed there)

function mercY(latDeg) {
  const lat = latDeg * Math.PI / 180;
  return Math.log(Math.tan(Math.PI / 4 + lat / 2));
}
function mercYInvLat(y) {
  return (2 * Math.atan(Math.exp(y)) - Math.PI / 2) * 180 / Math.PI;
}

async function main() {
  const resized = sharp(SRC).resize({ width: SRC_W });
  const { data, info } = await resized.raw().toBuffer({ resolveWithObject: true });
  const { width: W, height: H, channels: CH } = info;
  console.log('source (resized) dims:', W, H, CH);

  const yTop = mercY(LAT_MAX);
  const yBot = mercY(LAT_MIN);
  // Output height chosen so the vertical scale roughly matches the horizontal scale
  // (equal degrees-per-pixel at the equator) — avoids needlessly stretching/squashing.
  const degreesPerCol = 360 / W;
  const outH = Math.round((yTop - yBot) / (degreesPerCol * Math.PI / 180));
  console.log('computed output height:', outH);

  const out = Buffer.alloc(W * outH * CH);
  for (let j = 0; j < outH; j++) {
    const y = yTop - (j / (outH - 1)) * (yTop - yBot);
    const lat = mercYInvLat(y);
    let r = Math.round((90 - lat) / 180 * (H - 1));
    if (r < 0) r = 0; if (r > H - 1) r = H - 1;
    data.copy(out, j * W * CH, r * W * CH, (r + 1) * W * CH);
  }

  await sharp(out, { raw: { width: W, height: outH, channels: CH } })
    .webp({ quality: 72 })
    .toFile(OUT);
  console.log('wrote', OUT);
}
main().catch(e => { console.error(e); process.exit(1); });
