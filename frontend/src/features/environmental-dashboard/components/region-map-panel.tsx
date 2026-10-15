import { useEffect, useMemo, useState } from "react";
import { Map, MapClusterLayer, MapControls, MapGeoJSON, useMap } from "@/components/ui/map";
import { api, type DTO } from "@/lib/api/client";
import { EVENT_KINDS } from "../event-kinds";
import { formatInteger } from "../format";
import type { EventKind } from "../types";
import { outsideMask, useRegionBoundary } from "@/hooks/use-region-boundary";

type View = DTO<"DashboardView">;
type Points = GeoJSON.FeatureCollection<GeoJSON.Point>;

const ENDPOINTS: Record<string, { kind: EventKind; schema: "HotspotCollection" | "QuakeCollection" | "DisasterCollection" }> = {
  "/hotspots": { kind: "hotspot", schema: "HotspotCollection" },
  "/quakes": { kind: "quake", schema: "QuakeCollection" },
  "/disasters": { kind: "disaster", schema: "DisasterCollection" },
};
// Enough for a kabupaten or a province; a capped layer says so in the legend.
const LIMIT = 2000;
// MapLibre paint cannot read CSS variables: these are the -active steps of each kind's chart token (chart-3 pink, chart-5 purple, chart-6 blue).
const KIND_HEX: Record<EventKind, string> = { hotspot: "#f6339a", quake: "#ad46ff", disaster: "#2b7fff" };

function FitRegion({ bbox }: { bbox: number[] }) {
  const { map, isLoaded } = useMap();
  useEffect(() => {
    if (map && isLoaded) map.fitBounds([[bbox[0], bbox[1]], [bbox[2], bbox[3]]], { padding: 32, maxZoom: 11, duration: 600 });
  }, [map, isLoaded, bbox]);
  return null;
}

/** The field's point layers, fetched with the same windows the backend chose for the mode. */
function useEventLayers(layers: View["layers"], regionId: string) {
  const [result, setResult] = useState<{ kind: EventKind; data: Points; capped: boolean }[]>([]);
  // The dashboard response rebuilds `layers` each time; refetch only when their content changes.
  const key = JSON.stringify(layers);
  const stable = useMemo(() => JSON.parse(key) as View["layers"], [key]);
  useEffect(() => {
    const controller = new AbortController();
    const requests = stable.flatMap(layer => {
      const target = layer.type === "points" && layer.endpoint ? ENDPOINTS[layer.endpoint] : undefined;
      if (!target) return [];
      const params = new URLSearchParams({ region_id: regionId, limit: String(LIMIT) });
      for (const [name, value] of Object.entries(layer.params ?? {})) if (value != null) params.set(name, String(value));
      return [api(`${layer.endpoint}?${params}`, target.schema, { signal: controller.signal })
        .then(collection => ({ kind: target.kind, data: collection as unknown as Points, capped: collection.features.length >= LIMIT }))
        .catch(() => null)];
    });
    void Promise.all(requests).then(items => { if (!controller.signal.aborted) setResult(items.filter(item => item != null)); });
    return () => controller.abort();
  }, [stable, regionId]);
  return result;
}

export function RegionMapPanel({ focus, layers, title = "Peta wilayah" }: { focus: DTO<"Focus">; layers: View["layers"]; title?: string }) {
  const boundary = useRegionBoundary(focus);
  const mask = useMemo(() => boundary && outsideMask(boundary), [boundary]);
  const points = useEventLayers(layers, focus.id);
  return (
    <section aria-label={`Peta wilayah ${focus.name}`} className="flex h-full min-w-0 flex-col gap-3 rounded-2xl bg-background-secondary-default p-2">
      <div className="flex items-start justify-between gap-2 px-2 pt-2">
        <div className="min-w-0">
          <p className="text-body-medium text-text-secondary">{title}</p>
          <p className="mt-0.5 truncate text-title-1-medium text-text-primary">{focus.name}</p>
        </div>
        {!!points.length && <ul className="flex shrink-0 flex-wrap items-center justify-end gap-3" aria-label="Legenda peta">{points.map(({ kind, data, capped }) => <li key={kind} className="flex items-center gap-1.5 text-body-2-medium text-text-secondary">
          <span className={`block size-2 rounded-full ${EVENT_KINDS[kind].dotClass}`} aria-hidden />
          {EVENT_KINDS[kind].label} <span className="text-text-primary tabular-nums">{capped ? `${formatInteger(LIMIT)}+` : formatInteger(data.features.length)}</span>
        </li>)}</ul>}
      </div>
      <div className="relative min-h-0 flex-1 overflow-hidden rounded-[10px]">
        <Map center={[(focus.bbox[0] + focus.bbox[2]) / 2, (focus.bbox[1] + focus.bbox[3]) / 2]} zoom={5} className="size-full">
          <MapControls showZoom position="top-right" />
          <FitRegion bbox={focus.bbox} />
          {/* MapLibre paint expressions cannot read CSS variables, so these two layers keep literal colors. */}
          {mask && <MapGeoJSON id="region-outside" data={mask} fillPaint={{ "fill-color": "#0a0a0a", "fill-opacity": 0.45 }} linePaint={false} />}
          {boundary && <MapGeoJSON id="region-boundary" data={boundary} fillPaint={false} linePaint={{ "line-color": "#3b82f6", "line-width": 2 }} />}
          {points.map(({ kind, data }) => <MapClusterLayer key={kind} data={data} pointColor={KIND_HEX[kind]}
            clusterColors={[KIND_HEX[kind], KIND_HEX[kind], KIND_HEX[kind]]} clusterThresholds={[20, 200]} clusterRadius={40} />)}
        </Map>
      </div>
    </section>
  );
}
