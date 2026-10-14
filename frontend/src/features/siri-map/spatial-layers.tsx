import { useEffect, useMemo, useRef, useState } from "react";
import type { Feature, FeatureCollection, MultiPolygon, Position } from "geojson";
import { toast } from "sonner";
import { MapGeoJSON, MapMarker, MarkerContent, useMap } from "@/components/ui/map";
import { Button } from "@/components/base/buttons/button";
import { StatusDot } from "@/components/base/badges/status-dot";
import { api, type DTO } from "@/lib/api/client";
import { outsideMask } from "@/hooks/use-region-boundary";
import { geoJSON } from "@/lib/api/geojson";

export interface DockStatus {
  loading: boolean;
  count: number;
  degraded: boolean;
  /** Shown under the count, e.g. when the map holds only the newest points. */
  note?: string;
}

export interface ChoroplethSpec {
  metric: string;
  label: string;
  level: "provinsi" | "kabkota";
  /** Limit kabupaten/kota to one province. */
  parentId: string | null;
}

/** A region picked on the map, with its place in the coloured layer's order. */
export interface RegionPick {
  regionId: string;
  name: string;
  score: number | null;
  value: number | null;
  population: number | null;
  position: number;
  of: number;
  /** Where the user clicked, so the card opens beside it. */
  anchor: [number, number];
}

const REDUCED_MOTION = "(prefers-reduced-motion: reduce)";

function numberProp(feature: Feature, key: string) {
  const value = feature.properties?.[key];
  return typeof value === "number" ? value : null;
}

function bounds(feature: Feature): [[number, number], [number, number]] | null {
  let w = Infinity, s = Infinity, e = -Infinity, n = -Infinity;
  const walk = (coords: unknown): void => {
    if (Array.isArray(coords) && typeof coords[0] === "number") {
      const [x, y] = coords as Position;
      w = Math.min(w, x); e = Math.max(e, x); s = Math.min(s, y); n = Math.max(n, y);
    } else if (Array.isArray(coords)) coords.forEach(walk);
  };
  if (feature.geometry && "coordinates" in feature.geometry) walk(feature.geometry.coordinates);
  return Number.isFinite(w) ? [[w, s], [e, n]] : null;
}

// Low to high relative attention. Hue differs from the hazard pin colours so a region fill is never read as a hazard type.
const CHOROPLETH_RAMP = ["#fde68a", "#f472b6", "#7c3aed"] as const;

