import { useEffect, useMemo, useRef, type ReactNode } from "react";
import type { Feature, FeatureCollection, MultiPolygon, Point } from "geojson";
import type { StyleSpecification } from "maplibre-gl";
import {
  Map,
  MapClusterLayer,
  MapControls,
  MapMarker,
  MarkerContent,
  useMap,
} from "@/components/ui/map";
import { cx } from "@/utils/cx";
import { SpatialLayers, type ChoroplethSpec, type DockStatus, type RegionPick } from "./spatial-layers";
import { HAZARDS, HAZARD_ORDER } from "./hazards";
import type { MapLayer } from "./atlas";
import type { BasemapType, HazardType, SpatialIncident } from "./types";

const SATELLITE_STYLE: StyleSpecification = {
  version: 8,
  sources: {
    imagery: {
      type: "raster",
      tiles: [
        "https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}",
      ],
      tileSize: 256,
      maxzoom: 19,
      attribution: "Tiles © Esri, Maxar, Earthstar Geographics",
    },
    // The imagery carries no names, so transparent road and place labels go on top.
    labels: {
      type: "raster",
      tiles: [
        "https://server.arcgisonline.com/ArcGIS/rest/services/Reference/World_Transportation/MapServer/tile/{z}/{y}/{x}",
      ],
      tileSize: 256,
      maxzoom: 19,
    },
  },
  layers: [
    { id: "imagery", type: "raster", source: "imagery" },
    { id: "imagery-labels", type: "raster", source: "labels", paint: { "raster-opacity": 0.9 } },
  ],
};

// CyclOSM carries far more local detail than the street basemap: alleys, building outlines, kampung names.
// openstreetmap.fr allows this traffic and CORS, unlike tile.openstreetmap.org.
const detailStyle = (dark: boolean): StyleSpecification => ({
  version: 8,
  sources: {
    cyclosm: {
      type: "raster",
      tiles: ["a", "b", "c"].map((host) => `https://${host}.tile-cyclosm.openstreetmap.fr/cyclosm/{z}/{x}/{y}.png`),
      tileSize: 256,
      maxzoom: 18,
      attribution: '© <a href="https://www.cyclosm.org/">CyclOSM</a> · © OpenStreetMap',
    },
  },
  layers: [
    { id: "detail-bg", type: "background", paint: { "background-color": dark ? "#0a1014" : "#ede9e1" } },
    // A light style; dimmed in dark mode so it is not a glaring slab, but not so far that the detail is lost.
    { id: "detail", type: "raster", source: "cyclosm", paint: { "raster-opacity": dark ? 0.8 : 0.92, "raster-saturation": -0.12, "raster-brightness-max": dark ? 0.62 : 1 } },
  ],
});

const BASEMAP_STYLES = {
  satellite: { light: SATELLITE_STYLE, dark: SATELLITE_STYLE },
  detail: { light: detailStyle(false), dark: detailStyle(true) },
};

/** Above this many incidents the GPU cluster layers draw the points and only the selected one gets a DOM pin. */
const CLUSTER_THRESHOLD = 24;
const REDUCED_MOTION = "(prefers-reduced-motion: reduce)";
/** Pins sit on satellite imagery in both themes, so the outline stays white. */
const PIN_OUTLINE = "#ffffff";
/** Indonesia spans roughly 95°E to 141°E and 11°S to 6°N; the margin keeps border provinces fully visible without letting users pan into other regions. */
const INDONESIA_BOUNDS: [[number, number], [number, number]] = [
  [85, -19],
  [151, 15],
];
const MIN_ZOOM = 3;

/** A monitored region's bbox widened by a quarter of its span (at least 0.5°), so its edges never sit on the map's edge. */
function regionLimit(bbox: number[]): [[number, number], [number, number]] {
  const [w, s, e, n] = bbox;
  const dx = Math.max((e - w) * 0.25, 0.5), dy = Math.max((n - s) * 0.25, 0.5);
  return [[w - dx, s - dy], [e + dx, n + dy]];
}

/** Keeps panning and zooming out inside the monitored region, or inside Indonesia when there is none. */
function MapBoundsController({ region }: { region?: number[] }) {
  const { map, isLoaded } = useMap();
  const key = region?.join(",");
  useEffect(() => {
    if (!map || !isLoaded) return;
    map.setMaxBounds(key ? regionLimit(key.split(",").map(Number)) : INDONESIA_BOUNDS);
  }, [map, isLoaded, key]);
  return null;
}

