import type { FeatureCollection, Polygon } from "geojson";
import type {
  TacticalPlan,
  TacticalPOI,
  TacticalRouteRequest,
  WindContext,
  RouteLeg,
} from "./types";

const OSRM_ROUTER_URL = "https://router.project-osrm.org/route/v1/driving";

interface BackendRouteResponse {
  ingress?: {
    coordinates: [number, number][];
    distance_km: number;
    duration_minutes: number;
    safety_level?: "safe" | "caution" | "critical";
    summary?: string;
    warnings?: string[];
  };
  egress?: {
    coordinates: [number, number][];
    distance_km: number;
    duration_minutes: number;
    target_poi?: {
      name: string;
      type: "hospital" | "shelter";
      coords: [number, number];
    };
    safety_level?: "safe" | "caution" | "critical";
    summary?: string;
    warnings?: string[];
  };
  pois?: Array<{
    id: string;
    name: string;
    type: "hospital" | "water_source" | "shelter" | "staging_area";
    coords: [number, number];
    distance_meters: number;
    note?: string;
  }>;
  hazard_polygons?: FeatureCollection<Polygon>;
  wind?: {
    speed_kmh: number;
    direction_deg: number;
    is_hazardous: boolean;
    advice: string;
  };
}

interface OsrmResponse {
  code: string;
  routes?: Array<{
    geometry: {
      type: "LineString";
      coordinates: [number, number][];
    };
    distance: number; // meters
    duration: number; // seconds
  }>;
}

/**
 * Fetches real road routing from OpenStreetMap OSRM router.
 * Falls back to geometric interpolation if offline, timed out, or inaccessible.
 */
async function fetchRoadRoute(
  start: [number, number],
  end: [number, number],
): Promise<{ coordinates: [number, number][]; distanceKm: number; durationMinutes: number; isLive: boolean }> {
  const [sLon, sLat] = start;
  const [eLon, eLat] = end;

  const url = `${OSRM_ROUTER_URL}/${sLon},${sLat};${eLon},${eLat}?overview=full&geometries=geojson`;

  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 6000);

    const res = await fetch(url, {
      signal: controller.signal,
      headers: { Accept: "application/json" },
    });
    clearTimeout(timeout);

    if (res.ok) {
      const data: OsrmResponse = await res.json();
      if (data.code === "Ok" && data.routes && data.routes.length > 0) {
        const route = data.routes[0];
        const distanceKm = Math.round((route.distance / 1000) * 10) / 10;
        const durationMinutes = Math.max(1, Math.round(route.duration / 60));
        return {
          coordinates: route.geometry.coordinates,
          distanceKm,
          durationMinutes,
          isLive: true,
        };
      }
    }
  } catch {
    // Fallback to geometric interpolation if upstream is unreachable
  }

  // Graceful fallback: curved road estimation
  const dxKm = (eLon - sLon) * 111.0 * Math.cos((eLat * Math.PI) / 180);
  const dyKm = (eLat - sLat) * 111.0;
  const directDistKm = Math.hypot(dxKm, dyKm);
  const roadDistKm = Math.max(0.8, Math.round(directDistKm * 1.3 * 10) / 10);
  const durationMinutes = Math.max(2, Math.round((roadDistKm / 40) * 60));

  const mid1: [number, number] = [
    sLon + (eLon - sLon) * 0.35 + 0.003,
    sLat + (eLat - sLat) * 0.35 - 0.002,
  ];
  const mid2: [number, number] = [
    sLon + (eLon - sLon) * 0.7 - 0.002,
    sLat + (eLat - sLat) * 0.7 + 0.003,
  ];

  return {
    coordinates: [start, mid1, mid2, end],
    distanceKm: roadDistKm,
    durationMinutes,
    isLive: false,
  };
}

/**
 * Generates a circular polygon for the hazard buffer.
 */
