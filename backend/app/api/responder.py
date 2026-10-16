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
NOT_CARE = re.compile(r"laborator|apot[ei]k|optik|farmasi|pharmacy", re.I)
# Evacuees go to a general hospital big enough to take them, never an eye, ENT or maternity
# hospital. ponytail: name patterns plus footprint; OSM's healthcare:speciality would be firmer.
SPECIALTY = re.compile(r"khusus|\bRSKI?A?\b|\bRSIA\b|\bRSB\b|ibu (dan|&) anak|bersalin|\bTHT\b|\bmata\b|gigi|jiwa"
                       r"|bedah|kanker|onkologi|\bparu\b|ortopedi|kulit|jantung|\bginjal\b", re.I)
GENERAL = re.compile(r"\bRSU[DP]?\b|rumah sakit umum|\bRS umum\b", re.I)
MAJOR_HOSPITAL_M2 = 5_000
# The routed incident's own reach when it is not a fire (fires already bring their hotspot buffers).
# ponytail: fixed radii per kind; a flood or quake footprint from the source would replace them.
INCIDENT_ZONE_M = {"flood": 1_500, "seismic": 2_000, "disaster": 1_000}
EXIT_DISTANCE_M = 3_000       # no hospital to go to: how far out the fallback safe point lies
# Valhalla refuses a request whose exclusion rings add up to more than this
# perimeter (its default service limit), so the nearest hazards go first.
MAX_EXCLUDE_PERIMETER_M = 10_000
HAZARDOUS_WIND_KMH = 25       # strong enough to push fire and smoke noticeably
# A fire reported by a device: where its flames and smoke go, a sector downwind of it. It starts
# just beside the device so the evacuation can still leave from there.
# ponytail: fixed sector; a spread model (fuel, slope, wind speed) would size it per fire.
PLUME_START_M, PLUME_END_M, PLUME_HALF_DEG = 200, 2_000, 30

ENTER_FIRE = "Ujung jalur berada di dalam zona titik panas; masuk dengan perlengkapan pelindung."

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
    elif "smoke_plume" in hit:
        level = "critical"
        warnings.append("Rute melewati arah rambatan api dan asap (searah angin dari alat).")
    elif hit:
        level = "caution"
        warnings.append("Rute melewati wilayah peringatan cuaca BMKG yang masih berlaku.")
    else:
        level = "caution" if warnings else "safe"
        if not warnings:
            warnings.append("Jalur tidak melewati zona titik panas maupun peringatan cuaca aktif."
                            if avoid else "Tidak ada zona bahaya aktif di sekitar jalur.")
    if len(avoid) < len(zones) and any(z["kind"] == "fire_buffer" for z in zones if z not in avoid):
        warnings.append(ENTER_FIRE)
    return {"coordinates": coords, "distance_km": distance_km, "duration_minutes": minutes,
            "safety_level": level, "warnings": warnings}


# ── facilities and wind ──────────────────────────────────────────────────
def _nearby(incident: list[float], amenities: list[str], radius: int, limit: int) -> list[dict]:
    """Stored footprints with one of `amenities` within `radius`, nearest first."""
    if not query_one("SELECT to_regclass('building') IS NOT NULL AS ok")["ok"]:
        return []
    rows = query(
        """
        SELECT osm_id, name, amenity, area_m2, ST_X(ST_Centroid(geom)) AS lon, ST_Y(ST_Centroid(geom)) AS lat,
               ST_Distance(geom::geography, ST_SetSRID(ST_MakePoint(%(lon)s, %(lat)s), 4326)::geography) AS dist
        FROM building
        WHERE amenity = ANY(%(amenities)s)
          AND ST_DWithin(geom::geography, ST_SetSRID(ST_MakePoint(%(lon)s, %(lat)s), 4326)::geography, %(r)s)
        ORDER BY dist LIMIT %(limit)s
        """,
        {"lon": incident[0], "lat": incident[1], "r": radius, "amenities": amenities, "limit": limit},
    )
    return [{"id": f"osm-way-{r['osm_id']}", "name": r["name"], "amenity": r["amenity"],
             "coords": [round(r["lon"], 6), round(r["lat"], 6)], "distance_meters": round(r["dist"]),
             "area_m2": r["area_m2"]}
            for r in rows]


