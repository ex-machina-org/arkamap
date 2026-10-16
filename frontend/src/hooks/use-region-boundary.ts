import { useEffect, useState } from "react";
import type { Feature, FeatureCollection, MultiPolygon, Polygon, Position } from "geojson";
import { api, apiList, type DTO } from "@/lib/api/client";
import { geoJSON } from "@/lib/api/geojson";

type Level = "provinsi" | "kabkota";

// The API has no standalone boundary endpoint, only /map/{metric}, which returns every
// region of a level with its polygon. Cache per level so switching profiles does not
// refetch the large kabupaten/kota layer.
const layers = new Map<Level, Promise<FeatureCollection>>();

// Shared by every caller, so it must not carry one caller's AbortSignal: React StrictMode aborts the
// first effect and would take the cached request down with it. Callers check their own signal instead.
function loadLevel(level: Level) {
  let cached = layers.get(level);
  if (!cached) {
    cached = apiList("/metrics", "MetricDef")
      .then(([first]) => api(`/map/${encodeURIComponent(first.metric)}?level=${level}&simplify=0.03`, "MapLayer"))
      .then(geoJSON);
    cached.catch(() => layers.delete(level));
    layers.set(level, cached);
  }
  return cached;
}

/** Outline of the profile's region, or undefined for a national profile or while loading. */
export function useRegionBoundary(focus?: DTO<"Focus"> | null) {
  const [boundary, setBoundary] = useState<FeatureCollection>();
  const regionId = focus?.id;
  const level = focus?.level;
  useEffect(() => {
    setBoundary(undefined);
    if (!regionId || (level !== "provinsi" && level !== "kabkota")) return;
    const controller = new AbortController();
    loadLevel(level)
      .then(all => {
        const features = all.features.filter(feature => feature.properties?.region_id === regionId);
        if (!controller.signal.aborted && features.length) setBoundary({ type: "FeatureCollection", features });
      })
      .catch(() => {});
    return () => controller.abort();
  }, [regionId, level]);
  return boundary;
}

function bboxOf(feature: Feature): number[] {
  const box = [Infinity, Infinity, -Infinity, -Infinity];
  const rings = feature.geometry.type === "Polygon" ? feature.geometry.coordinates
    : feature.geometry.type === "MultiPolygon" ? feature.geometry.coordinates.flat() : [];
  for (const [x, y] of rings.flat()) {
    box[0] = Math.min(box[0], x); box[1] = Math.min(box[1], y);
    box[2] = Math.max(box[2], x); box[3] = Math.max(box[3], y);
  }
  return box;
}

/** The province a kab/kota profile sits in, as a focus the map can widen to; undefined while loading. */
export function useProvinceFocus(provinceId?: string | null) {
  const [province, setProvince] = useState<DTO<"Focus">>();
  useEffect(() => {
    setProvince(undefined);
    if (!provinceId) return;
    let active = true;
    loadLevel("provinsi")
      .then(all => {
        const feature = all.features.find(item => item.properties?.region_id === provinceId);
        if (active && feature) setProvince({ id: provinceId, level: "provinsi", name: String(feature.properties?.name ?? ""), bbox: bboxOf(feature) });
      })
      .catch(() => {});
    return () => { active = false; };
  }, [provinceId]);
  return province;
}

/** Static mask of everything outside Indonesia, cut from the province layer by scripts/build-indonesia-mask.mjs. */
const INDONESIA_MASK_URL = "/geo/indonesia-outside.json";
let indonesiaMask: Promise<Feature<MultiPolygon>> | undefined;

/** Dims the world outside Indonesia on a national profile. Only loads while `enabled`. */
export function useIndonesiaMask(enabled: boolean) {
  const [mask, setMask] = useState<Feature<MultiPolygon>>();
  useEffect(() => {
    if (!enabled) return;
    let active = true;
    indonesiaMask ??= fetch(INDONESIA_MASK_URL).then(response => {
      if (!response.ok) throw new Error(`Mask ${response.status}`);
      return response.json() as Promise<Feature<MultiPolygon>>;
    });
    indonesiaMask.then(value => { if (active) setMask(value); }).catch(() => { indonesiaMask = undefined; });
    return () => { active = false; };
  }, [enabled]);
  return enabled ? mask : undefined;
}

const WORLD: Position[] = [[-180, -85], [180, -85], [180, 85], [-180, 85], [-180, -85]];

/** World polygon with the region cut out, used to dim everything outside the scope. */
export function outsideMask(boundary: FeatureCollection): Feature<Polygon> {
  const holes: Position[][] = [];
  for (const { geometry } of boundary.features) {
    if (geometry.type === "Polygon") holes.push(geometry.coordinates[0]);
    else if (geometry.type === "MultiPolygon") for (const polygon of geometry.coordinates) holes.push(polygon[0]);
  }
  return { type: "Feature", properties: {}, geometry: { type: "Polygon", coordinates: [WORLD, ...holes] } };
}