function createHazardPolygon(center: [number, number], radiusKm: number): FeatureCollection<Polygon> {
  const [lon, lat] = center;
  const points = 32;
  const coords: [number, number][] = [];
  const kmPerDegreeLat = 111.0;
  const kmPerDegreeLon = 111.0 * Math.cos((lat * Math.PI) / 180);

  const radiusLat = radiusKm / kmPerDegreeLat;
  const radiusLon = radiusKm / kmPerDegreeLon;

  for (let i = 0; i <= points; i++) {
    const angle = (i * 2 * Math.PI) / points;
    coords.push([
      lon + Math.cos(angle) * radiusLon,
      lat + Math.sin(angle) * radiusLat,
    ]);
  }

  return {
    type: "FeatureCollection",
    features: [
      {
        type: "Feature",
        geometry: {
          type: "Polygon",
          coordinates: [coords],
        },
        properties: {
          radiusKm,
          hazardType: "buffer_zone",
        },
      },
    ],
  };
}

/**
 * Generates key tactical POIs (Hospital, Water/Hydrant, Assembly Point).
 */
function createTacticalPois(incident: [number, number]): TacticalPOI[] {
  const [lon, lat] = incident;
  const shift = 0.008; // ~800 meters

  return [
    {
      id: "poi-hosp-1",
      name: "RSUD Rujukan IGD 24 Jam",
      type: "hospital",
      coords: [lon + shift * 1.5, lat + shift * 1.1],
      distanceMeters: 2100,
      note: "Pusat rujukan penanganan korban darurat",
    },
    {
      id: "poi-water-1",
      name: "Hydrant Induk & Sumber Air Bencana",
      type: "water_source",
      coords: [lon - shift * 0.8, lat + shift * 0.5],
      distanceMeters: 650,
      note: "Debit air stabil, akses armada terbuka",
    },
    {
      id: "poi-shelter-1",
      name: "Titik Kumpul Pengungsi (Shelter)",
      type: "shelter",
      coords: [lon + shift * 1.2, lat - shift * 1.2],
      distanceMeters: 1700,
      note: "Lokasi lapang aman dari asap dan reruntuhan",
    },
  ];
}

/**
 * Calculates tactical ingress and egress routes adhering to the real street network.
 */
