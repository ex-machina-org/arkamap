import { useEffect, useMemo } from "react";
import { Map, MapControls, MapGeoJSON, MapMarker, MarkerContent, useMap } from "@/components/ui/map";
import type { DTO } from "@/lib/api/client";
import { EVENT_KINDS } from "../event-kinds";
import { outsideMask, useRegionBoundary } from "@/hooks/use-region-boundary";

type View = DTO<"DashboardView">;


function FitRegion({ bbox }: { bbox: number[] }) {
  const { map, isLoaded } = useMap();
  useEffect(() => {
    if (map && isLoaded) map.fitBounds([[bbox[0], bbox[1]], [bbox[2], bbox[3]]], { padding: 32, maxZoom: 11, duration: 600 });
  }, [map, isLoaded, bbox]);
  return null;
}

export function RegionMapPanel({ focus, events }: { focus: DTO<"Focus">; events: View["events"] }) {
  const boundary = useRegionBoundary(focus);
  const mask = useMemo(() => boundary && outsideMask(boundary), [boundary]);
  const points = events.flatMap(panel => panel.top.flatMap(item => {
    const lon = Number(item.lon), lat = Number(item.lat);
    return Number.isFinite(lon) && Number.isFinite(lat) ? [{ kind: panel.kind, lon, lat, name: String(item.name ?? item.place ?? EVENT_KINDS[panel.kind].label) }] : [];
  }));
  const kinds = events.filter(panel => panel.top.length).map(panel => panel.kind);
  return (
    <section aria-label={`Peta wilayah ${focus.name}`} className="flex h-[344px] min-w-0 flex-col gap-3 rounded-2xl bg-background-secondary-default p-2">
      <div className="flex items-start justify-between gap-2 px-2 pt-2">
        <div className="min-w-0">
          <p className="text-body-medium text-text-secondary">Peta wilayah</p>
          <p className="mt-0.5 truncate text-title-1-medium text-text-primary">{focus.name}</p>
        </div>
        {!!kinds.length && <ul className="flex shrink-0 flex-wrap items-center gap-3" aria-label="Legenda peta">{kinds.map(kind => <li key={kind} className="flex items-center gap-1.5 text-body-2-medium text-text-secondary"><span className={`block size-2 rounded-full ${EVENT_KINDS[kind].dotClass}`} aria-hidden />{EVENT_KINDS[kind].label}</li>)}</ul>}
      </div>
      <div className="relative min-h-0 flex-1 overflow-hidden rounded-[10px]">
        <Map center={[(focus.bbox[0] + focus.bbox[2]) / 2, (focus.bbox[1] + focus.bbox[3]) / 2]} zoom={5} className="size-full">
          <MapControls showZoom position="top-right" />
          <FitRegion bbox={focus.bbox} />
          {/* MapLibre paint expressions cannot read CSS variables, so these two layers keep literal colors. */}
          {mask && <MapGeoJSON id="region-outside" data={mask} fillPaint={{ "fill-color": "#0a0a0a", "fill-opacity": 0.45 }} linePaint={false} />}
          {boundary && <MapGeoJSON id="region-boundary" data={boundary} fillPaint={false} linePaint={{ "line-color": "#3b82f6", "line-width": 2 }} />}
          {points.map((point, index) => (
            <MapMarker key={`${point.kind}-${index}`} longitude={point.lon} latitude={point.lat}>
              <MarkerContent><span title={`${EVENT_KINDS[point.kind].label}: ${point.name}`} className={`block size-3 rounded-full border-2 border-background-primary-default ${EVENT_KINDS[point.kind].dotClass}`} /></MarkerContent>
            </MapMarker>
          ))}
        </Map>
      </div>
    </section>
  );
}
