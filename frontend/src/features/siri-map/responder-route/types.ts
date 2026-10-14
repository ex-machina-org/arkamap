import type { FeatureCollection, Polygon } from "geojson";

export type RouteSafetyLevel = "safe" | "caution" | "critical";
export type TacticalPOIKind = "water_source" | "hospital" | "shelter" | "staging_area";

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
  windContext: WindContext;
  isLiveRoadNetwork: boolean;
  createdAt: string;
}

export interface TacticalRouteRequest {
  incidentId: string;
  incidentTitle: string;
  incidentCoords: [number, number];
  originCoords: [number, number];
  originLabel?: string;
}
