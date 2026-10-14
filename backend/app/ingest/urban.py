"""Urban form and access: roads and facilities from OSM (via ohsome),
TransJakarta stop coverage from its GTFS feed, and Meta's Relative Wealth
Index. All aggregated to region indicators.

OSM completeness varies a lot between regions, so the OSM-derived values
carry confidence 2: a low road density can mean few roads or few mappers.
"""
import csv
import io
import json
import logging
import zipfile
from datetime import datetime, timezone

import httpx

from ..config import HTTP_TIMEOUT
from ..db import conn, execute, query

log = logging.getLogger(__name__)

OHSOME = "https://api.ohsome.org/v1/elements"
TRANSJAKARTA_GTFS = "https://gtfs.transjakarta.co.id/files/file_gtfs.zip"
RWI_CSV = ("https://data.humdata.org/dataset/76f2a2ea-ba50-40f5-b79c-db95d668b843/resource/"
           "b7238173-c1cf-4db1-bbe9-b6bd01420c7d/download/idn_relative_wealth_index.csv")
DKI = "idn.jakarta_special_capital_region"

# Drivable public roads; excludes service roads, tracks and footpaths.
ROAD_FILTER = ("highway in (motorway,trunk,primary,secondary,tertiary,unclassified,residential)"
               " and type:way")
FACILITY_FILTER = ("amenity in (hospital,clinic,school,charging_station)"
                   " or highway=bus_stop")

# ohsome times out or answers 500 on province-sized polygons, so only
# kabupaten/kota are queried (one batch per province, ~50 KB each) and each
# province is the sum of its kabupaten/kota: lengths and counts add up.


def _polys(where: str, params: tuple, tol: float) -> list[dict]:
    rows = query(f"SELECT id, area_km2, population,"
                 f" ST_AsGeoJSON(ST_SimplifyPreserveTopology(geom, {tol}), 4) AS gj"
                 f" FROM region WHERE {where} ORDER BY id", params)
    return [{"type": "Feature", "id": r["id"], "properties": {"id": r["id"]},
             "geometry": json.loads(r["gj"]), "_area": r["area_km2"], "_pop": r["population"]}
            for r in rows]


def _post(client: httpx.Client, path: str, polys: list[dict], **params) -> dict:
    fc = {"type": "FeatureCollection",
          "features": [{k: v for k, v in f.items() if not k.startswith("_")} for f in polys]}
    r = client.post(f"{OHSOME}/{path}", data={"bpolys": json.dumps(fc), **params})
    r.raise_for_status()
    return r.json()


def osm_rows(polys: list[dict], lengths: dict, counts: dict, today) -> list[tuple]:
    """Turn ohsome results into indicator rows. Pure, so it is testable."""
    rows = []
    for f in polys:
        rid, area, pop = f["id"], f["_area"] or 0, f["_pop"]
        c = counts.get(rid, {})
        add = lambda m, v, u: rows.append((rid, m, today, float(v), u, "osm_ohsome", 2, False))
        if area > 0 and rid in lengths:
            add("road_density", lengths[rid] / 1000 / area, "km/km²")
            add("transit_stop_density", c.get("remainder", 0) / area, "halte/km²")
        if pop:
            add("health_facilities_per_10k",
                (c.get("amenity=hospital", 0) + c.get("amenity=clinic", 0)) / pop * 10_000, "per 10 rb jiwa")
            add("schools_per_10k", c.get("amenity=school", 0) / pop * 10_000, "per 10 rb jiwa")
        if rid in lengths:
            add("ev_charging_count", c.get("amenity=charging_station", 0), "lokasi")
    return rows


def ingest_osm_urban() -> int:
    today = datetime.now(timezone.utc).date()
    rows, failed = [], []
    all_lengths: dict[str, float] = {}
    all_counts: dict[str, dict] = {}
    provs = query("SELECT id FROM region WHERE level = 'provinsi' ORDER BY id")
    with httpx.Client(timeout=300) as client:
        for p in provs:
            name = p["id"]
            ln = ct = None
            # ohsome sometimes answers 500 on a complex outline; retry once
            # with a coarser one before giving up on the province
            for tol in (0.005, 0.02):
                polys = _polys("level = 'kabkota' AND parent_id = %s", (name,), tol)
                if not polys:
                    break
                try:
                    ln = _post(client, "length/groupBy/boundary", polys, filter=ROAD_FILTER)
                    ct = _post(client, "count/groupBy/boundary/groupBy/tag", polys,
                               filter=FACILITY_FILTER, groupByKey="amenity",
                               groupByValues="hospital,clinic,school,charging_station")
                    break
                except Exception as exc:  # noqa: BLE001 - one batch shouldn't sink the rest
                    log.warning("ohsome batch %s (tol %s) gagal: %s", name, tol, exc)
            if ln is None or ct is None:
                if polys:
                    failed.append(name)
                continue
            lengths = {g["groupByObject"]: g["result"][0]["value"] for g in ln["groupByResult"]}
            counts: dict[str, dict] = {}
            for g in ct["groupByResult"]:
                rid, tag = g["groupByObject"]
                counts.setdefault(rid, {})[tag] = g["result"][0]["value"]
            rows += osm_rows(polys, lengths, counts, today)
            # a province with a failed batch is skipped below, not undercounted
            total_c: dict[str, float] = {}
            for c in counts.values():
                for tag, v in c.items():
                    total_c[tag] = total_c.get(tag, 0) + v
            all_lengths[name] = sum(lengths.values())
            all_counts[name] = total_c
    prov_polys = [{"id": r["id"], "_area": r["area_km2"], "_pop": r["population"]}
                  for r in query("SELECT id, area_km2, population FROM region"
                                 " WHERE id = ANY(%s)", (list(all_lengths),))]
    rows += osm_rows(prov_polys, all_lengths, all_counts, today)
    if not rows:
        raise RuntimeError(f"semua batch ohsome gagal: {failed}")
    _upsert(rows)
    log.info("urban OSM: %d nilai, batch gagal %s", len(rows), failed)
    return len(rows)