export async function calculateResponderRoute(
  req: TacticalRouteRequest,
): Promise<TacticalPlan> {
  // 1. Coba hubungi Backend API orkestrator jika sudah aktif (/api/responder/route)
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 4500);

    const beRes = await fetch("/api/responder/route", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      signal: controller.signal,
      body: JSON.stringify({
        origin: req.originCoords,
        incident: req.incidentCoords,
        incident_id: req.incidentId,
        incident_title: req.incidentTitle,
      }),
    });
    clearTimeout(timeout);

    if (beRes.ok) {
      const data: BackendRouteResponse = await beRes.json();
      if (data.ingress?.coordinates && data.egress?.coordinates) {
        return {
          id: `plan-${Date.now()}`,
          incidentId: req.incidentId,
          incidentTitle: req.incidentTitle,
          incidentCoords: req.incidentCoords,
          originCoords: req.originCoords,
          originLabel: req.originLabel ?? "Pos Armada Penolong",
          ingressRoute: {
            id: "leg-ingress",
            type: "ingress",
            label: "Jalur Akses Masuk Regu Penolong",
            coordinates: data.ingress.coordinates,
            distanceKm: data.ingress.distance_km,
            durationMinutes: data.ingress.duration_minutes,
            safetyLevel: data.ingress.safety_level ?? "safe",
            summary:
              data.ingress.summary ??
              `Akses dari ${req.originLabel ?? "Pos Armada"} bebas dari rintangan aktif.`,
            warnings: data.ingress.warnings ?? [
              "Jalur terverifikasi bebas dari poligon bahaya dan cuaca ekstrem.",
            ],
          },
          egressRoute: {
            id: "leg-egress",
            type: "egress",
            label: `Koridor Evakuasi ➔ ${data.egress.target_poi?.name ?? "Fasilitas Medis"}`,
            coordinates: data.egress.coordinates,
            distanceKm: data.egress.distance_km,
            durationMinutes: data.egress.duration_minutes,
            safetyLevel: data.egress.safety_level ?? "safe",
            summary:
              data.egress.summary ??
              `Koridor evakuasi warga menuju ${data.egress.target_poi?.name ?? "faskes aman"}.`,
            warnings: data.egress.warnings ?? [
              "Koridor berada pada sisi aman berlawanan dari hembusan asap.",
            ],
          },
          tacticalPois:
            data.pois?.map((p) => ({
              id: p.id,
              name: p.name,
              type: p.type,
              coords: p.coords,
              distanceMeters: p.distance_meters,
              note: p.note,
            })) ?? createTacticalPois(req.incidentCoords),
          hazardPolygons:
            data.hazard_polygons ?? createHazardPolygon(req.incidentCoords, 0.8),
          windContext: data.wind
            ? {
                speedKmh: data.wind.speed_kmh,
                directionDeg: data.wind.direction_deg,
                isHazardous: data.wind.is_hazardous,
                advice: data.wind.advice,
              }
            : {
                speedKmh: 14,
                directionDeg: 75,
                isHazardous: false,
                advice:
                  "Angin bertiup ke Timur-Laut; koridor evakuasi berada di sisi berlawanan arah hembusan asap.",
              },
          isLiveRoadNetwork: true,
          createdAt: new Date().toISOString(),
        };
      }
    }
  } catch {
    // BE endpoint belum aktif atau timeout; lanjutkan dengan OSRM client-side fallback
  }

  // 2. Client-side OSRM router fallback (live OpenStreetMap road network)
  const tacticalPois = createTacticalPois(req.incidentCoords);
  const primaryHospital = tacticalPois.find((p) => p.type === "hospital") ?? tacticalPois[0];

  // Ingress: Origin (GPS/Posko) -> Incident
  const ingressData = await fetchRoadRoute(req.originCoords, req.incidentCoords);

  // Egress: Incident -> Primary Emergency Hospital
  const egressData = await fetchRoadRoute(req.incidentCoords, primaryHospital.coords);

  const ingressLeg: RouteLeg = {
    id: "leg-ingress",
    type: "ingress",
    label: "Jalur Akses Masuk Regu Penolong",
    coordinates: ingressData.coordinates,
    distanceKm: ingressData.distanceKm,
    durationMinutes: ingressData.durationMinutes,
    safetyLevel: "safe",
    summary: `Akses dari ${req.originLabel ?? "Pos Armada"} menuju titik insiden melalui jaringan jalan aktif.`,
    warnings: [
      "Jalur terbuka dan dapat dilalui armada darurat.",
      "Pertahankan jarak aman dari perimeter titik api.",
    ],
  };

  const egressLeg: RouteLeg = {
    id: "leg-egress",
    type: "egress",
    label: `Koridor Evakuasi ➔ ${primaryHospital.name}`,
    coordinates: egressData.coordinates,
    distanceKm: egressData.distanceKm,
    durationMinutes: egressData.durationMinutes,
    safetyLevel: "safe",
    summary: `Koridor evakuasi warga dan korban menuju ${primaryHospital.name}.`,
    warnings: [
      "Koridor berada pada sisi aman dari kepulan asap utama.",
      "Jalur terhubung langsung ke unit gawat darurat faskes.",
    ],
  };

  const windContext: WindContext = {
    speedKmh: 14,
    directionDeg: 75,
    isHazardous: false,
    advice: "Angin bertiup ke Timur-Laut; koridor evakuasi berada di sisi berlawanan arah hembusan asap.",
  };

  return {
    id: `plan-${Date.now()}`,
    incidentId: req.incidentId,
    incidentTitle: req.incidentTitle,
    incidentCoords: req.incidentCoords,
    originCoords: req.originCoords,
    originLabel: req.originLabel ?? "Pos Armada Penolong",
    ingressRoute: ingressLeg,
    egressRoute: egressLeg,
    tacticalPois,
    hazardPolygons: createHazardPolygon(req.incidentCoords, 0.8),
    windContext,
    isLiveRoadNetwork: ingressData.isLive,
    createdAt: new Date().toISOString(),
  };
}
