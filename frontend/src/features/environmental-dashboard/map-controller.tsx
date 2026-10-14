import { useEffect } from "react";
import { useMap } from "@/components/ui/map";
import type { EnvironmentalIncident } from "./environmental-data";

export type MapPreset = "all" | "sumatra" | "jawa" | "kalimantan";

export function MapController({
  incident,
  preset,
}: {
  incident?: EnvironmentalIncident;
  preset: MapPreset;
}) {
  const { map, isLoaded } = useMap();

  useEffect(() => {
    if (!map || !incident) return;
    const fly = () => {
      map.flyTo({
        center: incident.coords,
        zoom: 8.5,
        duration: 800,
        essential: true,
      });
    };
    if (!isLoaded) {
      map.once("load", fly);
      return () => {
        map.off("load", fly);
      };
    }
    fly();
  }, [map, isLoaded, incident]);

  useEffect(() => {
    if (!map || !isLoaded) return;
    if (preset === "all") {
      map.flyTo({ center: [118.0, -2.5], zoom: 4.8, duration: 800 });
    } else if (preset === "sumatra") {
      map.flyTo({ center: [102.5, 0.5], zoom: 6.6, duration: 800 });
    } else if (preset === "jawa") {
      map.flyTo({ center: [108.5, -7.0], zoom: 7.2, duration: 800 });
    } else if (preset === "kalimantan") {
      map.flyTo({ center: [114.0, -1.0], zoom: 6.6, duration: 800 });
    }
  }, [map, isLoaded, preset]);

  return null;
}

