import type { DTO } from "@/lib/api/client";

export type Stops = Array<[number, [number, number, number]]>;

/* Stops are in °C so a colour means the same temperature wherever it appears.
   Surface runs much hotter than air (Jakarta measured 42 °C surface against 33 °C air), so it gets its own scale. */
export const AIR_STOPS: Stops = [
  [8, [70, 110, 165]],
  [18, [90, 165, 180]],
  [24, [120, 195, 150]],
  [28, [205, 210, 130]],
  [31, [225, 175, 95]],
  [34, [210, 125, 90]],
  [38, [170, 75, 70]],
];

export const SURFACE_STOPS: Stops = [
  [12, [70, 110, 165]],
  [22, [90, 165, 180]],
  [28, [120, 195, 150]],
  [34, [205, 210, 130]],
  [40, [225, 175, 95]],
  [46, [210, 125, 90]],
  [52, [170, 75, 70]],
];

export function heatRgb(c: number, stops: Stops): [number, number, number] {
  if (c <= stops[0][0]) return stops[0][1];
  for (let i = 0; i < stops.length - 1; i++) {
    const [c0, a] = stops[i];
    const [c1, b] = stops[i + 1];
    if (c <= c1) {
      const t = (c - c0) / (c1 - c0);
      return [0, 1, 2].map(k => Math.round(a[k] + (b[k] - a[k]) * t)) as [number, number, number];
    }
  }
  return stops[stops.length - 1][1];
}

export const HEAT_RAMP_CSS = SURFACE_STOPS.map(([, c]) => `rgb(${c.join(",")})`);
export const HEAT_RANGE: [number, number] = [SURFACE_STOPS[0][0], SURFACE_STOPS[SURFACE_STOPS.length - 1][0]];

export function hasTemperature(grid: DTO<"WindGrid"> | undefined) {
  return Boolean(grid?.surface?.length || grid?.temperature?.length);
}
