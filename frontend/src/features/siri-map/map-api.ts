import { useEffect, useState } from "react";
import type { FeatureCollection } from "geojson";
import { api } from "@/lib/api/client";
import { geoJSON } from "@/lib/api/geojson";
import type { SpatialIncident, HazardType } from "./types";
import { ALL_FEEDS, DEFAULT_WINDOWS, type EventFeeds, type EventWindows } from "./situation";

/** `/hotspots` returns at most this many points; counts come from the profile view instead. */
export const HOTSPOT_LIMIT = 4000;

function incident(id: string, title: string, coordinates: number[], hazardType: HazardType, source: string, observed: string, reading: string, summary: string): SpatialIncident {
  if (coordinates.length < 2 || !coordinates.every(Number.isFinite) || Math.abs(coordinates[0]) > 180 || Math.abs(coordinates[1]) > 90) throw new Error("Koordinat tidak valid.");
  return { id, title, coords: [coordinates[0], coordinates[1]], hazardType, source, lastUpdated: observed, reading, summary };
}

/**
 * Recorded events for the map, reaching back as far as the profile's mode does and limited to the
 * kinds the profile's field works with. `enabled` holds the request until those kinds are known.
 */
export function useSpatialData(regionId?: string, windows: EventWindows = DEFAULT_WINDOWS, feeds: EventFeeds = ALL_FEEDS, enabled = true) {
  const [state, setState] = useState<{ incidents: SpatialIncident[]; warnings?: FeatureCollection; loading: boolean; errors: string[]; updated?: string; hotspotsTruncated?: boolean }>({ incidents: [], loading: true, errors: [] });
  const { hotspot, quake, disaster } = windows;
  const { hotspot: wantHotspots, quake: wantQuakes, disaster: wantDisasters, warnings: wantWarnings, disasterType, quakeMinMag = 4.5 } = feeds;
  useEffect(() => {
    if (!enabled) return;
    const controller = new AbortController();
    const scope = regionId ? `region_id=${encodeURIComponent(regionId)}` : "";
    const withScope = (path: string) => scope ? `${path}${path.includes("?") ? "&" : "?"}${scope}` : path;
    setState(previous => ({ ...previous, incidents: [], loading: true }));
    async function load() {
      const results = await Promise.allSettled([
        wantHotspots ? api(withScope(`/hotspots?days=${Math.min(hotspot, 30)}&limit=${HOTSPOT_LIMIT}`), "HotspotCollection", { signal: controller.signal }) : Promise.resolve(undefined),
        wantQuakes ? api(withScope(`/quakes?days=${quake}&min_mag=${quakeMinMag}`), "QuakeCollection", { signal: controller.signal }) : Promise.resolve(undefined),
        wantDisasters ? api(withScope(`/disasters?days=${disaster}${disasterType ? `&type=${encodeURIComponent(disasterType)}` : ""}`), "DisasterCollection", { signal: controller.signal }) : Promise.resolve(undefined),
        wantWarnings ? api(withScope("/warnings"), "WarningCollection", { signal: controller.signal }) : Promise.resolve(undefined),
      ]);
      if (controller.signal.aborted) return;
      const rows: SpatialIncident[] = [];
      const errors = results.filter(item => item.status === "rejected").map(item => item.status === "rejected" ? String(item.reason.message) : "");
      const [hotspots, quakes, disasters, warnings] = results;
      try {
        if (hotspots.status === "fulfilled" && hotspots.value) hotspots.value.features.forEach((f, index) => rows.push(incident(`hotspot-${f.properties.observed_at}-${index}`, "Deteksi titik panas", f.geometry.coordinates, "hotspot", "FIRMS", f.properties.observed_at, `${f.properties.frp} MW`, `FRP ${f.properties.frp} MW; confidence sumber: ${f.properties.confidence ?? "tidak tersedia"}. Deteksi panas bukan konfirmasi kebakaran.`)));
        if (quakes.status === "fulfilled" && quakes.value) quakes.value.features.forEach((f, index) => rows.push(incident(`quake-${f.properties.observed_at}-${index}`, f.properties.place ?? "Gempa tercatat", f.geometry.coordinates, "seismic", f.properties.source_id ?? "Backend gempa", f.properties.observed_at, `M ${f.properties.mag}`, `Magnitudo ${f.properties.mag}; kedalaman ${f.properties.depth_km ?? "tidak tersedia"} km; dirasakan: ${f.properties.felt ?? "tidak tersedia"}. Gempa adalah kejadian tercatat, bukan prediksi.`)));
        // A wildfire event record is not a satellite detection; keeping it as a disaster stops it passing for one of the thousands of hotspots.
        if (disasters.status === "fulfilled" && disasters.value) disasters.value.features.forEach((f, index) => rows.push(incident(`disaster-${f.properties.source_id}-${index}`, f.properties.name ?? f.properties.type, f.geometry.coordinates, f.properties.type === "earthquake" ? "seismic" : f.properties.type == "flood" ? "flood" : "disaster", f.properties.source_id, f.properties.observed_at, f.properties.type, `Jenis ${f.properties.type}; level peringatan sumber ${f.properties.alertlevel ?? "tidak tersedia"}.`)));
        const hotspotsTruncated = hotspots.status === "fulfilled" && Boolean(hotspots.value) && hotspots.value!.features.length >= HOTSPOT_LIMIT;
        setState({ incidents: rows, warnings: warnings.status === "fulfilled" && warnings.value ? geoJSON(warnings.value) : undefined, loading: false, errors, updated: new Date().toISOString(), hotspotsTruncated });
      } catch (cause) { setState({ incidents: [], loading: false, errors: [...errors, cause instanceof Error ? cause.message : "Data spasial invalid"] }); }
    }
    void load(); const interval = setInterval(() => void load(), 60_000);
    return () => { controller.abort(); clearInterval(interval); };
  }, [enabled, regionId, hotspot, quake, disaster, wantHotspots, wantQuakes, wantDisasters, wantWarnings, disasterType, quakeMinMag]);
  return state;
}
