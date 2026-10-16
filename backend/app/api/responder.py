"""Tactical routes for responders: in to an incident, then out to the nearest safe hospital,
with the assembly points and large mosques, fields, schools and halls nearby (evac_site, filled
by ingest/evac_sites.py) listed beside it. Read from the database only, never Overpass.

Both legs are routed over the OSM road network (Valhalla), asked to avoid active
hazards: 800 m around hotspots of the last 24 hours and BMKG warnings in force.
Every route is then checked against those hazards in PostGIS, so `safety_level`
says what the line actually crosses, including when Valhalla could not avoid them
and the answer came from OSRM instead.
"""
import json
import logging
import math
import re

import httpx
from fastapi import APIRouter, HTTPException

from ..config import IDN_BBOX
from ..db import query, query_one
from .schemas import ErrorResponse, ResponderRoute, ResponderRouteIn

log = logging.getLogger(__name__)
router = APIRouter()

VALHALLA_ROUTE = "https://valhalla1.openstreetmap.de/route"
OSRM_ROUTE = "https://router.project-osrm.org/route/v1/driving"
HEADERS = {"User-Agent": "Arkamap/0.6 (environmental monitoring; JOINTS UGM 2026)"}

FIRE_BUFFER_M = 800
HAZARD_RADIUS_M = 15_000      # hazards around the incident worth routing around
HOSPITAL_RADIUS_M = 30_000
SHELTER_RADIUS_M = 5_000      # evacuees walk or are driven a short way to a shelter
# Tagged amenity=clinic in OSM but no place to take a casualty.
NOT_CARE = re.compile(r"laborator|apotek|optik|farmasi", re.I)
# Valhalla refuses a request whose exclusion rings add up to more than this
# perimeter (its default service limit), so the nearest hazards go first.
MAX_EXCLUDE_PERIMETER_M = 10_000
HAZARDOUS_WIND_KMH = 25       # strong enough to push fire and smoke noticeably

COMPASS = ["Utara", "Timur Laut", "Timur", "Tenggara", "Selatan", "Barat Daya", "Barat", "Barat Laut"]


def decode_polyline6(encoded: str) -> list[list[float]]:
    """Valhalla's precision-6 polyline as GeoJSON [[lon, lat], ...]."""
    coords: list[list[float]] = []
    index = lat = lon = 0
    while index < len(encoded):
        values = []
        for _ in range(2):
            result, shift = 1, 0
            while True:
                b = ord(encoded[index]) - 63 - 1
                index += 1
                result += b << shift
                shift += 5
                if b < 0x1F:
                    break
            values.append(~(result >> 1) if result & 1 else result >> 1)
        lat += values[0]
        lon += values[1]
        coords.append([round(lon * 1e-6, 6), round(lat * 1e-6, 6)])
    return coords


def bearing(a: list[float], b: list[float]) -> float:
    """Initial compass bearing from a to b, degrees clockwise from north."""
    lon1, lat1, lon2, lat2 = map(math.radians, (a[0], a[1], b[0], b[1]))
    y = math.sin(lon2 - lon1) * math.cos(lat2)
    x = math.cos(lat1) * math.sin(lat2) - math.sin(lat1) * math.cos(lat2) * math.cos(lon2 - lon1)
    return (math.degrees(math.atan2(y, x)) + 360) % 360


def compass(deg: float) -> str:
    return COMPASS[round(deg / 45) % 8]


def is_downwind(incident: list[float], target: list[float], wind_from: float | None) -> bool:
    """True when the target lies within 90° of where the wind carries smoke from the incident."""
    if wind_from is None:
        return False
    toward = (wind_from + 180) % 360
    diff = abs((bearing(incident, target) - toward + 180) % 360 - 180)
    return diff < 90


def _in_indonesia(point: list[float]) -> bool:
    w, s, e, n = IDN_BBOX
    return w <= point[0] <= e and s <= point[1] <= n


# ── hazards ──────────────────────────────────────────────────────────────
def hazards(incident: list[float]) -> list[dict]:
    """Active hazard polygons near the incident, nearest first: one per merged fire
    zone and one per weather warning, each with its perimeter for Valhalla's limit."""
    point = "ST_SetSRID(ST_MakePoint(%(lon)s, %(lat)s), 4326)"
    rows = query(
        f"""
        WITH fire AS (
            SELECT (ST_Dump(ST_Union(ST_Buffer(geom::geography, %(buffer)s)::geometry))).geom AS g
            FROM observation
            WHERE metric = 'hotspot' AND observed_at > now() - interval '24 hours'
              AND attrs->>'confidence' IS DISTINCT FROM 'low'
              AND ST_DWithin(geom::geography, {point}::geography, %(radius)s)
        ), zones AS (
            SELECT 'fire_buffer' AS kind, g FROM fire
            UNION ALL
            SELECT 'weather_warning', (ST_Dump(geom)).geom FROM weather_warning
            WHERE expires > now() AND ST_DWithin(geom::geography, {point}::geography, %(radius)s)
        )
        SELECT kind, ST_AsGeoJSON(ST_SimplifyPreserveTopology(g, 0.0003), 6) AS gj,
               ST_Perimeter(g::geography) AS perimeter_m
        FROM zones
        WHERE ST_GeometryType(g) = 'ST_Polygon'
        ORDER BY ST_Distance(g::geography, {point}::geography)
        """,
        {"lon": incident[0], "lat": incident[1], "buffer": FIRE_BUFFER_M, "radius": HAZARD_RADIUS_M},
    )
    return [{"kind": r["kind"], "geometry": json.loads(r["gj"]), "perimeter_m": r["perimeter_m"]} for r in rows]


