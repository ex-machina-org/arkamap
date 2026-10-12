import type { FeatureCollection } from "geojson";

export function geoJSON(value: unknown): FeatureCollection {
  if (!value || typeof value !== "object" || !("features" in value) || !Array.isArray(value.features)) throw new Error("GeoJSON tidak valid.");
  for (const feature of value.features) {
    if (!feature || typeof feature !== "object" || !feature.geometry || typeof feature.geometry !== "object" ||
      !["Point", "MultiPoint", "LineString", "MultiLineString", "Polygon", "MultiPolygon"].includes(feature.geometry.type) || !Array.isArray(feature.geometry.coordinates)) throw new Error("Geometry tidak didukung.");
    const depths: Record<string, number> = { Point: 0, MultiPoint: 1, LineString: 1, MultiLineString: 2, Polygon: 2, MultiPolygon: 3 };
    const valid = (coordinates: unknown, depth: number): boolean => Array.isArray(coordinates) && (depth === 0
      ? coordinates.length >= 2 && coordinates.every(item => typeof item === "number" && Number.isFinite(item)) && Math.abs(coordinates[0]) <= 180 && Math.abs(coordinates[1]) <= 90
      : coordinates.every(item => valid(item, depth - 1)));
    if (!valid(feature.geometry.coordinates, depths[feature.geometry.type])) throw new Error("Koordinat GeoJSON tidak valid.");
  }
  return { type: "FeatureCollection", features: value.features.map(feature => ({ ...feature, type: "Feature" })) } as FeatureCollection;
}
