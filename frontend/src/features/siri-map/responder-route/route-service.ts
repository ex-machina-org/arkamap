import type { FeatureCollection, Polygon } from "geojson";
import { api, jsonBody, type DTO } from "@/lib/api/client";
import { geoJSON } from "@/lib/api/geojson";
import type { RouteLeg, TacticalPlan, TacticalRouteRequest } from "./types";

function leg(id: "ingress" | "egress", label: string, out: DTO<"RouteLegOut">): RouteLeg {
  return {
    id: `leg-${id}`,
    type: id,
    label,
    coordinates: out.coordinates as [number, number][],
    distanceKm: out.distance_km,
    durationMinutes: out.duration_minutes,
    safetyLevel: out.safety_level,
    summary: out.summary,
    warnings: out.warnings,
  };
}

/**
 * Ingress and evacuation corridor from POST /responder/route, with the hospitals and shelters
 * around the incident. There is no client-side stand-in: a made-up hospital or a "safe" label
 * nobody checked is worse than an error, so a failed request rejects and the caller says so.
 */
export async function calculateResponderRoute(req: TacticalRouteRequest): Promise<TacticalPlan> {
  const data = await api("/responder/route", "ResponderRoute", {
    method: "POST",
    ...jsonBody({ origin: req.originCoords, incident: req.incidentCoords, incident_id: req.incidentId, incident_title: req.incidentTitle }),
  });
  return {
    id: `plan-${Date.now()}`,
    incidentId: req.incidentId,
    incidentTitle: req.incidentTitle,
    incidentCoords: req.incidentCoords,
    originCoords: req.originCoords,
    originLabel: req.originLabel ?? "Pos Armada Penolong",
    ingressRoute: leg("ingress", "Jalur Akses Masuk Regu Penolong", data.ingress),
    egressRoute: leg("egress", `Koridor Evakuasi ➔ ${data.egress.target_poi.name}`, data.egress),
    tacticalPois: data.pois.map((p) => ({
      id: p.id,
      name: p.name,
      type: p.type,
      coords: p.coords as [number, number],
      distanceMeters: p.distance_meters,
      note: p.note ?? undefined,
    })),
    hazardPolygons: geoJSON(data.hazard_polygons) as FeatureCollection<Polygon>,
    windContext: data.wind
      ? { speedKmh: data.wind.speed_kmh, directionDeg: data.wind.direction_deg, isHazardous: data.wind.is_hazardous, advice: data.wind.advice }
      : null,
    createdAt: new Date().toISOString(),
  };
}
