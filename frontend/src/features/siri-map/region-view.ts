/** Camera limits and the remembered starting region for the situation map. */
import type { CameraTarget } from "./map-viewport";

export type Bbox = [west: number, south: number, east: number, north: number];
export type MapBounds = [[number, number], [number, number]];

/** Indonesia with a margin, so border provinces stay fully visible without panning into other countries. */
export const INDONESIA_BOUNDS: MapBounds = [[85, -19], [151, 15]];

/** Each side grows by a quarter of the region's span, and never by less than half a degree. */
const MIN_MARGIN = 0.5;
const KEY = "arkamap-last-region";

export function isBbox(value: unknown): value is Bbox {
  return Array.isArray(value) && value.length === 4 && value.every((item) => typeof item === "number" && Number.isFinite(item)) && value[0] < value[2] && value[1] < value[3];
}

export function widenBounds([west, south, east, north]: Bbox): MapBounds {
  const dx = Math.max((east - west) / 4, MIN_MARGIN);
  const dy = Math.max((north - south) / 4, MIN_MARGIN);
  return [[west - dx, south - dy], [east + dx, north + dy]];
}

/** The limit for panning and zooming out: around the watched region, or Indonesia without one. */
export function boundsFor(focus?: readonly number[]): MapBounds {
  const box = focus && isBbox([...focus]) ? (focus.slice(0, 4) as Bbox) : null;
  return box ? widenBounds(box) : INDONESIA_BOUNDS;
}

export function readLastRegion(): Bbox | null {
  try {
    const raw = JSON.parse(localStorage.getItem(KEY) ?? "null");
    return isBbox(raw) ? raw : null;
  } catch { return null; }
}

export function rememberRegion(box: Bbox) {
  try { localStorage.setItem(KEY, JSON.stringify(box)); } catch { /* remembering is a convenience only */ }
}

/** A rough opening view for a region; the map refines it with `fitBounds` once it has loaded. */
export function cameraForBbox([west, south, east, north]: Bbox): CameraTarget {
  const span = Math.max(east - west, (north - south) * 1.6, 0.05);
  const zoom = Math.min(11, Math.max(4.6, Math.log2((360 * 1000) / 512 / span)));
  return { coords: [(west + east) / 2, (south + north) / 2], zoom, zoomMode: "exact" };
}
