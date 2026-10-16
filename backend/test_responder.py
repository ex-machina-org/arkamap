"""Responder routing (api/responder.py): polyline decoding, wind side, hazard
avoidance, hospital choice and shelters, with the road routers replaced by stubs.

Needs PostGIS; it adds rows around 116.8 E, 1.25 S and removes them again:
    DATABASE_URL=postgresql://t:t@127.0.0.1:55499/t python test_responder.py
"""
import sys
from datetime import datetime, timedelta, timezone
sys.path.insert(0, ".")
from fastapi import HTTPException

from app.api import responder as rr
from app.api.schemas import ResponderRoute, ResponderRouteIn
from app.db import apply_schema, conn, init_pool
from app.ingest.buildings_prewarm import _ensure_tables


def encode6(coords):
    """Reference precision-6 encoder (Google's algorithm), for the round trip."""
    out, plat, plon = [], 0, 0
    for lon, lat in coords:
        for v, p in ((round(lat * 1e6), plat), (round(lon * 1e6), plon)):
            d = v - p
            d = ~(d << 1) if d < 0 else d << 1
            while d >= 0x20:
                out.append(chr((0x20 | (d & 0x1F)) + 63))
                d >>= 5
            out.append(chr(d + 63))
        plat, plon = round(lat * 1e6), round(lon * 1e6)
    return "".join(out)


# ── pure helpers ─────────────────────────────────────────────────────────
path = [[116.828512, -1.265401], [116.83101, -1.263], [116.865403, -1.242108]]
assert rr.decode_polyline6(encode6(path)) == path
assert rr.decode_polyline6("") == []
assert round(rr.bearing([0, 0], [0, 1])) == 0 and round(rr.bearing([0, 0], [1, 0])) == 90
assert rr.compass(225) == "Barat Daya"
# wind from the west (270) carries smoke east: a hospital to the east is downwind, one to the west is not
assert rr.is_downwind([116.8, -1.2], [116.9, -1.2], 270)
assert not rr.is_downwind([116.8, -1.2], [116.7, -1.2], 270)
assert not rr.is_downwind([116.8, -1.2], [116.9, -1.2], None)

# ── against PostGIS ──────────────────────────────────────────────────────
init_pool(); apply_schema(); _ensure_tables()
now = datetime.now(timezone.utc)
INCIDENT, ORIGIN = [116.865, -1.242], [116.8285, -1.2654]
WEST_H, EAST_H = [116.835, -1.242], [116.885, -1.242]   # hospitals 3.3 km west and 2.2 km east
BLOCK = [116.848, -1.2535]                              # a second fire between origin and incident
WEST_C, LAB = [116.855, -1.242], [116.875, -1.242]      # a clinic 1.1 km upwind, a lab 1.1 km east
MOSQUE, SCHOOL = [116.865, -1.230], [116.866, -1.2425]  # a mosque 1.3 km north; a school inside the fire
FIELD = [116.870, -1.250]                              # a field 1 km south-east, farther than the mosque
TEST_IDS = "(990001, 990002, 990003, 990004)"


def cleanup(cur):
    cur.execute("DELETE FROM observation WHERE metric = 'hotspot' AND attrs->>'test' = 'responder'")
    cur.execute(f"DELETE FROM building WHERE osm_id IN {TEST_IDS}")
    cur.execute("DELETE FROM evac_site WHERE osm_id LIKE 'test/%'")
    cur.execute("DELETE FROM wind_grid WHERE lon = 116.86 AND lat = -1.24")


def square(lon, lat, d=0.0004):
    return f"ST_MakeEnvelope({lon - d},{lat - d},{lon + d},{lat + d},4326)"


