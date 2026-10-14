import { useEffect, useMemo, useRef, useState } from "react";
import type { Feature, FeatureCollection, MultiPolygon, Position } from "geojson";
import type { ExpressionSpecification } from "maplibre-gl";
import { toast } from "sonner";
import { RiArrowDownSLine } from "@remixicon/react";
import { MapGeoJSON, MapMarker, MarkerContent, useMap } from "@/components/ui/map";
import { StatusDot } from "@/components/base/badges/status-dot";
import { api, type DTO } from "@/lib/api/client";
import { outsideMask } from "@/hooks/use-region-boundary";
import { geoJSON } from "@/lib/api/geojson";
import { cx } from "@/utils/cx";
import { OVERLAY_RAMPS, aspectOf, fmt, isHotspotMetric, isQuakeMetric, rampAt, rampStopsFor, type Basemap, type MapLayer } from "./atlas";
import { HeatLayer } from "./heat-layer";
import { HEAT_RAMP_CSS, HEAT_RANGE, hasTemperature } from "./heat-ramp";
import { PointOverlays } from "./point-overlays";
import { WindLayer } from "./wind-layer";

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

// Thick enough that the index colour reads as a band, but thin when zoomed out so 519 kab/kota do not turn into a mesh.
const REGION_LINE_WIDTH: ExpressionSpecification = ["interpolate", ["linear"], ["zoom"], 4, 1, 7, 1.8, 11, 2.6];

/** The legend's one section per layer actually drawn, so nothing on the map goes unexplained. */
function Legend({ layer, label, showData, hotspots, quakes, heat, wind, windTime }: {
  layer?: MapLayer; label?: string; showData: boolean; hotspots: boolean; quakes: boolean; heat: boolean; wind: boolean; windTime?: string;
}) {
  const [open, setOpen] = useState(false);
  const metric = layer?.metric;
  const metricShown = showData && !heat && Boolean(metric);
  if (!metricShown && !heat && !wind) return null;
  const stops = metric ? rampStopsFor(metric.metric, aspectOf(metric.aspect)) : [];
  const highGood = metric?.polarity === "high_good";
  const title = metricShown ? label ?? metric?.label : heat ? "Suhu permukaan" : "Arah angin";
  const section = "mt-2.5 border-t border-border-button-default pt-2.5";
  const heading = "text-caption-1-medium text-text-secondary";
  return (
    <div className={cx("pointer-events-auto w-60 rounded-2lg bg-background-primary-default/95 p-3 shadow-card backdrop-blur-md max-md:w-52 max-md:p-2.5", open ? "max-h-[60svh] overflow-y-auto" : "overflow-hidden")}>
      {/* Phones collapse the key to its title, so it does not cover the map. */}
      <button type="button" aria-expanded={open} onClick={() => setOpen(value => !value)} className="flex w-full items-center gap-2 text-left outline-none focus-visible:ring-2 focus-visible:ring-border-focus-ring md:pointer-events-none">
        <span className="min-w-0 flex-1 truncate text-body-2-medium text-text-primary">{title}</span>
        <RiArrowDownSLine aria-hidden="true" className={cx("size-4 shrink-0 text-foreground-icon-secondary transition-transform md:hidden", open && "rotate-180")} />
      </button>
      <div className={cx(!open && "max-md:hidden")}>
        {metricShown && metric && <>
          {metric.description && <p className="mt-1 line-clamp-3 text-caption-1-regular text-text-secondary">{metric.description}</p>}
          <div className="mt-2 h-2 rounded-full" style={{ backgroundImage: `linear-gradient(to right, ${stops.join(", ")})` }} />
          <div className="mt-1 flex justify-between text-caption-1-regular tabular-nums text-text-secondary">
            <span>{fmt(highGood ? metric.scale_max : metric.scale_min)}</span>
            <span>{fmt(highGood ? metric.scale_min : metric.scale_max)} {metric.unit && !metric.unit.startsWith("indeks") ? metric.unit : ""}</span>
          </div>
          <p className={cx(section, "text-caption-1-regular text-text-tertiary")}>
            Warna pekat berarti paling perlu perhatian{highGood ? ", yaitu nilai paling sedikit" : ""}. Skor relatif antarwilayah, bukan probabilitas bencana. Wilayah tanpa data tidak diwarnai.
          </p>
        </>}
        {/* Hotspots and quakes use their own warm palette, so they get their own key. */}
        {metricShown && (hotspots || quakes) && (
          <div className={section}>
            <p className={heading}>{hotspots ? "Titik panas (di atas peta)" : "Gempa (di atas peta)"}</p>
            <div className="mt-1.5 h-2 rounded-full" style={{ backgroundImage: `linear-gradient(to right, ${(hotspots ? OVERLAY_RAMPS.hotspot : OVERLAY_RAMPS.quake).join(", ")})` }} />
            <p className="mt-1.5 text-caption-1-regular text-text-tertiary">{hotspots ? "Makin pekat, titik panas makin rapat. Dibobot dengan kekuatan api (FRP)." : "Lingkaran makin besar dan pekat, magnitudo makin tinggi. 30 hari terakhir, M4 ke atas."}</p>
          </div>
        )}
        {heat && (
          <div className={metricShown ? section : "mt-2"}>
            {metricShown && <p className={heading}>Suhu permukaan</p>}
            <div className="mt-1.5 h-2 rounded-full" style={{ backgroundImage: `linear-gradient(to right, ${HEAT_RAMP_CSS.join(", ")})` }} />
            <div className="mt-1 flex justify-between text-caption-1-regular tabular-nums text-text-secondary"><span>{HEAT_RANGE[0]}°C</span><span>{HEAT_RANGE[1]}°C</span></div>
            <p className="mt-1.5 text-caption-1-regular text-text-tertiary">Suhu tanah dan atap, jauh lebih panas dari suhu udara. Warna wilayah disembunyikan selama lapisan ini tampil.</p>
          </div>
        )}
        {wind && (
          <div className={metricShown || heat ? section : "mt-2"}>
            {(metricShown || heat) && <p className={heading}>Arah angin</p>}
            <p className="mt-1.5 text-caption-1-regular text-text-tertiary">
              Garis mengalir mengikuti arah angin bertiup, ke mana asap kebakaran terbawa. Biru muda berarti pelan, makin putih dan cepat berarti makin kencang. Grid sekitar 85 km{windTime ? `, data ${new Date(windTime).toLocaleString("id-ID", { dateStyle: "medium", timeStyle: "short" })}` : ""}.
            </p>
          </div>
        )}
      </div>
    </div>
  );
}