export function SpatialLayers({ warnings, choropleth, buildings, events, focus, boundary, nationalMask, status, selectedRegionId, onSelectRegion, onRegionCenter }: {
  warnings?: FeatureCollection; choropleth: ChoroplethSpec | null; buildings: boolean; events?: FeatureCollection; focus?: number[]; boundary?: FeatureCollection; nationalMask?: Feature<MultiPolygon>; status: DockStatus;
  selectedRegionId?: string | null; onSelectRegion?: (pick: RegionPick) => void;
  /** The selected region's middle, for a selection made outside the map. */
  onRegionCenter?: (center: [number, number]) => void;
}) {
  const mask = useMemo(() => (boundary ? outsideMask(boundary) : nationalMask), [boundary, nationalMask]);
  const { map, isLoaded } = useMap();
  // The mask is added after the data layers it dims around, so it would otherwise cover clusters and regions.
  // Keep it directly beneath the first data layer, above the basemap.
  useEffect(() => {
    if (!map || !isLoaded || !mask) return;
    const fillId = "geojson-fill-profile-outside";
    const sink = () => {
      const ids = map.getStyle().layers.map(item => item.id);
      const own = ids.indexOf(fillId);
      const first = ids.findIndex(id => id !== fillId && /^(geojson-|clusters-|cluster-count-|unclustered-)/.test(id));
      if (own > first && first >= 0) map.moveLayer(fillId, ids[first]);
    };
    sink();
    map.on("styledata", sink);
    return () => { map.off("styledata", sink); };
  }, [map, isLoaded, mask]);
  const [layer, setLayer] = useState<FeatureCollection>();
  const [footprints, setFootprints] = useState<FeatureCollection>();
  const [wind, setWind] = useState<DTO<"WindGrid">>();
  const [windEnabled, setWindEnabled] = useState(false);
  const [error, setError] = useState<string>();
  const [mapError, setMapError] = useState<string>();
  const canvas = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    if (!map) return;
    const failed = () => setMapError("Sebagian peta dasar/layer tidak tersedia. Periksa koneksi atau ganti basemap; data API tetap ada di panel.");
    map.on("error", failed);
    const timer = !isLoaded ? setTimeout(failed, 15_000) : undefined;
    return () => { map.off("error", failed); if (timer) clearTimeout(timer); };
  }, [map, isLoaded]);
  useEffect(() => {
    if (map && isLoaded && focus?.length === 4) map.fitBounds([[focus[0], focus[1]], [focus[2], focus[3]]], { padding: 64, maxZoom: 11, duration: 700 });
  }, [map, isLoaded, focus]);
  const metric = choropleth?.metric;
  const level = choropleth?.level;
  const parentId = choropleth?.parentId;
  useEffect(() => {
    const controller = new AbortController(); setLayer(undefined); setError(undefined);
    if (metric && level) api(`/map/${encodeURIComponent(metric)}?level=${level}&simplify=0.02`, "MapLayer", { signal: controller.signal })
      .then(value => {
        if (controller.signal.aborted) return;
        const all = geoJSON(value);
        setLayer(parentId ? { ...all, features: all.features.filter(feature => feature.properties?.parent_id === parentId) } : all);
      }).catch(cause => { if (!controller.signal.aborted) setError(cause.message); });
    return () => controller.abort();
  }, [metric, level, parentId]);
  // Regions ordered from most to least attention, so a map pick can say where it stands.
  const ordered = useMemo(() => [...(layer?.features ?? [])].sort((a, b) => (numberProp(b, "normalised") ?? -1) - (numberProp(a, "normalised") ?? -1)), [layer]);
  const selected = useMemo(() => ordered.find(feature => feature.properties?.region_id === selectedRegionId), [ordered, selectedRegionId]);
  const onCenter = useRef(onRegionCenter);
  onCenter.current = onRegionCenter;
  useEffect(() => {
    const box = selected && bounds(selected);
    if (!map || !isLoaded || !box) return;
    // Leave room on the right for the card that opens beside the region.
    const roomForCard = map.getContainer().clientWidth >= 900 ? 360 : 0;
    map.fitBounds(box, { padding: { top: 96, bottom: 96, left: 96, right: 96 + roomForCard }, maxZoom: 10, duration: window.matchMedia(REDUCED_MOTION).matches ? 0 : 700 });
    onCenter.current?.([(box[0][0] + box[1][0]) / 2, (box[0][1] + box[1][1]) / 2]);
  }, [map, isLoaded, selected]);
  function pick(feature: Feature, anchor: [number, number]) {
    const id = feature.properties?.region_id;
    if (typeof id !== "string" || !onSelectRegion) return;
    onSelectRegion({
      regionId: id,
      name: String(feature.properties?.name ?? id),
      score: numberProp(feature, "normalised"),
      value: numberProp(feature, "value"),
      population: numberProp(feature, "population"),
      position: ordered.findIndex(item => item.properties?.region_id === id) + 1,
      of: ordered.length,
      anchor,
    });
  }
  useEffect(() => {
    const controller = new AbortController(); setWind(undefined);
    if (windEnabled) api("/windgrid", "WindGrid", { signal: controller.signal }).then(value => {
      if (value.direction.length !== value.nx * value.ny || value.speed.length !== value.direction.length) throw new Error("Grid angin tidak valid.");
      if (!controller.signal.aborted) setWind(value);
    }).catch(cause => { if (!controller.signal.aborted) setError(cause.message); });
    return () => controller.abort();
  }, [windEnabled]);
  useEffect(() => {
    if (!map || !isLoaded || !buildings) { setFootprints(undefined); return; }
    let active: AbortController;
    const load = () => {
      active?.abort(); active = new AbortController(); const signal = active.signal; setFootprints(undefined);
      const bounds = map.getBounds();
      if (map.getZoom() < 14 || bounds.getEast() - bounds.getWest() > 0.08 || bounds.getNorth() - bounds.getSouth() > 0.08) return;
      const query = new URLSearchParams({ west: String(bounds.getWest()), east: String(bounds.getEast()), south: String(bounds.getSouth()), north: String(bounds.getNorth()) });
      api(`/buildings?${query}`, "BuildingCollection", { signal }).then(value => { if (!signal.aborted) setFootprints(geoJSON(value)); })
        .catch(cause => { if (!signal.aborted) setError(cause.message); });
    };
    load(); map.on("moveend", load);
    return () => { active?.abort(); map.off("moveend", load); };
  }, [map, isLoaded, buildings]);
  useEffect(() => {
    const element = canvas.current;
    if (!map || !wind || !element || window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const context = element.getContext("2d"); if (!context) return;
    const particles = Array.from({ length: 180 }, (_, index) => ({ x: (index * 0.61803398875) % 1, y: (index * 0.41421356237) % 1 }));
    let frame = 0; let previous = performance.now();
    const draw = (time: number) => {
      const rect = map.getContainer().getBoundingClientRect();
      if (element.width !== rect.width || element.height !== rect.height) { element.width = rect.width; element.height = rect.height; }
      const dt = Math.min((time - previous) / 1000, 0.1); previous = time;
      context.clearRect(0, 0, element.width, element.height);
      context.strokeStyle = getComputedStyle(element).color; context.lineWidth = 1.5;
      for (const point of particles) {
        const col = Math.min(wind.nx - 1, Math.floor(point.x * wind.nx)); const row = Math.min(wind.ny - 1, Math.floor(point.y * wind.ny));
        const index = row * wind.nx + col; const speed = wind.speed[index]; const direction = (wind.direction[index] + 180) * Math.PI / 180;
        const lon = wind.west + point.x * (wind.east - wind.west); const lat = wind.south + point.y * (wind.north - wind.south);
        const a = map.project([lon, lat]);
        point.x = (point.x + Math.sin(direction) * speed * dt / 1000 + 1) % 1;
        point.y = (point.y + Math.cos(direction) * speed * dt / 1000 + 1) % 1;
        const b = map.project([wind.west + point.x * (wind.east - wind.west), wind.south + point.y * (wind.north - wind.south)]);
        if (Math.abs(a.x - b.x) < 30 && Math.abs(a.y - b.y) < 30) { context.beginPath(); context.moveTo(a.x, a.y); context.lineTo(b.x, b.y); context.stroke(); }
      }
      frame = requestAnimationFrame(draw);
    };
    frame = requestAnimationFrame(draw); return () => cancelAnimationFrame(frame);
  }, [map, wind]);
  return <>
    {mask && <MapGeoJSON id="profile-outside" data={mask} fillPaint={{ "fill-color": "#0a0a0a", "fill-opacity": boundary ? 0.45 : 0.7, "fill-antialias": false }} linePaint={false} />}
    {boundary && <MapGeoJSON id="profile-boundary" data={boundary} fillPaint={false} linePaint={{ "line-color": "#3b82f6", "line-width": 2 }} />}
    {warnings && <MapGeoJSON id="api-warnings" data={warnings} fillPaint={{ "fill-opacity": 0.2, "fill-color": ["match", ["get", "severity"], "Severe", "#f43f5e", "Extreme", "#f43f5e", "#f59e0b"] }} interactive onClick={({ feature }) => toast.info(String(feature.properties?.headline ?? "Peringatan BMKG"), { description: String(feature.properties?.description ?? "") })} />}
    {layer && <MapGeoJSON id="api-choropleth" data={layer} fillPaint={{ "fill-color": ["interpolate", ["linear"], ["coalesce", ["get", "normalised"], 0], 0, CHOROPLETH_RAMP[0], 50, CHOROPLETH_RAMP[1], 100, CHOROPLETH_RAMP[2]], "fill-opacity": ["case", ["==", ["get", "value"], null], 0, 0.42] }} linePaint={{ "line-color": "#ffffff", "line-width": 0.6, "line-opacity": 0.6 }} interactive onClick={({ feature, longitude, latitude }) => pick(feature, [longitude, latitude])} />}
    {selected && <MapGeoJSON id="selected-region" data={{ type: "FeatureCollection", features: [selected] }} fillPaint={false} linePaint={{ "line-color": "#ffffff", "line-width": 3 }} />}
    {footprints && <MapGeoJSON id="api-buildings" data={footprints} fillPaint={{ "fill-opacity": 0.55 }} />}
    {events && <MapGeoJSON id="jev-events" data={events} fillPaint={{ "fill-opacity": 0.3 }} />}
    {events?.features.map((feature, i) => feature.geometry.type === "Point" ? <MapMarker key={i} longitude={feature.geometry.coordinates[0]} latitude={feature.geometry.coordinates[1]}><MarkerContent><span className="rounded-lg border border-border-button-default bg-background-primary-default px-2 py-1 text-caption-1-medium text-text-primary shadow-2xs">Kodama: {String(feature.properties?.name ?? feature.properties?.kind ?? "Kejadian tercatat")}</span></MarkerContent></MapMarker> : null)}
    <canvas ref={canvas} aria-hidden className="pointer-events-none absolute inset-0 z-10 text-foreground-icon-primary" />
    <div className="pointer-events-none absolute bottom-3 left-3 z-20 flex max-w-[calc(100%-4.5rem)] flex-col items-start gap-2">
      {layer && <div className="pointer-events-auto w-60 rounded-2lg max-md:w-48 max-md:p-2.5 bg-background-primary-default/95 p-3 shadow-card backdrop-blur-md">
        <p className="text-body-2-medium text-text-primary">{choropleth?.label ?? "Perhatian relatif wilayah"}</p>
        <div className="mt-2 h-2 rounded-full" style={{ backgroundImage: `linear-gradient(to right, ${CHOROPLETH_RAMP.join(", ")})` }} />
        <div className="mt-1 flex justify-between text-caption-1-regular text-text-secondary"><span>Perlu perhatian rendah</span><span>Tinggi</span></div>
        <p className="mt-1.5 text-caption-1-regular text-text-tertiary max-md:hidden">Skor relatif antarwilayah, bukan probabilitas bencana. Wilayah tanpa data tidak diwarnai.</p>
      </div>}
      <div className="pointer-events-auto flex flex-wrap items-center gap-x-3 gap-y-1.5 rounded-lg border border-border-button-default bg-background-primary-default/95 p-1.5 shadow-2xs backdrop-blur-md">
        <Button variant={windEnabled ? "primary" : "secondary"} size="xs" aria-pressed={windEnabled} onClick={() => setWindEnabled(value => !value)}>{windEnabled ? "Sembunyikan angin" : "Arah angin"}</Button>
        <span className="flex items-center gap-1.5 pr-1.5 text-caption-1-medium text-text-secondary" role="status">
          <StatusDot color={status.loading || status.degraded ? "yellow" : "green"} />
          {status.loading ? "Memuat data..." : status.degraded ? `${status.count} kejadian, sebagian sumber tidak tersedia` : `${status.count} kejadian dari API`}
        </span>
        {!status.loading && status.note && <span className="basis-full px-1 text-caption-1-regular text-text-tertiary max-md:hidden">{status.note}</span>}
      </div>
      {(wind || buildings || error || mapError) && <div className="pointer-events-auto max-w-xs rounded-lg border border-border-button-default bg-background-primary-default/95 px-2.5 py-1.5 text-caption-1-regular text-text-secondary shadow-2xs backdrop-blur-md">
        {wind && <p>Angin {new Date(wind.observed_at).toLocaleString("id-ID")}. Gerak partikel hanya ilustrasi.</p>}
        {buildings && <p>Bangunan tampil mulai zoom 14. Sumber: OSM.</p>}
        {(error || mapError) && <p role="alert" className="text-status-rose-text">{error || mapError}</p>}
      </div>}
    </div>
  </>;
}