def _contains(zone: dict, point: list[float]) -> bool:
    row = query_one("SELECT ST_Contains(ST_GeomFromGeoJSON(%s), ST_SetSRID(ST_MakePoint(%s, %s), 4326)) AS c",
                    (json.dumps(zone["geometry"]), point[0], point[1]))
    return bool(row and row["c"])


def avoidable(zones: list[dict], start: list[float], end: list[float]) -> list[dict]:
    """Zones a leg can route around: not the ones its own ends sit in (the incident
    is usually inside its fire's buffer, and responders still have to get there)."""
    return [z for z in zones if not _contains(z, start) and not _contains(z, end)]


def crossed(coords: list[list[float]], zones: list[dict]) -> set[str]:
    """Kinds of hazard the route line passes through."""
    if not zones or len(coords) < 2:
        return set()
    line = json.dumps({"type": "LineString", "coordinates": coords})
    kinds = set()
    for z in zones:
        row = query_one("SELECT ST_Intersects(ST_GeomFromGeoJSON(%s), ST_GeomFromGeoJSON(%s)) AS hit",
                        (line, json.dumps(z["geometry"])))
        if row and row["hit"]:
            kinds.add(z["kind"])
    return kinds


# ── routing ──────────────────────────────────────────────────────────────
def _exclusion_rings(zones: list[dict]) -> list[list[list[float]]]:
    rings, total = [], 0.0
    for z in zones:
        if total + z["perimeter_m"] > MAX_EXCLUDE_PERIMETER_M:
            continue
        rings.append(z["geometry"]["coordinates"][0])
        total += z["perimeter_m"]
    return rings


def _valhalla(start: list[float], end: list[float], rings: list) -> tuple[list[list[float]], float, int] | None:
    req = {"locations": [{"lat": start[1], "lon": start[0]}, {"lat": end[1], "lon": end[0]}],
           "costing": "auto", "directions_options": {"units": "kilometers"}}
    if rings:
        req["exclude_polygons"] = rings
    try:
        r = httpx.post(VALHALLA_ROUTE, json=req, timeout=12, headers=HEADERS)
        r.raise_for_status()
        trip = r.json()["trip"]
        coords = [c for leg in trip["legs"] for c in decode_polyline6(leg["shape"])]
        return coords, round(trip["summary"]["length"], 1), max(1, round(trip["summary"]["time"] / 60))
    except Exception as exc:  # noqa: BLE001
        log.warning("valhalla route gagal: %s", exc)
        return None


def _osrm(start: list[float], end: list[float]) -> tuple[list[list[float]], float, int] | None:
    url = f"{OSRM_ROUTE}/{start[0]},{start[1]};{end[0]},{end[1]}"
    try:
        r = httpx.get(url, params={"overview": "full", "geometries": "geojson"}, timeout=8, headers=HEADERS)
        r.raise_for_status()
        route = r.json()["routes"][0]
        return (route["geometry"]["coordinates"], round(route["distance"] / 1000, 1),
                max(1, round(route["duration"] / 60)))
    except Exception as exc:  # noqa: BLE001
        log.warning("osrm route gagal: %s", exc)
        return None