/** A camera request. A new object is a new request, so focusing the same incident twice still moves the map. */
export interface CameraTarget {
  coords: [number, number];
  zoom: number;
  /** `atLeast` never zooms out from where the user already is. */
  zoomMode: "exact" | "atLeast";
}

function MapCameraController({
  target,
  pitch,
  intro,
  framed,
}: {
  target: CameraTarget;
  pitch: number;
  intro: boolean;
  /** The map opened already framed on a region: the first target (Indonesia) is not flown to. */
  framed: boolean;
}) {
  const { map, isLoaded } = useMap();
  const firstFlight = useRef(true);

  useEffect(() => {
    if (!map || !isLoaded) return;
    if (framed && firstFlight.current) {
      firstFlight.current = false;
      return;
    }
    const reduced = window.matchMedia(REDUCED_MOTION).matches;
    const zoom = target.zoomMode === "atLeast" ? Math.max(map.getZoom(), target.zoom) : target.zoom;
    map.flyTo({
      center: target.coords,
      zoom,
      duration: reduced ? 0 : intro && firstFlight.current ? 3600 : 900,
      essential: true,
    });
    firstFlight.current = false;
  }, [map, isLoaded, target, intro, framed]);

  // Pitch only tilts the current view. Re-flying here would snap back to the last focused incident.
  useEffect(() => {
    if (!map || !isLoaded) return;
    const reduced = window.matchMedia(REDUCED_MOTION).matches;
    map.easeTo({ pitch, duration: reduced ? 0 : 500, essential: true });
  }, [map, isLoaded, pitch]);

  return null;
}

function IncidentPin({
  incident,
  selected,
  onSelect,
}: {
  incident: SpatialIncident;
  selected: boolean;
  onSelect: (incident: SpatialIncident) => void;
}) {
  const hazard = HAZARDS[incident.hazardType];
  const Icon = hazard.icon;
  return (
    <button
      type="button"
      aria-label={`${incident.title}, ${incident.reading}`}
      aria-pressed={selected}
      onClick={() => onSelect(incident)}
      className="group relative flex flex-col items-center outline-none"
    >
      <span
        style={{
          backgroundColor: hazard.color,
          borderColor: PIN_OUTLINE,
          boxShadow: selected ? `0 0 0 4px ${PIN_OUTLINE}, 0 4px 12px rgb(0 0 0 / 0.35)` : "0 2px 6px rgb(0 0 0 / 0.35)",
        }}
        className={cx(
          "grid size-8 place-items-center rounded-full border-2 text-text-white transition-transform duration-150 ease-out group-hover:scale-110 group-focus-visible:outline-2 group-focus-visible:outline-offset-2 group-focus-visible:outline-border-focus-ring",
          selected && "scale-110",
        )}
      >
        <Icon className="size-4" aria-hidden="true" />
      </span>
      <span
        className={cx(
          "pointer-events-none absolute top-full mt-1.5 flex items-center gap-2 whitespace-nowrap rounded-full border border-border-button-default bg-background-primary-default px-2.5 py-1 text-caption-1-semibold text-text-primary shadow-lg transition-[opacity,transform] duration-150 ease-out",
          !selected && "translate-y-0.5 opacity-0 group-hover:translate-y-0 group-hover:opacity-100 group-focus-visible:translate-y-0 group-focus-visible:opacity-100",
        )}
      >
        <span className="max-w-[160px] truncate">{incident.title}</span>
        <span className="tabular-nums text-text-secondary">{incident.reading}</span>
      </span>
    </button>
  );
}

function toCollection(incidents: SpatialIncident[]): FeatureCollection<Point> {
  return {
    type: "FeatureCollection",
    features: incidents.map((incident) => ({
      type: "Feature",
      geometry: { type: "Point", coordinates: incident.coords },
      properties: { id: incident.id },
    })),
  };
}