with conn() as c, c.cursor() as cur:
    cleanup(cur)
    cur.execute("INSERT INTO source (id, aspect, title, publisher, url, license, cadence, is_modelled)"
                " VALUES ('firms_viirs','lingkungan','x','x','x','x','x',false) ON CONFLICT DO NOTHING")
    for lon, lat, conf in ((*INCIDENT, "nominal"), (*BLOCK, "high"), (116.80, -1.20, "low")):
        cur.execute("INSERT INTO observation (source_id, metric, observed_at, value, attrs, geom) VALUES"
                    " ('firms_viirs','hotspot',%s,10,jsonb_build_object('confidence',%s::text,'test','responder'),"
                    " ST_SetSRID(ST_MakePoint(%s,%s),4326))", (now - timedelta(hours=2), conf, lon, lat))
    cur.execute(f"INSERT INTO building (osm_id, kind, building, name, amenity, area_m2, geom) VALUES"
                f" (990001,'kesehatan','hospital','RSUD Barat','hospital',900,{square(*WEST_H)}),"
                f" (990002,'kesehatan','hospital','RS Timur','hospital',900,{square(*EAST_H)}),"
                f" (990003,'kesehatan','yes','Klinik Barat','clinic',200,{square(*WEST_C)}),"
                f" (990004,'kesehatan','yes','Laboratorium Klinik Timur','clinic',200,{square(*LAB)})")
    # evac_site: the west hospital again (stored by both tables, listed once), a large mosque,
    # a school inside the fire, and an official assembly point that outranks the nearer mosque
    for osm_id, kind, name, note, (lon, lat) in (
            ("test/1", "hospital", "RSUD Barat", "Rumah sakit", WEST_H), ("test/2", "worship", "Masjid Utara", "Masjid", MOSQUE),
            ("test/3", "school", "SD Dekat Api", "Sekolah", SCHOOL), ("test/4", "assembly", "Lapangan Desa", "Titik kumpul", FIELD)):
        cur.execute("INSERT INTO evac_site (osm_id, kind, name, note, fetched_at, geom)"
                    " VALUES (%s,%s,%s,%s,now(),ST_SetSRID(ST_MakePoint(%s,%s),4326))", (osm_id, kind, name, note, lon, lat))
    # wind from the west: smoke drifts east, so the nearer east hospital is downwind
    cur.execute("INSERT INTO wind_grid (lon, lat, direction, speed, observed_at) VALUES (116.86,-1.24,270,30,%s)", (now,))

try:
    zones = rr.hazards(INCIDENT)
    assert [z["kind"] for z in zones].count("fire_buffer") == 2, zones   # low confidence skipped
    assert len(rr.avoidable(zones, ORIGIN, INCIDENT)) == 1               # the incident's own fire stays reachable

    straight = lambda s, e: ([s, e], 4.0, 6)
    calls = []

    def valhalla(s, e, rings):
        calls.append(len(rings))
        # with exclusions the stub detours north of the blocking fire; without, it cuts straight through
        return ([s, [116.848, -1.235], e], 5.1, 8) if rings else straight(s, e)

    rr._valhalla, rr._osrm = valhalla, lambda s, e: None
    out = ResponderRoute(**rr.responder_route(ResponderRouteIn(origin=ORIGIN, incident=INCIDENT))).model_dump()
    assert calls[0] == 1, calls
    assert out["ingress"]["safety_level"] == "safe", out["ingress"]
    assert any("perlengkapan" in w for w in out["ingress"]["warnings"])
    # upwind and a hospital: farther than the upwind clinic, and the downwind RS Timur is passed over
    assert out["egress"]["target_poi"]["name"] == "RSUD Barat", out["egress"]
    assert any("upwind" in w for w in out["egress"]["warnings"])
    # the lab is no care facility; the school sits in the fire; the assembly point leads the shelters
    assert [(p["type"], p["name"]) for p in out["pois"]] == [
        ("hospital", "Klinik Barat"), ("hospital", "RS Timur"), ("hospital", "RSUD Barat"),
        ("shelter", "Lapangan Desa"), ("shelter", "Masjid Utara")], out["pois"]
    assert [p["note"] for p in out["pois"][-2:]] == ["Titik kumpul", "Masjid"]
    assert out["wind"]["is_hazardous"] and "Timur" in out["wind"]["advice"]
    assert {f["properties"]["hazard_type"] for f in out["hazard_polygons"]["features"]} == {"fire_buffer"}

    # Valhalla down: OSRM's straight answer crosses the blocking fire and is labelled critical
    rr._valhalla, rr._osrm = lambda s, e, rings: None, straight
    leg = rr.route_leg(ORIGIN, INCIDENT, zones)
    assert leg["safety_level"] == "critical" and any("OSRM" in w for w in leg["warnings"]), leg

    rr._osrm = lambda s, e: None
    try:
        rr.route_leg(ORIGIN, INCIDENT, zones)
        raise AssertionError("expected 502")
    except HTTPException as exc:
        assert exc.status_code == 502

    try:
        rr.responder_route(ResponderRouteIn(origin=[150.0, -1.0], incident=INCIDENT))
        raise AssertionError("expected 400")
    except HTTPException as exc:
        assert exc.status_code == 400
finally:
    with conn() as c, c.cursor() as cur:
        cleanup(cur)

print("ok")