def ingest_transjakarta() -> int:
    """Stops as observations (replaced each run), then the share of each
    DKI region's area within 500 m walking-distance radius of a stop."""
    with httpx.Client(timeout=HTTP_TIMEOUT, follow_redirects=True) as c:
        r = c.get(TRANSJAKARTA_GTFS)
        r.raise_for_status()
    z = zipfile.ZipFile(io.BytesIO(r.content))
    stops = []
    for s in csv.DictReader(io.StringIO(z.read("stops.txt").decode("utf-8-sig"))):
        try:
            lat, lon = float(s["stop_lat"]), float(s["stop_lon"])
        except (KeyError, ValueError):
            continue
        # location_type 0/empty = boarding point; 1 = station grouping stops
        if s.get("location_type") in ("", "0", None):
            stops.append((s.get("stop_name"), s.get("stop_id"), lon, lat))

    now = datetime.now(timezone.utc)
    with conn() as c, c.cursor() as cur:
        cur.execute("DELETE FROM observation WHERE source_id = 'transjakarta_gtfs'")
        cur.executemany(
            """
            INSERT INTO observation (source_id, metric, observed_at, value, attrs, geom)
            VALUES ('transjakarta_gtfs', 'transit_stop', %s, NULL,
                    jsonb_build_object('name', %s::text, 'stop_id', %s::text),
                    ST_SetSRID(ST_MakePoint(%s::float8, %s::float8), 4326))
            ON CONFLICT DO NOTHING
            """,
            [(now, *s) for s in stops],
        )
    execute(
        """
        WITH cover AS (
          SELECT ST_Union(ST_Buffer(geom::geography, 500)::geometry) AS g
          FROM observation WHERE source_id = 'transjakarta_gtfs'
        )
        INSERT INTO indicator (region_id, metric, period, value, unit, source_id,
                               confidence, is_modelled)
        SELECT r.id, 'transit_coverage_500m', %s,
               ROUND((100 * ST_Area(ST_Intersection(r.geom, cover.g)::geography)
                      / ST_Area(r.geom::geography))::numeric, 1),
               '%%', 'transjakarta_gtfs', 4, FALSE
        FROM region r, cover
        WHERE r.id = %s OR r.parent_id = %s
        ON CONFLICT (region_id, metric, period) DO UPDATE
          SET value = EXCLUDED.value, computed_at = now()
        """,
        (now.date(), DKI, DKI),
    )
    log.info("TransJakarta: %d halte", len(stops))
    return len(stops)


def ingest_rwi() -> int:
    """Mean Relative Wealth Index of the ~2.4 km cells inside each region."""
    with httpx.Client(timeout=HTTP_TIMEOUT, follow_redirects=True) as c:
        r = c.get(RWI_CSV)
        r.raise_for_status()
    pts = [(float(x["longitude"]), float(x["latitude"]), float(x["rwi"]))
           for x in csv.DictReader(io.StringIO(r.text)) if x.get("rwi")]
    today = datetime.now(timezone.utc).date()
    with conn() as c, c.cursor() as cur:
        cur.execute("CREATE TEMP TABLE rwi (geom geometry(Point, 4326), rwi float8) ON COMMIT DROP")
        with cur.copy("COPY rwi (geom, rwi) FROM STDIN") as cp:
            for lon, lat, v in pts:
                cp.write_row((f"SRID=4326;POINT({lon} {lat})", v))
        cur.execute("CREATE INDEX ON rwi USING GIST (geom)")
        cur.execute(
            """
            INSERT INTO indicator (region_id, metric, period, value, unit, source_id,
                                   confidence, is_modelled)
            SELECT r.id, 'wealth_index', %s, ROUND(AVG(p.rwi)::numeric, 3), 'indeks',
                   'meta_rwi', 3, TRUE
            FROM region r JOIN rwi p ON ST_Intersects(p.geom, r.geom)
            GROUP BY r.id
            ON CONFLICT (region_id, metric, period) DO UPDATE
              SET value = EXCLUDED.value, computed_at = now()
            """,
            (today,),
        )
        n = cur.rowcount
    log.info("RWI: %d titik -> %d wilayah", len(pts), n)
    return n


def _upsert(rows: list[tuple]) -> None:
    with conn() as c, c.cursor() as cur:
        cur.executemany(
            """
            INSERT INTO indicator (region_id, metric, period, value, unit, source_id,
                                   confidence, is_modelled)
            VALUES (%s,%s,%s,%s,%s,%s,%s,%s)
            ON CONFLICT (region_id, metric, period) DO UPDATE
              SET value = EXCLUDED.value, computed_at = now()
            """,
            rows,
        )


if __name__ == "__main__":
    polys = [{"id": "a", "_area": 100.0, "_pop": 50_000}, {"id": "b", "_area": 0, "_pop": None}]
    rows = {(r[0], r[1]): r[3] for r in osm_rows(
        polys, {"a": 250_000.0, "b": 10.0},
        {"a": {"amenity=hospital": 2, "amenity=clinic": 3, "amenity=school": 20, "remainder": 40}},
        None)}
    assert rows[("a", "road_density")] == 2.5            # 250 km / 100 km²
    assert rows[("a", "health_facilities_per_10k")] == 1.0
    assert rows[("a", "schools_per_10k")] == 4.0
    assert rows[("a", "transit_stop_density")] == 0.4
    assert rows[("a", "ev_charging_count")] == 0
    assert ("b", "road_density") not in rows              # no area, no density
    print("ok")
