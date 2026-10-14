import { RiBroadcastLine, RiFireLine, RiWaterPercentLine, RiWindyLine } from "@remixicon/react";
import { Map, MapControls, MapMarker, MarkerContent, MarkerTooltip } from "@/components/ui/map";
import type { EnvironmentalIncident } from "./environmental-data";
import { MapController, type MapPreset } from "./map-controller";

/** The preview dashboard's incident map, in a module of its own so maplibre is downloaded only when the preview shows it. */
export function PreviewIncidentMap({
  filteredIncidents,
  activeIncident,
  mapPreset,
  showHotspots,
  showFloods,
  showAirQuality,
  showSensors,
  handleSelectIncident,
}: {
  filteredIncidents: EnvironmentalIncident[];
  activeIncident?: EnvironmentalIncident;
  mapPreset: MapPreset;
  showHotspots: boolean;
  showFloods: boolean;
  showAirQuality: boolean;
  showSensors: boolean;
  handleSelectIncident: (incident: EnvironmentalIncident) => void;
}) {
  return (
    <Map center={[108.5, -2.5]} zoom={4.8} className="size-full">
      <MapControls showZoom showCompass showFullscreen position="top-right" />
      <MapController incident={activeIncident} preset={mapPreset} />

      {filteredIncidents.map((incident) => {
        if (incident.hazardType === "hotspot" && !showHotspots) return null;
        if (incident.hazardType === "flood" && !showFloods) return null;
        if (incident.hazardType === "air_quality" && !showAirQuality) return null;
        if (incident.hazardType === "iot_sensor" && !showSensors) return null;

        const isSelected = incident.id === activeIncident?.id;
        const isCritical = incident.urgency === "critical";

        let bgClass = "bg-orange-500";
        if (incident.hazardType === "hotspot") bgClass = "bg-red-600";
        if (incident.hazardType === "flood") bgClass = "bg-blue-600";
        if (incident.hazardType === "air_quality") bgClass = "bg-purple-600";
        if (incident.hazardType === "iot_sensor") bgClass = "bg-emerald-600";

        return (
          <MapMarker
            key={incident.id}
            longitude={incident.coords[0]}
            latitude={incident.coords[1]}
            onClick={() => handleSelectIncident(incident)}
          >
            <MarkerContent>
              <div className="relative group cursor-pointer">
                {(isCritical || isSelected) && (
                  <div
                    className={`absolute -inset-1 rounded-full animate-ping opacity-60 ${bgClass}`}
                  />
                )}
                <div
                  className={`relative flex size-6 items-center justify-center rounded-full border border-white text-white shadow transition-transform ${bgClass} ${
                    isSelected ? "ring-2 ring-accent-500 scale-110" : ""
                  }`}
                >
                  {incident.hazardType === "hotspot" && <RiFireLine className="size-3.5" />}
                  {incident.hazardType === "flood" && <RiWaterPercentLine className="size-3.5" />}
                  {incident.hazardType === "air_quality" && <RiWindyLine className="size-3.5" />}
                  {incident.hazardType === "iot_sensor" && <RiBroadcastLine className="size-3.5" />}
                </div>
              </div>
            </MarkerContent>
            <MarkerTooltip>
              <div className="text-left font-sans text-xs">
                <p className="font-semibold">{incident.title}</p>
                <p className="text-caption-2 text-text-secondary">{incident.location}</p>
                <p className="font-medium text-text-error-primary">Skor: {incident.urgencyScore} / 10</p>
              </div>
            </MarkerTooltip>
          </MapMarker>
        );
      })}
    </Map>
  );
}