def route_leg(start: list[float], end: list[float], zones: list[dict]) -> dict:
    """One leg, routed around the zones it can avoid and labelled by what it still crosses."""
    avoid = avoidable(zones, start, end)
    rings = _exclusion_rings(avoid)
    warnings: list[str] = []
    found = _valhalla(start, end, rings)
    if found is None and rings:
        # unreachable with the exclusions (or over Valhalla's limit): a route that warns beats none
        found = _valhalla(start, end, [])
    if found is None:
        found = _osrm(start, end)
        if found:
            warnings.append("Rute dari OSRM tanpa penghindaran zona bahaya; periksa kondisi lapangan.")
    if found is None:
        raise HTTPException(502, "layanan rute jalan tidak merespons; coba lagi nanti")
    coords, distance_km, minutes = found

    hit = crossed(coords, avoid)
    if "fire_buffer" in hit:
        level = "critical"
        warnings.append(f"Rute melewati radius {FIRE_BUFFER_M} m titik panas 24 jam terakhir.")
    elif hit:
        level = "caution"
        warnings.append("Rute melewati wilayah peringatan cuaca BMKG yang masih berlaku.")
    else:
        level = "caution" if warnings else "safe"
        if not warnings:
            warnings.append("Jalur tidak melewati zona titik panas maupun peringatan cuaca aktif."
                            if avoid else "Tidak ada zona bahaya aktif di sekitar jalur.")
    if len(avoid) < len(zones) and any(z["kind"] == "fire_buffer" for z in zones if z not in avoid):
        warnings.append("Ujung jalur berada di dalam zona titik panas; masuk dengan perlengkapan pelindung.")
    return {"coordinates": coords, "distance_km": distance_km, "duration_minutes": minutes,
            "safety_level": level, "warnings": warnings}


# ── facilities and wind ──────────────────────────────────────────────────
def _nearby(incident: list[float], amenities: list[str], radius: int, limit: int) -> list[dict]:
    """Stored footprints with one of `amenities` within `radius`, nearest first."""
    if not query_one("SELECT to_regclass('building') IS NOT NULL AS ok")["ok"]:
        return []
    rows = query(
        """
        SELECT osm_id, name, amenity, ST_X(ST_Centroid(geom)) AS lon, ST_Y(ST_Centroid(geom)) AS lat,
               ST_Distance(geom::geography, ST_SetSRID(ST_MakePoint(%(lon)s, %(lat)s), 4326)::geography) AS dist
        FROM building
        WHERE amenity = ANY(%(amenities)s)
          AND ST_DWithin(geom::geography, ST_SetSRID(ST_MakePoint(%(lon)s, %(lat)s), 4326)::geography, %(r)s)
        ORDER BY dist LIMIT %(limit)s
        """,
        {"lon": incident[0], "lat": incident[1], "r": radius, "amenities": amenities, "limit": limit},
    )
    return [{"id": f"osm-way-{r['osm_id']}", "name": r["name"], "amenity": r["amenity"],
             "coords": [round(r["lon"], 6), round(r["lat"], 6)], "distance_meters": round(r["dist"])}
            for r in rows]


def _evac_sites(incident: list[float], kinds: list[str], radius: int, limit: int) -> list[dict]:
    """Sites from evac_site (filled by ingest/evac_sites.py) within `radius`; official assembly
    points first, then nearest."""
    if not query_one("SELECT to_regclass('evac_site') IS NOT NULL AS ok")["ok"]:
        return []
    rows = query(
        """
        SELECT osm_id, kind, name, note, ST_X(geom) AS lon, ST_Y(geom) AS lat,
               ST_Distance(geom::geography, ST_SetSRID(ST_MakePoint(%(lon)s, %(lat)s), 4326)::geography) AS dist
        FROM evac_site
        WHERE kind = ANY(%(kinds)s)
          AND ST_DWithin(geom::geography, ST_SetSRID(ST_MakePoint(%(lon)s, %(lat)s), 4326)::geography, %(r)s)
        ORDER BY kind = 'assembly' DESC, dist LIMIT %(limit)s
        """,
        {"lon": incident[0], "lat": incident[1], "kinds": kinds, "r": radius, "limit": limit},
    )
    return [{"id": f"osm-{r['osm_id'].replace('/', '-')}", "name": r["name"],
             "amenity": "hospital" if r["kind"] == "hospital" else r["kind"], "note": r["note"],
             "coords": [round(r["lon"], 6), round(r["lat"], 6)], "distance_meters": round(r["dist"])}
            for r in rows]


def hospitals(incident: list[float]) -> list[dict]:
    """Hospitals near the incident, nearest first, from the stored sites and the city
    footprints (which also hold clinics). Labs and pharmacies tagged as clinics are left out.
    Read from the database only: a live Overpass call here outlasted the frontend's wait."""
    found: dict[str, dict] = {}
    for h in _evac_sites(incident, ["hospital"], HOSPITAL_RADIUS_M, 12) + _nearby(incident, ["hospital", "clinic"], HOSPITAL_RADIUS_M, 12):
        found.setdefault(h["name"] or h["id"], h)   # the same hospital can sit in both tables
    care = [h for h in found.values() if not NOT_CARE.search(h["name"] or "")]
    return sorted(care, key=lambda h: h["distance_meters"])[:8]


def shelters(incident: list[float], zones: list[dict]) -> list[dict]:
    """Assembly points and the large mosques, fields, schools and halls near the incident and
    outside the hazards: official assembly points first, then nearest."""
    found = _evac_sites(incident, ["assembly", "field", "worship", "school", "hall"], SHELTER_RADIUS_M, 20)
    return [s for s in found if not any(_contains(z, s["coords"]) for z in zones)][:5]