def _evac_sites(incident: list[float], kinds: list[str], radius: int, limit: int) -> list[dict]:
    """Sites from evac_site (filled by ingest/evac_sites.py) within `radius`; official assembly
    points first, then nearest."""
    if not query_one("SELECT to_regclass('evac_site') IS NOT NULL AS ok")["ok"]:
        return []
    rows = query(
        """
        SELECT osm_id, kind, name, note, area_m2, ST_X(geom) AS lon, ST_Y(geom) AS lat,
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
             "coords": [round(r["lon"], 6), round(r["lat"], 6)], "distance_meters": round(r["dist"]),
             "area_m2": r["area_m2"]}
            for r in rows]


def hospitals(incident: list[float]) -> list[dict]:
    """Hospitals and clinics near the incident, nearest first, from the stored sites and the city
    footprints (which also hold clinics). Labs and pharmacies tagged as clinics are left out.
    Read from the database only: a live Overpass call here outlasted the frontend's wait."""
    found: dict[str, dict] = {}
    for h in _evac_sites(incident, ["hospital"], HOSPITAL_RADIUS_M, 40) + _nearby(incident, ["hospital", "clinic"], HOSPITAL_RADIUS_M, 40):
        found.setdefault(h["name"] or h["id"], h)   # the same hospital can sit in both tables
    care = [h for h in found.values() if not NOT_CARE.search(h["name"] or "")]
    return sorted(care, key=lambda h: h["distance_meters"])


def is_major(h: dict) -> bool:
    """A general hospital that can take evacuees: not a specialty one, and large or named as general."""
    name = h["name"] or ""
    return (h["amenity"] == "hospital" and not SPECIALTY.search(name)
            and ((h.get("area_m2") or 0) >= MAJOR_HOSPITAL_M2 or bool(GENERAL.search(name))))


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


def _circle(point: list[float], radius: int, kind: str) -> dict:
    row = query_one(
        "SELECT ST_AsGeoJSON(g, 6) AS gj, ST_Perimeter(g::geography) AS perimeter_m FROM ("
        " SELECT ST_Buffer(ST_SetSRID(ST_MakePoint(%s, %s), 4326)::geography, %s, 16)::geometry AS g) b",
        (point[0], point[1], radius),
    )
    return {"kind": kind, "geometry": json.loads(row["gj"]), "perimeter_m": row["perimeter_m"], "radius_m": radius}


def incident_zone(incident: list[float], hazard_type: str | None) -> dict | None:
    """The routed incident's own reach as a hazard zone, so evacuation leaves it."""
    radius = INCIDENT_ZONE_M.get(hazard_type or "")
    return _circle(incident, radius, "incident_zone") if radius else None


def meters(a: list[float], b: list[float]) -> float:
    """Great-circle distance between two [lon, lat] points."""
    lon1, lat1, lon2, lat2 = map(math.radians, (a[0], a[1], b[0], b[1]))
    h = math.sin((lat2 - lat1) / 2) ** 2 + math.cos(lat1) * math.cos(lat2) * math.sin((lon2 - lon1) / 2) ** 2
    return 2 * 6_371_000 * math.asin(math.sqrt(h))


def plume_zone(origin: list[float], wind_from: float | None) -> dict | None:
    """Where a fire at `origin` sends flames and smoke: a sector downwind, PLUME_START_M to
    PLUME_END_M out and PLUME_HALF_DEG either side. None without a wind reading."""
    if wind_from is None:
        return None
    toward = (wind_from + 180) % 360
    sides = range(-PLUME_HALF_DEG, PLUME_HALF_DEG + 1, 10)
    ring = ([destination(origin, toward + a, PLUME_START_M) for a in sides]
            + [destination(origin, toward + a, PLUME_END_M) for a in reversed(sides)])
    ring.append(ring[0])
    return {"kind": "smoke_plume", "geometry": {"type": "Polygon", "coordinates": [ring]},
            "perimeter_m": sum(meters(a, b) for a, b in zip(ring, ring[1:]))}


def destination(start: list[float], bearing_deg: float, meters: float) -> list[float]:
    """The point `meters` from `start` along `bearing_deg` on a sphere."""
    lat1, lon1, brg, d = math.radians(start[1]), math.radians(start[0]), math.radians(bearing_deg), meters / 6_371_000
    lat2 = math.asin(math.sin(lat1) * math.cos(d) + math.cos(lat1) * math.sin(d) * math.cos(brg))
    lon2 = lon1 + math.atan2(math.sin(brg) * math.sin(d) * math.cos(lat1), math.cos(d) - math.sin(lat1) * math.sin(lat2))
    return [round(math.degrees(lon2), 6), round(math.degrees(lat2), 6)]


def safe_exit(incident: list[float], zones: list[dict], wind_from: float | None, sites: list[dict]) -> dict:
    """Where to send evacuees when no general hospital is safe: an assembly point or open field on
    the safe side, else a point EXIT_DISTANCE_M out on land, as far from every hazard as the eight
    compass headings allow and never downwind (where smoke and fire travel)."""
    for site in sites:   # assembly points lead, then nearest
        if site["amenity"] in ("assembly", "field") and not is_downwind(incident, site["coords"], wind_from):
            return {"name": _label(site), "type": "shelter", "coords": site["coords"]}
    shapes = json.dumps({"type": "GeometryCollection", "geometries": [z["geometry"] for z in zones]})
    best, best_score = None, -math.inf
    for heading in range(0, 360, 45):
        point = destination(incident, heading, EXIT_DISTANCE_M)
        if is_downwind(incident, point, wind_from):
            continue
        row = query_one(
            "SELECT EXISTS (SELECT 1 FROM region WHERE level = 'kabkota' AND ST_Intersects(geom, p)) AS land,"
            " CASE WHEN %(n)s > 0 THEN ST_Distance(ST_GeomFromGeoJSON(%(z)s)::geography, p::geography) END AS clear"
            " FROM (SELECT ST_SetSRID(ST_MakePoint(%(lon)s, %(lat)s), 4326) AS p) q",
            {"z": shapes, "n": len(zones), "lon": point[0], "lat": point[1]},
        )
        if not row["land"]:
            continue
        # farthest from the hazards; with none to flee, straight upwind (or north) wins
        upwind = 180 - abs((heading - (wind_from or 0) + 180) % 360 - 180)
        score = (row["clear"] if row["clear"] is not None else 0) + upwind
        if score > best_score:
            best, best_score = (heading, point), score
    if best is None:
        # all at sea (a small island) or all downwind: the nearest shelter of any kind, else straight upwind
        if sites:
            return {"name": _label(sites[0]), "type": "shelter", "coords": sites[0]["coords"]}
        heading = wind_from or 0
        best = (heading, destination(incident, heading, EXIT_DISTANCE_M))
    heading, point = best
    return {"name": f"Titik aman {EXIT_DISTANCE_M // 1000} km ke arah {compass(heading)}", "type": "safe_point", "coords": point}


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
    if h.get("note") and h["amenity"] != "hospital":
        return h["note"]
    if h["amenity"] == "clinic":
        return "Klinik"
    return "Rumah sakit umum" if is_major(h) else "Rumah sakit (kecil/khusus)"


def _label(h: dict) -> str:
    return h["name"] or f"{_note(h)} tanpa nama"


# ── endpoint ─────────────────────────────────────────────────────────────
@router.post("/responder/route", response_model=ResponderRoute,
             responses={400: {"model": ErrorResponse}, 502: {"model": ErrorResponse}})
def responder_route(body: ResponderRouteIn) -> dict:
    """Ingress from the responder's position to the incident, and an evacuation corridor from
    the incident to the nearest general hospital outside the hazards and upwind of the smoke;
    with none, to an assembly point or a safe point away from the hazards. The incident's own
    reach (a flood, a quake) counts as a hazard, so evacuation leaves it for any kind of event."""
    origin, incident = body.origin, body.incident
    if not (_in_indonesia(origin) and _in_indonesia(incident)):
        raise HTTPException(400, "koordinat asal atau kejadian di luar Indonesia")

    zones = hazards(incident)
    own = incident_zone(incident, body.hazard_type)
    if own:
        zones = [own, *zones]
    wind = wind_at(incident)
    wind_from = wind and wind["direction_deg"]
    options = hospitals(incident)
    sites = shelters(incident, zones)

    ingress = route_leg(origin, incident, zones)
    ingress["summary"] = {
        "safe": "Akses armada masuk melalui jalur yang tidak melewati zona bahaya aktif.",
        "caution": "Akses armada masuk; periksa peringatan pada jalur sebelum berangkat.",
        "critical": "Akses armada masuk melewati zona titik panas; pertimbangkan jalur lain.",
    }[ingress["safety_level"]]

    major = next((h for h in options if is_major(h) and _safe(incident, h, zones, wind_from)), None)
    target = ({"name": _label(major), "type": "hospital", "coords": major["coords"]} if major
              else safe_exit(incident, zones, wind_from, sites))
    egress = route_leg(incident, target["coords"], zones)
    egress["target_poi"] = target
    if major:
        egress["summary"] = f"Koridor evakuasi warga menuju {target['name']}."
    else:
        egress["summary"] = (f"Tidak ada rumah sakit umum besar di sisi aman dalam {HOSPITAL_RADIUS_M // 1000} km;"
                             f" warga diarahkan menjauhi bahaya ke {target['name']}.")
        if options:
            egress["warnings"].append("Korban luka tetap dirujuk ke faskes terdekat di daftar tempat tujuan.")
    if wind:
        egress["warnings"].append(
            "Tujuan evakuasi searah hembusan asap; tidak ada tujuan lain di sisi aman."
            if is_downwind(incident, target["coords"], wind_from) else
            "Tujuan evakuasi berada di sisi berlawanan dari hembusan asap (upwind).")

    pois = _pois((("hospital", options[:5] + ([major] if major and major not in options[:5] else [])),
                  ("shelter", sites)))   # the target always shows, even when five nearer clinics fill the list
    return {"ingress": ingress, "egress": egress, "pois": pois, "hazard_polygons": _hazard_fc(zones), "wind": wind}


def _pois(groups) -> list[dict]:
    return [{"id": h["id"], "name": _label(h), "type": kind, "coords": h["coords"],
             "distance_meters": h["distance_meters"], "note": _note(h)}
            for kind, group in groups for h in group]


def _hazard_fc(zones: list[dict]) -> dict:
    return {"type": "FeatureCollection", "features": [
        {"type": "Feature", "geometry": z["geometry"],
         "properties": {"hazard_type": z["kind"], **({"radius_meters": FIRE_BUFFER_M} if z["kind"] == "fire_buffer" else {}),
                        **({"radius_meters": z["radius_m"]} if "radius_m" in z else {})}}
        for z in zones]}


def evacuate(point: list[float], fire: bool) -> dict:
    """Out from a point (an IoT device) on foot or by car, with no responders coming in.
    A fire: around the fire and out of its downwind sector, to an assembly point or open field
    that is not downwind, else a safe point away from the hazards. Anything else: the best road
    to the nearest assembly point (official ones first). Satellite fires and BMKG warnings
    around the point are avoided either way."""
    zones = hazards(point)
    wind = wind_at(point) if fire else None
    wind_from = wind and wind["direction_deg"]
    if fire:
        plume = plume_zone(point, wind_from)
        zones = [_circle(point, FIRE_BUFFER_M, "fire_buffer"), *([plume] if plume else []), *zones]
    sites = shelters(point, zones)
    if fire:
        target = safe_exit(point, zones, wind_from, sites)
    elif sites:
        target = {"name": _label(sites[0]), "type": "shelter", "coords": sites[0]["coords"]}
    else:
        target = safe_exit(point, zones, None, [])
    route = route_leg(point, target["coords"], zones)
    route["target_poi"] = target
    if fire:
        # the device sits in its own fire: nobody goes in, people get out
        route["warnings"] = [w for w in route["warnings"] if w != ENTER_FIRE]
        route["warnings"].insert(0, "Alat berada di zona api; segera keluar mengikuti jalur ini.")
        route["summary"] = (f"Kebakaran terdeteksi alat: evakuasi menjauhi api dan arah angin ke {target['name']}."
                            if wind else f"Kebakaran terdeteksi alat: evakuasi menjauhi api ke {target['name']}.")
        if not wind:
            route["warnings"].append("Arah angin belum diketahui; perhatikan ke mana asap bergerak.")
    else:
        route["summary"] = (f"Evakuasi ke titik kumpul {target['name']}." if sites else
                            f"Belum ada titik kumpul tercatat dalam {SHELTER_RADIUS_M // 1000} km; arahkan ke {target['name']}.")
    return {"fire": fire, "route": route, "pois": _pois((("shelter", sites),)),
            "hazard_polygons": _hazard_fc(zones), "wind": wind}
