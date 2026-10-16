import type { ComponentType } from "react";
import type { FeatureCollection, Polygon } from "geojson";
import { RiCommunityLine, RiGovernmentLine, RiHospitalLine, RiSchoolLine } from "@remixicon/react";

export type RouteSafetyLevel = "safe" | "caution" | "critical";
/** hospital: rumah sakit/klinik; shelter: tempat ibadah, sekolah atau balai that can take in evacuees. */
export type TacticalPOIKind = "hospital" | "shelter";

export interface TacticalPOI {
  id: string;
  name: string;
  type: TacticalPOIKind;
  coords: [number, number];
  distanceMeters: number;
  note?: string;
}

export interface RouteLeg {
  id: string;
  type: "ingress" | "egress";
  label: string;
  coordinates: [number, number][];
  distanceKm: number;
  durationMinutes: number;
  safetyLevel: RouteSafetyLevel;
  summary: string;
  warnings: string[];
}

export interface WindContext {
  speedKmh: number;
  directionDeg: number;
  isHazardous: boolean;
  advice: string;
}

export interface TacticalPlan {
  id: string;
  incidentId: string;
  incidentTitle: string;
  incidentCoords: [number, number];
  originCoords: [number, number];
  originLabel: string;
  ingressRoute: RouteLeg;
  egressRoute: RouteLeg;
  tacticalPois: TacticalPOI[];
  hazardPolygons: FeatureCollection<Polygon>;
  /** null when the backend has no wind reading near the incident. */
  windContext: WindContext | null;
  createdAt: string;
}

export interface TacticalRouteRequest {
  incidentId: string;
  incidentTitle: string;
  incidentCoords: [number, number];
  originCoords: [number, number];
  originLabel?: string;
}

type PoiIcon = ComponentType<{ className?: string; "aria-hidden"?: boolean | "true" | "false" }>;

/** Icon and colour per facility, shared by the map pins and the list. The shelter's note says which building it is. */
export function poiStyle(poi: TacticalPOI): { icon: PoiIcon; color: string; textClass: string } {
  if (poi.type === "hospital") return { icon: RiHospitalLine, color: "#e11d48", textClass: "text-status-rose-text" };
  const icon = poi.note === "Sekolah" ? RiSchoolLine : poi.note?.startsWith("Balai") ? RiGovernmentLine : RiCommunityLine;
  return { icon, color: "#059669", textClass: "text-status-lime-text" };
}
