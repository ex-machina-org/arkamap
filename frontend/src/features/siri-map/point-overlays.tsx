import { useEffect, useState } from "react";
import type { FeatureCollection } from "geojson";
import type { LayerSpecification } from "maplibre-gl";
import { useMap } from "@/components/ui/map";
import { api } from "@/lib/api/client";
import { geoJSON } from "@/lib/api/geojson";

/** One GeoJSON source with one raw MapLibre layer, re-added after every basemap swap. */
function RawLayer({ id, data, layer }: { id: string; data: FeatureCollection; layer: Omit<LayerSpecification, "id" | "source"> }) {
  const { map, isLoaded } = useMap();
  const sourceId = `overlay-source-${id}`;
  const layerId = `overlay-${id}`;
  useEffect(() => {
    if (!map || !isLoaded) return;
    map.addSource(sourceId, { type: "geojson", data });
    map.addLayer({ ...layer, id: layerId, source: sourceId } as LayerSpecification);
    return () => {
      try {
        if (map.getLayer(layerId)) map.removeLayer(layerId);
        if (map.getSource(sourceId)) map.removeSource(sourceId);
      } catch {
        // the style may be mid-reload
      }
    };
    // `data` is synced below; the layer spec is static per id.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [map, isLoaded, sourceId, layerId]);
  useEffect(() => {
    if (!map || !isLoaded) return;
    (map.getSource(sourceId) as { setData?: (value: FeatureCollection) => void } | undefined)?.setData?.(data);
  }, [map, isLoaded, data, sourceId]);
  return null;
}

// Weighted by fire radiative power, so a few intense fires outweigh many faint detections.
const HOTSPOT_HEAT: Omit<LayerSpecification, "id" | "source"> = {
  type: "heatmap",
  maxzoom: 13,
  paint: {
    "heatmap-weight": ["interpolate", ["linear"], ["get", "frp"], 0, 0.2, 120, 1],
    "heatmap-intensity": ["interpolate", ["linear"], ["zoom"], 3, 0.6, 13, 3.2],
    "heatmap-radius": ["interpolate", ["linear"], ["zoom"], 3, 10, 8, 34, 13, 60],
    "heatmap-opacity": ["interpolate", ["linear"], ["zoom"], 3, 0.9, 9, 0.65, 12, 0.15, 13, 0],
    "heatmap-color": [
      "interpolate", ["linear"], ["heatmap-density"],
      0, "rgba(237,233,225,0)",
      0.15, "rgba(217,164,91,0.25)",
      0.4, "rgba(217,164,91,0.55)",
      0.7, "rgba(199,123,98,0.75)",
      1, "rgba(199,123,98,0.92)",
    ],
  },
} as Omit<LayerSpecification, "id" | "source">;

// Sized by magnitude rather than heat-mapped: one large event matters more than a cluster of small ones.
const QUAKE_CIRCLES: Omit<LayerSpecification, "id" | "source"> = {
  type: "circle",
  paint: {
    "circle-radius": [
      "interpolate", ["linear"], ["zoom"],
      3, ["interpolate", ["linear"], ["get", "mag"], 4, 1.5, 6, 4, 8, 9],
      8, ["interpolate", ["linear"], ["get", "mag"], 4, 4, 6, 11, 8, 26],
    ],
    "circle-color": ["interpolate", ["linear"], ["get", "mag"], 4, "#7FB0A6", 5.5, "#D9A45B", 7, "#C77B62"],
    "circle-opacity": 0.55,
    "circle-stroke-width": 1,
    "circle-stroke-color": ["interpolate", ["linear"], ["get", "mag"], 4, "#4E8279", 5.5, "#A8763A", 7, "#9C5844"],
  },
} as Omit<LayerSpecification, "id" | "source">;

/** The raw events behind a fire or quake metric, fetched once when that metric is first shown. */
export function PointOverlays({ hotspots, quakes }: { hotspots: boolean; quakes: boolean }) {
  const [hotspotData, setHotspotData] = useState<FeatureCollection>();
  const [quakeData, setQuakeData] = useState<FeatureCollection>();
  useEffect(() => {
    if (!hotspots || hotspotData) return;
    const controller = new AbortController();
    api("/hotspots?days=7&limit=2500&min_frp=3", "HotspotCollection", { signal: controller.signal })
      .then(value => { if (!controller.signal.aborted) setHotspotData(geoJSON(value)); })
      .catch(() => {});
    return () => controller.abort();
  }, [hotspots, hotspotData]);
  useEffect(() => {
    if (!quakes || quakeData) return;
    const controller = new AbortController();
    api("/quakes?days=30&min_mag=4&limit=1200", "QuakeCollection", { signal: controller.signal })
      .then(value => { if (!controller.signal.aborted) setQuakeData(geoJSON(value)); })
      .catch(() => {});
    return () => controller.abort();
  }, [quakes, quakeData]);
  return <>
    {hotspots && hotspotData && <RawLayer id="hotspot-heat" data={hotspotData} layer={HOTSPOT_HEAT} />}
    {quakes && quakeData && <RawLayer id="quake-circles" data={quakeData} layer={QUAKE_CIRCLES} />}
  </>;
}
