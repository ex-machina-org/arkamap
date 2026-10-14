"""Possible-fire detection (ingest/fire.py) on synthetic hotspots.

Needs an EMPTY PostGIS database; it writes test rows and refuses to run on
one that already holds regions:
    docker run -d --rm --name firetest -e POSTGRES_USER=t -e POSTGRES_PASSWORD=t \
      -e POSTGRES_DB=t -p 127.0.0.1:55499:5432 postgis/postgis:16-3.4
    DATABASE_URL=postgresql://t:t@127.0.0.1:55499/t python test_fire.py
"""
import sys
from datetime import datetime, timedelta, timezone
sys.path.insert(0, ".")
from app.db import apply_schema, conn, init_pool
from app.ingest import fire

init_pool(); apply_schema()
now = datetime.now(timezone.utc)
with conn() as c, c.cursor() as cur:
    if cur.execute("SELECT EXISTS (SELECT 1 FROM region) AS used").fetchone()["used"]:
        sys.exit("database ini sudah berisi wilayah; pakai PostGIS kosong (lihat docstring)")
    for sid in ("firms_viirs", "firms_extra", "climate_trace", "gdacs"):
        cur.execute("INSERT INTO source (id, aspect, title, publisher, url, license, cadence, is_modelled)"
                    " VALUES (%s,'lingkungan',%s,'x','x','x','x',false) ON CONFLICT DO NOTHING", (sid, sid))
    box = lambda w, s, e, n: f"ST_Multi(ST_MakeEnvelope({w},{s},{e},{n},4326))"
    cur.execute(f"INSERT INTO region (id,name,level,geom) VALUES ('p1','Prov Satu','provinsi',{box(109,-2,112,0)}),"
                f" ('p2','Prov Dua','provinsi',{box(120,-2,121,0)})")
    cur.execute(f"INSERT INTO region (id,name,level,parent_id,geom) VALUES ('k1','Kab Satu','kabkota','p1',{box(109,-2,112,0)}),"
                f" ('k2','Kab Dua','kabkota','p2',{box(120,-2,121,0)})")

    def hs(lon, lat, when, conf="nominal", src="firms_viirs", sat="N", frp=10.0):
        cur.execute("INSERT INTO observation (source_id,metric,observed_at,value,attrs,geom) VALUES"
                    " (%s,'hotspot',%s,%s,jsonb_build_object('confidence',%s::text,'satellite',%s::text),"
                    " ST_SetSRID(ST_MakePoint(%s,%s),4326))", (src, when, frp, conf, sat, lon, lat))

    t1, t2 = now - timedelta(hours=3), now - timedelta(hours=14)
    # A: real fire, two passes by two satellites -> possible fire, confirmed by GDACS nearby
    hs(110.000, -1.000, t1, sat="N", frp=40); hs(110.001, -1.001, t2, src="firms_extra", sat="N20", frp=55)
    cur.execute("INSERT INTO observation (source_id,metric,observed_at,value,attrs,geom) VALUES ('gdacs','disaster',%s,2,"
                "'{\"type\":\"wildfire\",\"current\":\"true\"}',ST_SetSRID(ST_MakePoint(110.2,-1.1),4326))", (now,))
    cur.execute("INSERT INTO observation (source_id,metric,observed_at,value,attrs,geom) VALUES ('climate_trace','power_plant',%s,5,"
                "'{\"fuel\":\"solar\"}',ST_SetSRID(ST_MakePoint(110.0,-1.0),4326))", (now,))   # solar: must not mask A
    # B: one pass only -> no
    hs(110.200, -1.000, t1)
    # C: industry, seen on 6 days over 5 months -> static, masked
    for m in range(5):
        hs(110.400, -1.000, now - timedelta(days=30 * m + 20))
    hs(110.400, -1.000, now - timedelta(days=21))
    hs(110.4005, -1.0003, t1); hs(110.400, -1.000, t2)
    # D: next to a coal plant -> masked
    cur.execute("INSERT INTO observation (source_id,metric,observed_at,value,attrs,geom) VALUES ('climate_trace','power_plant',%s,600,"
                "'{\"fuel\":\"coal\"}',ST_SetSRID(ST_MakePoint(110.6,-1.0),4326))", (now,))
    hs(110.6, -1.0, t1); hs(110.6005, -1.0, t2)
    # E: peat fire, 10 days within ~2 months -> NOT static, still a possible fire
    for d in range(10):
        hs(110.800, -1.000, now - timedelta(days=5 + d * 5))
    hs(110.800, -1.000, t1); hs(110.8002, -1.0001, t2)
    # F: low confidence only -> no
    hs(111.0, -1.0, t1, conf="low"); hs(111.0, -1.0, t2, conf="low")
    # G: another province, two passes
    hs(120.5, -1.0, t1); hs(120.5, -1.0, t2, src="firms_extra", sat="1")

print("static cells:", fire.refresh_static_cells())
out = fire.possible_fires()
for r in out:
    print({k: r[k] for k in ("region_id", "clusters", "detections", "satellites", "frp_max", "confirmed", "lon", "lat")})
k1 = next(r for r in out if r["region_id"] == "k1")
assert k1["clusters"] == 2, k1                               # A and E; B, C, D, F excluded
assert k1["confirmed"] and k1["frp_max"] == 55 and abs(k1["lon"] - 110.0) < 0.01
assert set(k1["satellites"]) == {"VIIRS S-NPP", "VIIRS NOAA-20"}
assert [r["region_id"] for r in out] == ["k1", "k2"]          # confirmed first
assert [r["region_id"] for r in fire.possible_fires("p2")] == ["k2"]
from app.api.routes import notifications
n = notifications("p1")
assert len(n["fire_alerts"]) == 1 and n["fire_alerts"][0]["region_id"] == "k1"
from app.api.schemas import Notifications
Notifications(**n)
print("OK: semua kasus sesuai")
