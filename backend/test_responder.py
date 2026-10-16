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
from app.api.schemas import EvacuationRoute, ResponderRoute, ResponderRouteIn
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
# a device's fire: a sector downwind (wind from the west -> east), 0.2-2 km out, closed ring
assert rr.plume_zone([116.8, -1.2], None) is None
plume = rr.plume_zone([116.8, -1.2], 270)
ring = plume["geometry"]["coordinates"][0]
assert ring[0] == ring[-1] and all(rr.is_downwind([116.8, -1.2], p, 270) for p in ring)
assert all(190 < rr.meters([116.8, -1.2], p) < 2010 for p in ring)
assert plume["perimeter_m"] < rr.MAX_EXCLUDE_PERIMETER_M

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
    cur.execute("DELETE FROM region WHERE id = 'test.kab'")
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
    # a pharmacy mistagged as a hospital, right at the incident: never the evacuation target
    cur.execute("INSERT INTO evac_site (osm_id, kind, name, note, fetched_at, geom) VALUES ('test/5','hospital',"
                "'condong catur apotik','Rumah sakit',now(),ST_SetSRID(ST_MakePoint(%s,%s),4326))", INCIDENT)
    # evac_site: the west hospital again (stored by both tables, listed once), a large mosque,
    # a school inside the fire, and an official assembly point that outranks the nearer mosque
    for osm_id, kind, name, note, (lon, lat) in (
            ("test/1", "hospital", "RSUD Barat", "Rumah sakit", WEST_H), ("test/2", "worship", "Masjid Utara", "Masjid", MOSQUE),
            ("test/3", "school", "SD Dekat Api", "Sekolah", SCHOOL), ("test/4", "assembly", "Lapangan Desa", "Titik kumpul", FIELD)):
        cur.execute("INSERT INTO evac_site (osm_id, kind, name, note, fetched_at, geom)"
                    " VALUES (%s,%s,%s,%s,now(),ST_SetSRID(ST_MakePoint(%s,%s),4326))", (osm_id, kind, name, note, lon, lat))
    # land around the incident, so a fallback safe point is not put at sea
    cur.execute("INSERT INTO region (id, name, level, geom) VALUES ('test.kab','Uji','kabkota',"
                "ST_Multi(ST_MakeEnvelope(116.70,-1.40,117.00,-1.10,4326)))")
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

    assert out["egress"]["target_poi"]["type"] == "hospital"

    # what counts as a hospital evacuees can be sent to
    major = lambda name, area=None: rr.is_major({"amenity": "hospital", "name": name, "area_m2": area})
    assert major("RSUP Dr. Sardjito") and major("RSUD Sleman") and major("Rumah Sakit Siloam", 12_000)
    assert not major("RS THT Dr. Pomo", 3_000) and not major("RS Khusus Bedah Soedirman", 9_000)
    assert not major("RSIA Bunda", 8_000) and not major("Rumah Sakit Mata Dr. Yap", 6_000)
    assert not major("RS Pratama", 900) and not major(None)

    # no general hospital: RS Timur is small, so evacuees head for a safe point away from the
    # fires, never downwind (east); the south-east assembly field is downwind and skipped
    real = rr.hospitals
    rr.hospitals = lambda incident: [h for h in real(incident) if h["name"] != "RSUD Barat"]
    out = ResponderRoute(**rr.responder_route(ResponderRouteIn(origin=ORIGIN, incident=INCIDENT))).model_dump()
    target = out["egress"]["target_poi"]
    assert target["type"] == "safe_point" and target["name"].startswith("Titik aman 3 km"), target
    assert not rr.is_downwind(INCIDENT, target["coords"], 270), target
    assert "rumah sakit umum besar" in out["egress"]["summary"], out["egress"]["summary"]
    assert any("faskes terdekat" in w for w in out["egress"]["warnings"])
    rr.hospitals = real

    # a flood: its own reach becomes a zone the corridor leaves
    out = ResponderRoute(**rr.responder_route(ResponderRouteIn(origin=ORIGIN, incident=INCIDENT, hazard_type="flood"))).model_dump()
    drawn = [f["properties"] for f in out["hazard_polygons"]["features"]]
    assert {"hazard_type": "incident_zone", "radius_meters": 1500} in drawn, drawn

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

    # evacuation from a device that reports a fire: around it and out of its downwind sector, to a
    # point that is not downwind (the south-east assembly field is); the eastward line crosses the plume
    calls.clear()
    rr._valhalla = valhalla
    out = EvacuationRoute(**rr.evacuate(INCIDENT, True)).model_dump()
    kinds = [f["properties"]["hazard_type"] for f in out["hazard_polygons"]["features"]]
    assert out["fire"] and kinds[:2] == ["fire_buffer", "smoke_plume"], kinds
    assert calls[0] >= 1, calls                                          # the plume went to the router
    target = out["route"]["target_poi"]
    assert target["type"] == "safe_point" and not rr.is_downwind(INCIDENT, target["coords"], 270), target
    assert out["wind"] and "angin" in out["route"]["summary"], out["route"]["summary"]
    assert rr.ENTER_FIRE not in out["route"]["warnings"] and "segera keluar" in out["route"]["warnings"][0]
    rr._valhalla, rr._osrm = lambda s, e, rings: None, straight
    east = rr.destination(INCIDENT, 90, 3_000)
    leg = rr.route_leg(INCIDENT, east, [rr.plume_zone(INCIDENT, 270)])
    assert leg["safety_level"] == "critical" and any("searah angin" in w for w in leg["warnings"]), leg

    # any other device: the best road to the nearest assembly point, no wind involved
    rr._valhalla = valhalla
    out = EvacuationRoute(**rr.evacuate(INCIDENT, False)).model_dump()
    assert not out["fire"] and out["wind"] is None
    assert out["route"]["target_poi"] == {"name": "Lapangan Desa", "type": "shelter", "coords": FIELD}, out["route"]
    assert "titik kumpul Lapangan Desa" in out["route"]["summary"]
    assert "smoke_plume" not in {f["properties"]["hazard_type"] for f in out["hazard_polygons"]["features"]}

    try:
        rr.responder_route(ResponderRouteIn(origin=[150.0, -1.0], incident=INCIDENT))
        raise AssertionError("expected 400")
    except HTTPException as exc:
        assert exc.status_code == 400
finally:
    with conn() as c, c.cursor() as cur:
        cleanup(cur)

print("ok")
