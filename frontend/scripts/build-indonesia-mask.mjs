// Builds public/geo/indonesia-outside.json: the world minus Indonesia, used to dim the map outside the country.
// Run once (or when the province layer changes); the browser then only fetches a small static file.
//
//   ARKAMAP_API_TARGET=https://api.winatra.app ARKAMAP_API_KEY=... node scripts/build-indonesia-mask.mjs
//
// Cutting 34 provinces out of one world polygon at runtime is slow and MapLibre triangulates it badly,
// so the provinces are merged here, their gaps closed, and the result is split into small cells.
import { mkdirSync, readFileSync, writeFileSync, existsSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import polygonClipping from "polygon-clipping";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");

function envValue(name) {
  if (process.env[name]) return process.env[name];
  for (const file of [".env.hosted.local", ".env.local"]) {
    const path = resolve(root, file);
    if (!existsSync(path)) continue;
    const line = readFileSync(path, "utf8").split(/\r?\n/).find(row => row.startsWith(`${name}=`));
    if (line) return line.slice(name.length + 1).trim();
  }
}

const target = envValue("ARKAMAP_API_TARGET") ?? "http://127.0.0.1:8001";
const key = envValue("ARKAMAP_API_KEY");
const headers = key ? { "X-API-Key": key } : {};
const get = async path => {
  const response = await fetch(`${target}/api${path}`, { headers });
  if (!response.ok) throw new Error(`${path}: ${response.status}`);
  return response.json();
};

const [{ metric }] = await get("/metrics");
const layer = await get(`/map/${encodeURIComponent(metric)}?level=provinsi&simplify=0.03`);

const polygons = [];
for (const { geometry } of layer.features) {
  if (geometry.type === "Polygon") polygons.push(geometry.coordinates);
  else if (geometry.type === "MultiPolygon") polygons.push(...geometry.coordinates);
}
if (!polygons.length) throw new Error("Lapisan provinsi kosong.");

// Keep only outer rings so the slivers between independently simplified provinces are not left as holes.
const merged = polygonClipping.union(polygons[0], ...polygons.slice(1));
const country = merged.map(polygon => [polygon[0]]);

let west = Infinity, south = Infinity, east = -Infinity, north = -Infinity;
for (const [ring] of country) {
  for (const [x, y] of ring) {
    west = Math.min(west, x); east = Math.max(east, x); south = Math.min(south, y); north = Math.max(north, y);
  }
}
const STEP = 5;
const box = {
  west: Math.floor(west / STEP) * STEP, east: Math.ceil(east / STEP) * STEP,
  south: Math.floor(south / STEP) * STEP, north: Math.ceil(north / STEP) * STEP,
};
const WORLD = { west: -180, east: 180, south: -85.05, north: 85.05 };

const rect = (w, s, e, n) => [[[w, s], [e, s], [e, n], [w, n], [w, s]]];
const coordinates = [
  // Everything beyond the country's bounding box needs no cutting.
  rect(WORLD.west, WORLD.south, box.west, WORLD.north),
  rect(box.east, WORLD.south, WORLD.east, WORLD.north),
  rect(box.west, WORLD.south, box.east, box.south),
  rect(box.west, box.north, box.east, WORLD.north),
];
for (let w = box.west; w < box.east; w += STEP) {
  for (let s = box.south; s < box.north; s += STEP) {
    coordinates.push(...polygonClipping.difference(rect(w, s, w + STEP, s + STEP), country));
  }
}

const round = value => Math.round(value * 1000) / 1000;
const rounded = coordinates.map(polygon => polygon.map(ring => ring.map(([x, y]) => [round(x), round(y)])));
const feature = { type: "Feature", properties: {}, geometry: { type: "MultiPolygon", coordinates: rounded } };

const out = resolve(root, "public/geo/indonesia-outside.json");
mkdirSync(dirname(out), { recursive: true });
writeFileSync(out, JSON.stringify(feature));
console.log(`${out}: ${rounded.length} poligon, ${(JSON.stringify(feature).length / 1024).toFixed(0)} KB`);