export function SpatialLayers({ warnings, choropleth, layer, layerError, showData, basemap, wind, buildings, events, focus, boundary, nationalMask, status, selectedRegionId, onSelectRegion, onRegionCenter }: {
  warnings?: FeatureCollection; choropleth: ChoroplethSpec | null; layer?: MapLayer; layerError?: string; showData: boolean; basemap: Basemap; wind: boolean;
  buildings: boolean; events?: FeatureCollection; focus?: number[]; boundary?: FeatureCollection; nationalMask?: Feature<MultiPolygon>; status: DockStatus;
  selectedRegionId?: string | null; onSelectRegion?: (pick: RegionPick) => void;
  /** The selected region's middle, for a selection made outside the map. */
  onRegionCenter?: (center: [number, number]) => void;
}) {
  const mask = useMemo(() => (boundary ? outsideMask(boundary) : nationalMask), [boundary, nationalMask]);
  const { map, isLoaded, resolvedTheme } = useMap();
  const dark = resolvedTheme === "dark";
  // The mask is added after the data layers it dims around, so it would otherwise cover clusters and regions.
  // Keep it directly beneath the first data layer, above the basemap.
  useEffect(() => {
    if (!map || !isLoaded || !mask) return;
    const fillId = "geojson-fill-profile-outside";
    const sink = () => {
      const ids = map.getStyle().layers.map(item => item.id);
      const own = ids.indexOf(fillId);
      const first = ids.findIndex(id => id !== fillId && /^(geojson-|clusters-|cluster-count-|unclustered-|overlay-)/.test(id));
      if (own > first && first >= 0) map.moveLayer(fillId, ids[first]);
    };
    sink();
    map.on("styledata", sink);
    return () => { map.off("styledata", sink); };
  }, [map, isLoaded, mask]);
  const [footprints, setFootprints] = useState<FeatureCollection>();
  const heat = basemap === "heat";
  const [grid, setGrid] = useState<DTO<"WindGrid">>();
  const [gridError, setGridError] = useState<string>();
  const [error, setError] = useState<string>();
  const [mapError, setMapError] = useState<string>();
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

  const metric = layer?.metric;
  const satellite = basemap === "satellite";
  // Each region carries its own colour, so the outline can show the index while the basemap inside stays readable.
  const regions = useMemo<FeatureCollection | undefined>(() => {
    if (!layer) return undefined;
    const stops = rampStopsFor(layer.metric.metric, aspectOf(layer.metric.aspect));
    const all = geoJSON(layer);
    return {
      ...all,
      features: all.features.map(feature => {
        const t = numberProp(feature, "normalised");
        return t == null ? feature : { ...feature, properties: { ...feature.properties, color: rampAt(stops, t / 100) } };
      }),
    };
  }, [layer]);
  // The temperature surface already colours the map, and a fill under it left nothing legible.
  const dataOn = showData && !heat;
  const fillPaint = useMemo(() => dataOn
    ? { "fill-color": ["coalesce", ["get", "color"], "#cfcfcf"] as ExpressionSpecification, "fill-opacity": ["case", ["has", "color"], satellite ? 0.38 : 0.5, 0] as ExpressionSpecification }
    // Off, the fill stays as a faint click target so regions can still be picked against the plain basemap.
    : { "fill-color": dark ? "#ffffff" : "#5a646a", "fill-opacity": 0.04 }, [dataOn, satellite, dark]);
  const fillHoverPaint = useMemo(() => ({ "fill-opacity": dataOn ? (satellite ? 0.52 : 0.62) : 0.16 }), [dataOn, satellite]);
  const linePaint = useMemo(() => dataOn
    ? { "line-color": ["coalesce", ["get", "color"], dark ? "rgba(255,255,255,0.35)" : "rgba(80,90,96,0.45)"] as ExpressionSpecification, "line-width": REGION_LINE_WIDTH, "line-opacity": 0.95 }
    : { "line-color": dark ? "rgba(255,255,255,0.18)" : "rgba(90,100,106,0.3)", "line-width": 0.7, "line-opacity": 1 }, [dataOn, dark]);

  // Regions ordered from most to least attention, so a map pick can say where it stands.
  const ordered = useMemo(() => [...(regions?.features ?? [])].sort((a, b) => (numberProp(b, "normalised") ?? -1) - (numberProp(a, "normalised") ?? -1)), [regions]);
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

  // Wind particles and the temperature surface read the same grid, so turning either on loads it once.
  const needGrid = wind || heat;
  useEffect(() => {
    if (!needGrid || grid) return;
    const controller = new AbortController();
    api("/windgrid", "WindGrid", { signal: controller.signal }).then(value => {
      if (value.direction.length !== value.nx * value.ny || value.speed.length !== value.direction.length) throw new Error("Grid angin tidak valid.");
      if (!controller.signal.aborted) { setGrid(value); setGridError(undefined); }
    }).catch(cause => { if (!controller.signal.aborted) setGridError(cause.message); });
    return () => controller.abort();
  }, [needGrid, grid]);

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

  const showHotspots = dataOn && isHotspotMetric(metric?.metric);
  const showQuakes = dataOn && isQuakeMetric(metric?.metric);
  const heatMissing = heat && (gridError || (grid && !hasTemperature(grid)));
  const problem = layerError || error || mapError || (wind && gridError);

  return <>
    {mask && <MapGeoJSON id="profile-outside" data={mask} fillPaint={{ "fill-color": "#0a0a0a", "fill-opacity": boundary ? 0.45 : 0.7, "fill-antialias": false }} linePaint={false} />}
    {boundary && <MapGeoJSON id="profile-boundary" data={boundary} fillPaint={false} linePaint={{ "line-color": "#3b82f6", "line-width": 2 }} />}
    {warnings && <MapGeoJSON id="api-warnings" data={warnings} fillPaint={{ "fill-opacity": 0.2, "fill-color": ["match", ["get", "severity"], "Severe", "#f43f5e", "Extreme", "#f43f5e", "#f59e0b"] }} interactive onClick={({ feature }) => toast.info(String(feature.properties?.headline ?? "Peringatan BMKG"), { description: String(feature.properties?.description ?? "") })} />}
    {regions && <MapGeoJSON id="api-choropleth" data={regions} promoteId="region_id" fillPaint={fillPaint} fillHoverPaint={fillHoverPaint} linePaint={linePaint} interactive onClick={({ feature, longitude, latitude }) => pick(feature, [longitude, latitude])} />}
    {selected && <MapGeoJSON id="selected-region" data={{ type: "FeatureCollection", features: [selected] }} fillPaint={false} linePaint={{ "line-color": dark || satellite ? "#ffffff" : "#1f2933", "line-width": 3 }} />}
    <PointOverlays hotspots={showHotspots} quakes={showQuakes} />
    {footprints && <MapGeoJSON id="api-buildings" data={footprints} fillPaint={{ "fill-opacity": 0.55 }} />}
    {events && <MapGeoJSON id="jev-events" data={events} fillPaint={{ "fill-opacity": 0.3 }} />}
    {events?.features.map((feature, i) => feature.geometry.type === "Point" ? <MapMarker key={i} longitude={feature.geometry.coordinates[0]} latitude={feature.geometry.coordinates[1]}><MarkerContent><span className="rounded-lg border border-border-button-default bg-background-primary-default px-2 py-1 text-caption-1-medium text-text-primary shadow-2xs">Kodama: {String(feature.properties?.name ?? feature.properties?.kind ?? "Kejadian tercatat")}</span></MarkerContent></MapMarker> : null)}
    <HeatLayer grid={grid} visible={heat} />
    <WindLayer grid={grid} visible={wind} />
    {heatMissing && (
      <p role="status" className="pointer-events-none absolute bottom-3 left-1/2 z-20 -translate-x-1/2 rounded-lg bg-background-primary-default/95 px-3 py-1.5 text-caption-1-medium text-text-secondary shadow-2xs backdrop-blur-md">
        Data suhu belum siap di server ini. Jalankan ulang ingest.
      </p>
    )}
    <div className="pointer-events-none absolute bottom-3 left-3 z-20 flex max-w-[calc(100%-4.5rem)] flex-col items-start gap-2">
      <Legend layer={layer} label={choropleth?.label} showData={showData} hotspots={showHotspots} quakes={showQuakes} heat={heat} wind={wind} windTime={grid?.observed_at} />
      <div className="pointer-events-auto flex flex-wrap items-center gap-x-3 gap-y-1.5 rounded-lg border border-border-button-default bg-background-primary-default/95 px-2.5 py-1.5 shadow-2xs backdrop-blur-md">
        <span className="flex items-center gap-1.5 text-caption-1-medium text-text-secondary" role="status">
          <StatusDot color={status.loading || status.degraded ? "yellow" : "green"} />
          {status.loading ? "Memuat data..." : status.degraded ? `${status.count} kejadian, sebagian sumber tidak tersedia` : `${status.count} kejadian dari API`}
        </span>
        {!status.loading && status.note && <span className="basis-full text-caption-1-regular text-text-tertiary max-md:hidden">{status.note}</span>}
      </div>
      {(buildings || problem) && <div className="pointer-events-auto max-w-xs rounded-lg border border-border-button-default bg-background-primary-default/95 px-2.5 py-1.5 text-caption-1-regular text-text-secondary shadow-2xs backdrop-blur-md">
        {buildings && <p>Bangunan tampil mulai zoom 14. Sumber: OSM.</p>}
        {problem && <p role="alert" className="text-status-rose-text">{problem}</p>}
      </div>}
    </div>
  </>;
}

