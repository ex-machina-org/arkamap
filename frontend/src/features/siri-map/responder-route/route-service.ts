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

function places(pois: DTO<"TacticalPoi">[]) {
  return pois.map((p) => ({
    id: p.id,
    name: p.name,
    type: p.type,
    coords: p.coords as [number, number],
    distanceMeters: p.distance_meters,
    note: p.note ?? undefined,
  }));
}

function windOf(wind: DTO<"WindOut"> | null | undefined) {
  return wind ? { speedKmh: wind.speed_kmh, directionDeg: wind.direction_deg, isHazardous: wind.is_hazardous, advice: wind.advice } : null;
}

/**
 * Ingress and evacuation corridor from POST /responder/route, with the hospitals and shelters
 * around the incident. There is no client-side stand-in: a made-up hospital or a "safe" label
 * nobody checked is worse than an error, so a failed request rejects and the caller says so.
 */
export async function calculateResponderRoute(req: TacticalRouteRequest): Promise<TacticalPlan> {
  const data = await api("/responder/route", "ResponderRoute", {
    method: "POST",
    ...jsonBody({ origin: req.originCoords, incident: req.incidentCoords, incident_id: req.incidentId, incident_title: req.incidentTitle, hazard_type: req.hazardType }),
  });
  return {
    id: `plan-${Date.now()}`,
    source: "incident",
    incidentId: req.incidentId,
    incidentTitle: req.incidentTitle,
    incidentCoords: req.incidentCoords,
    originCoords: req.originCoords,
    originLabel: req.originLabel ?? "Pos Armada Penolong",
    ingressRoute: leg("ingress", "Jalur Akses Masuk Regu Penolong", data.ingress),
    egressRoute: leg("egress", `Evakuasi ke ${data.egress.target_poi.name}`, data.egress),
    tacticalPois: places(data.pois),
    hazardPolygons: geoJSON(data.hazard_polygons) as FeatureCollection<Polygon>,
    windContext: windOf(data.wind),
    createdAt: new Date().toISOString(),
  };
}

/**
 * Evacuation from where an IoT device stands, from POST /me/devices/{id}/evacuation. The backend
 * reads the device's own alert: a fire is routed around and away from where the wind carries it,
 * anything else takes the best road to the nearest assembly point.
 */
export async function calculateDeviceEvacuation(device: { id: number; name: string; lat: number; lon: number }): Promise<TacticalPlan> {
  const data = await api(`/me/devices/${device.id}/evacuation`, "EvacuationRoute", { method: "POST" });
  const coords: [number, number] = [device.lon, device.lat];
  return {
    id: `plan-${Date.now()}`,
    source: "device",
    incidentId: `device-${device.id}`,
    incidentTitle: device.name,
    incidentCoords: coords,
    originCoords: coords,
    originLabel: device.name,
    ingressRoute: null,
    egressRoute: leg("egress", `${data.fire ? "Evakuasi kebakaran" : "Evakuasi"} ke ${data.route.target_poi.name}`, data.route),
    tacticalPois: places(data.pois),
    hazardPolygons: geoJSON(data.hazard_polygons) as FeatureCollection<Polygon>,
    windContext: windOf(data.wind),
    createdAt: new Date().toISOString(),
  };
}
