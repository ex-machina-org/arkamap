import type { Feature, LineString } from "geojson";
import { RiMapPinLine, RiTruckLine } from "@remixicon/react";
import { MapGeoJSON, MapMarker, MarkerContent } from "@/components/ui/map";
import { poiStyle, type TacticalPlan, type TacticalPOI } from "./types";

interface ResponderRouteLayersProps {
  plan: TacticalPlan;
  activeLeg?: "ingress" | "egress" | "both";
  onSelectPoi?: (poi: TacticalPOI) => void;
}

function legToGeoJson(coordinates: [number, number][]): Feature<LineString> {
  return {
    type: "Feature",
    geometry: {
      type: "LineString",
      coordinates,
    },
    properties: {},
  };
}

export function ResponderRouteLayers({
  plan,
  activeLeg = "both",
  onSelectPoi,
}: ResponderRouteLayersProps) {
  const showIngress = activeLeg === "both" || activeLeg === "ingress";
  const showEgress = activeLeg === "both" || activeLeg === "egress";

  const IngressIcon = RiTruckLine;

  return (
    <>
      {/* Hazard Danger Buffer Area */}
      {plan.hazardPolygons && (
        <MapGeoJSON
          id="responder-hazard-buffer"
          data={plan.hazardPolygons}
          fillPaint={{
            "fill-color": "#f43f5e",
            "fill-opacity": 0.22,
          }}
          linePaint={{
            "line-color": "#f43f5e",
            "line-width": 2,
            "line-dasharray": [3, 2],
          }}
        />
      )}

      {/* Ingress Route Line (Approach to Incident) */}
      {showIngress && plan.ingressRoute && (
        <MapGeoJSON
          id="responder-ingress-line"
          data={legToGeoJson(plan.ingressRoute.coordinates)}
          fillPaint={false}
          linePaint={{
            "line-color": "#06b6d4",
            "line-width": 5,
            "line-opacity": 0.92,
          }}
        />
      )}

      {/* Egress Route Line (Evacuation Corridor to Facility) */}
      {showEgress && (
        <MapGeoJSON
          id="responder-egress-line"
          data={legToGeoJson(plan.egressRoute.coordinates)}
          fillPaint={false}
          linePaint={{
            "line-color": "#10b981",
            "line-width": 5,
            "line-opacity": 0.92,
          }}
        />
      )}

      {/* Origin Marker (Responder Starting Point) */}
      {plan.ingressRoute && <MapMarker
        longitude={plan.originCoords[0]}
        latitude={plan.originCoords[1]}
      >
        <MarkerContent>
          <div className="flex flex-col items-center">
            <span
              style={{ backgroundColor: "#0284c7" }}
              className="grid size-9 place-items-center rounded-full border-2 border-border-white text-text-white shadow-md ring-2 ring-border-focus-ring"
            >
              <IngressIcon className="size-5" aria-hidden="true" />
            </span>
            <span className="mt-1 whitespace-nowrap rounded-md border border-border-button-default bg-background-primary-default px-2 py-0.5 text-caption-1-semibold text-text-primary shadow-xs">
              {plan.originLabel}
            </span>
          </div>
        </MarkerContent>
      </MapMarker>}

      {/* Tactical POI Markers */}
      {plan.tacticalPois.map((poi) => {
        const { icon: Icon, color: pinColor } = poiStyle(poi);

        return (
          <MapMarker
            key={poi.id}
            longitude={poi.coords[0]}
            latitude={poi.coords[1]}
          >
            <MarkerContent>
              <button
                type="button"
                onClick={() => onSelectPoi?.(poi)}
                className="group flex flex-col items-center outline-none transition-transform hover:scale-110 focus-visible:scale-110"
                aria-label={`${poi.name} (${poi.distanceMeters}m)`}
              >
                <span
                  style={{ backgroundColor: pinColor }}
                  className="grid size-7 place-items-center rounded-full border-2 border-border-white text-text-white shadow-sm ring-1 ring-border-button-default"
                >
                  <Icon className="size-4" aria-hidden="true" />
                </span>
                <span className="mt-1 max-w-[130px] truncate rounded bg-background-primary-default/95 px-1.5 py-0.5 text-caption-2-medium text-text-primary shadow-2xs backdrop-blur-xs">
                  {poi.name}
                </span>
              </button>
            </MarkerContent>
          </MapMarker>
        );
      })}

      {/* Target Incident Standoff Point */}
      <MapMarker
        longitude={plan.incidentCoords[0]}
        latitude={plan.incidentCoords[1]}
      >
        <MarkerContent>
          <div className="flex flex-col items-center">
            <span
              style={{ backgroundColor: "#f97316" }}
              className="grid size-8 place-items-center rounded-full border-2 border-border-white text-text-white shadow-md animate-pulse"
            >
              <RiMapPinLine className="size-4" aria-hidden="true" />
            </span>
            <span className="mt-1 rounded bg-background-primary-default/95 px-1.5 py-0.5 text-caption-2-medium text-status-rose-text shadow-2xs">
              {plan.source === "device" ? plan.incidentTitle : "Titik Insiden Operasi"}
            </span>
          </div>
        </MarkerContent>
      </MapMarker>
    </>
  );
}
