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
      attribution: "Tiles © Esri, Maxar, Earthstar Geographics",
    },
  },
  layers: [{ id: "imagery", type: "raster", source: "imagery" }],
};

/** Above this many incidents the GPU cluster layers draw the points and only the selected one gets a DOM pin. */
const CLUSTER_THRESHOLD = 24;
const REDUCED_MOTION = "(prefers-reduced-motion: reduce)";
/** Pins sit on satellite imagery in both themes, so the outline stays white. */
const PIN_OUTLINE = "#ffffff";
/** Indonesia spans roughly 95°E to 141°E and 11°S to 6°N; the margin keeps border provinces fully visible without letting users pan into other regions. */
const INDONESIA_BOUNDS: [[number, number], [number, number]] = [
  [91, -14],
  [145, 10],
];
const MIN_ZOOM = 3.5;

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
}: {
  target: CameraTarget;
  pitch: number;
  intro: boolean;
}) {
  const { map, isLoaded } = useMap();
  const firstFlight = useRef(true);

  useEffect(() => {
    if (!map || !isLoaded) return;
    const reduced = window.matchMedia(REDUCED_MOTION).matches;
    const zoom = target.zoomMode === "atLeast" ? Math.max(map.getZoom(), target.zoom) : target.zoom;
    map.flyTo({
      center: target.coords,
      zoom,
      duration: reduced ? 0 : intro && firstFlight.current ? 3600 : 900,
      essential: true,
    });
    firstFlight.current = false;
  }, [map, isLoaded, target, intro]);

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
  selectedRegionId?: string | null;
  onSelectRegion?: (pick: RegionPick) => void;
  onRegionCenter?: (center: [number, number]) => void;
  /** Rendered inside the map, for cards anchored to a point on it. */
  children?: ReactNode;
  events?: FeatureCollection;
  focus?: number[];
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
  selectedRegionId,
  onSelectRegion,
  onRegionCenter,
  children,
  events,
  focus,
  boundary,
  nationalMask,
  status,
}: MapViewportProps) {
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
        zoom={introCamera ? camera.zoom - 0.8 : camera.zoom}
        maxBounds={INDONESIA_BOUNDS}
        minZoom={MIN_ZOOM}
        styles={
          basemap === "satellite"
            ? { light: SATELLITE_STYLE, dark: SATELLITE_STYLE }
            : undefined
        }
        className="size-full"
      >
        <MapCameraController target={camera} pitch={is3D ? 48 : 0} intro={introCamera} />

        <SpatialLayers warnings={warnings} choropleth={choropleth} selectedRegionId={selectedRegionId} onSelectRegion={onSelectRegion} onRegionCenter={onRegionCenter} buildings={is3D} events={events} focus={focus} boundary={boundary} nationalMask={nationalMask} status={status} />
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