interface MapViewportProps {
  incidents: SpatialIncident[];
  selectedIncident: SpatialIncident | null;
  onSelectIncident: (incident: SpatialIncident) => void;
  camera: CameraTarget;
  is3D: boolean;
  basemap: BasemapType;
  introCamera?: boolean;
  warnings?: FeatureCollection;
  choropleth: ChoroplethSpec | null;
  layer?: MapLayer;
  layerError?: string;
  /** Off shows the plain basemap, for comparing against the coloured regions. */
  showData: boolean;
  wind: boolean;
  selectedRegionId?: string | null;
  onSelectRegion?: (pick: RegionPick) => void;
  onRegionCenter?: (center: [number, number]) => void;
  /** Rendered inside the map, for cards anchored to a point on it. */
  children?: ReactNode;
  events?: FeatureCollection;
  focus?: number[];
  /** [west, south, east, north] of the monitored region: the map opens on it and cannot be panned or zoomed out of it.
   *  Absent: Indonesia. */
  startBounds?: number[];
  boundary?: FeatureCollection;
  /** Everything outside Indonesia; dims the world around the country when no regional boundary applies. */
  nationalMask?: Feature<MultiPolygon>;
  status: DockStatus;
}

export function MapViewport({
  incidents,
  selectedIncident,
  onSelectIncident,
  camera,
  is3D,
  basemap,
  introCamera = false,
  warnings,
  choropleth,
  layer,
  layerError,
  showData,
  wind,
  selectedRegionId,
  onSelectRegion,
  onRegionCenter,
  children,
  events,
  focus,
  startBounds,
  boundary,
  nationalMask,
  status,
}: MapViewportProps) {
  // Opening straight on the region skips both the national view and its intro flight.
  const framed = startBounds?.length === 4;
  const intro = introCamera && !framed;
  const clustered = incidents.length > CLUSTER_THRESHOLD;

  // One cluster layer per hazard so a cluster's colour says what it contains.
  const groups = useMemo(() => {
    if (!clustered) return [];
    const byType = new globalThis.Map<HazardType, SpatialIncident[]>();
    for (const incident of incidents) {
      const list = byType.get(incident.hazardType);
      if (list) list.push(incident);
      else byType.set(incident.hazardType, [incident]);
    }
    return HAZARD_ORDER.filter((type) => byType.has(type)).map((type) => ({
      type,
      data: toCollection(byType.get(type)!),
    }));
  }, [clustered, incidents]);

  const pins = clustered ? (selectedIncident ? [selectedIncident] : []) : incidents;

  function selectById(id: unknown) {
    const found = incidents.find((incident) => incident.id === id);
    if (found) onSelectIncident(found);
  }

  return (
    <div className="relative size-full overflow-hidden bg-background-full">
      <Map
        center={camera.coords}
        zoom={intro ? camera.zoom - 0.8 : camera.zoom}
        bounds={framed ? [[startBounds[0], startBounds[1]], [startBounds[2], startBounds[3]]] : undefined}
        fitBoundsOptions={{ padding: 64, maxZoom: 11 }}
        maxBounds={framed ? regionLimit(startBounds) : INDONESIA_BOUNDS}
        minZoom={MIN_ZOOM}
        // "heat" keeps the street map underneath: the temperature surface is translucent and needs it.
        styles={basemap === "satellite" || basemap === "detail" ? BASEMAP_STYLES[basemap] : undefined}
        className="size-full"
      >
        <MapBoundsController region={framed ? startBounds : undefined} />
        <MapCameraController target={camera} pitch={is3D ? 48 : 0} intro={intro} framed={framed} />

        <SpatialLayers warnings={warnings} choropleth={choropleth} layer={layer} layerError={layerError} showData={showData} basemap={basemap} wind={wind} selectedRegionId={selectedRegionId} onSelectRegion={onSelectRegion} onRegionCenter={onRegionCenter} buildings={is3D} events={events} focus={focus} boundary={boundary} nationalMask={nationalMask} status={status} />
        <MapControls position="bottom-right" showCompass showFullscreen showZoom />

        {groups.map(({ type, data }) => {
          const color = HAZARDS[type].color;
          return (
            <MapClusterLayer
              key={type}
              data={data}
              clusterMaxZoom={13}
              clusterRadius={45}
              clusterColors={[color, color, color]}
              pointColor={color}
              onPointClick={(feature) => selectById(feature.properties?.id)}
            />
          );
        })}

        {pins.map((incident) => (
          <MapMarker
            key={incident.id}
            longitude={incident.coords[0]}
            latitude={incident.coords[1]}
          >
            <MarkerContent>
              <IncidentPin
                incident={incident}
                selected={selectedIncident?.id === incident.id}
                onSelect={onSelectIncident}
              />
            </MarkerContent>
          </MapMarker>
        ))}

        {children}
      </Map>
    </div>
  );
}