def _safe(incident: list[float], h: dict, zones: list[dict], wind_from: float | None) -> bool:
    return not is_downwind(incident, h["coords"], wind_from) and not any(_contains(z, h["coords"]) for z in zones)


def pick_hospital(incident: list[float], options: list[dict], zones: list[dict], wind_from: float | None) -> dict:
    """The nearest safe hospital (outside every hazard, not downwind), then the nearest safe clinic,
    else the nearest of all: a casualty needs a hospital more than the closest clinic."""
    safe = [h for h in options if _safe(incident, h, zones, wind_from)]
    return next((h for h in safe if h["amenity"] == "hospital"), None) or (safe or options)[0]


def wind_at(point: list[float]) -> dict | None:
    row = query_one(
        "SELECT direction, speed FROM wind_grid"
        " ORDER BY (lon - %s) ^ 2 + (lat - %s) ^ 2 LIMIT 1",
        (point[0], point[1]),
    ) if query_one("SELECT to_regclass('wind_grid') IS NOT NULL AS ok")["ok"] else None
    if not row:
        return None
    speed, direction = round(row["speed"], 1), round(row["direction"], 1)
    hazardous = speed >= HAZARDOUS_WIND_KMH
    toward = compass((direction + 180) % 360)
    advice = (f"Angin bertiup ke arah {toward}; asap terbawa ke sana, jadi koridor evakuasi menghindari sisi itu."
              + (" Angin kencang dapat mempercepat rambatan api." if hazardous else ""))
    return {"speed_kmh": speed, "direction_deg": direction, "is_hazardous": hazardous, "advice": advice}


def _note(h: dict) -> str:
    return h.get("note") or ("Klinik" if h["amenity"] == "clinic" else "Rumah sakit")


def _label(h: dict) -> str:
    return h["name"] or f"{_note(h)} tanpa nama"


# ── endpoint ─────────────────────────────────────────────────────────────
@router.post("/responder/route", response_model=ResponderRoute,
             responses={400: {"model": ErrorResponse}, 404: {"model": ErrorResponse}, 502: {"model": ErrorResponse}})
def responder_route(body: ResponderRouteIn) -> dict:
    """Ingress from the responder's position to the incident, and an evacuation corridor
    from the incident to the nearest hospital outside the hazards and upwind of the
    smoke, with the hazards and the wind used to choose them."""
    origin, incident = body.origin, body.incident
    if not (_in_indonesia(origin) and _in_indonesia(incident)):
        raise HTTPException(400, "koordinat asal atau kejadian di luar Indonesia")

    zones = hazards(incident)
    wind = wind_at(incident)
    options = hospitals(incident)
    if not options:
        raise HTTPException(404, f"belum ada data rumah sakit atau klinik dalam {HOSPITAL_RADIUS_M // 1000} km dari kejadian;"
                                 " titik evakuasi wilayah ini mungkin belum selesai diambil")
    target = pick_hospital(incident, options, zones, wind and wind["direction_deg"])

    ingress = route_leg(origin, incident, zones)
    ingress["summary"] = {
        "safe": "Akses armada masuk melalui jalur yang tidak melewati zona bahaya aktif.",
        "caution": "Akses armada masuk; periksa peringatan pada jalur sebelum berangkat.",
        "critical": "Akses armada masuk melewati zona titik panas; pertimbangkan jalur lain.",
    }[ingress["safety_level"]]

    egress = route_leg(incident, target["coords"], zones)
    name = _label(target)
    egress["summary"] = f"Koridor evakuasi warga menuju {name}."
    egress["target_poi"] = {"name": name, "type": "hospital", "coords": target["coords"]}
    if wind:
        egress["warnings"].append(
            "Faskes tujuan searah hembusan asap; tidak ada faskes lain di sisi aman."
            if is_downwind(incident, target["coords"], wind["direction_deg"]) else
            "Faskes tujuan berada di sisi berlawanan dari hembusan asap (upwind).")

    pois = [{"id": h["id"], "name": _label(h), "type": kind, "coords": h["coords"],
             "distance_meters": h["distance_meters"], "note": _note(h)}
            # the target always shows, even when five nearer clinics fill the list
            for kind, group in (("hospital", options[:5] + ([target] if target not in options[:5] else [])),
                                ("shelter", shelters(incident, zones))) for h in group]
    hazard_fc = {"type": "FeatureCollection", "features": [
        {"type": "Feature", "geometry": z["geometry"],
         "properties": {"hazard_type": z["kind"], **({"radius_meters": FIRE_BUFFER_M} if z["kind"] == "fire_buffer" else {})}}
        for z in zones]}
    return {"ingress": ingress, "egress": egress, "pois": pois, "hazard_polygons": hazard_fc, "wind": wind}
