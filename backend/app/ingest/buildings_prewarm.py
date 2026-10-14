"""Ingests building footprints for Indonesia's major cities into Postgres,
a batch of tiles at a time, running continuously until every tile is done.

/api/buildings serves uncovered ground live from Overpass, which takes
40-80s for anywhere nobody has asked for yet — and the frontend cancels the
in-flight request on the next moveend (AtlasMap's seq guard), so a slow
first fetch for an uncached neighbourhood can end up never landing at all.
An earlier version of this ran the same live fetch on a 25-minute schedule
to keep an in-memory cache warm, which worked but never stopped: it
re-fetched unchanged buildings forever and lost everything on every
restart. Buildings don't move. Fetch once, store in a real table, done —
see run_forever() below and _covered() in api/buildings.py, which is what
tells a request whether this tile is actually available yet.

An earlier version of this tiled the whole of IDN_BBOX (~2M 0.02-degree
cells) rather than a city list. Measured live on the production VPS: even
after fixing a hung Overpass mirror, throughput was ~0.86 tiles/min — over
4 years to cover a country that's 95%+ empty sea and forest, having
started at 95°E/-11°N (open ocean southwest of Sumatra) and taken 14
minutes to cover 12 tiles of nothing. _CITIES lists bounding boxes for 18
major cities instead — ~1,455 tiles total, realistic to finish in a day or
two at the measured rate, and covers where OSM building density and actual
map usage both concentrate.

Overpass itself, not an artificial schedule, is what limits throughput
here (each tile is one request, up to OVERPASS_TIMEOUT), so this runs a
tight loop in its own background thread: fetch a batch, upsert it, fetch
the next, forever, until _pending_tiles() comes back empty. See
run_forever(), started once from main.py's lifespan.

building_prewarm_progress remembers which tiles are already done, so this
is safe to restart mid-way (a fresh deploy resumes instead of starting
over) and never re-fetches a tile that's already in the `building` table.
"""
import logging
import threading
import time

import httpx

from ..api.buildings import MAX_FEATURES, OVERPASS_TIMEOUT, HEADERS, OVERPASS_URLS, _area_m2, _classify
from ..config import IDN_BBOX
from ..db import conn

log = logging.getLogger(__name__)

TILE_DEG = 0.02  # matches api/buildings.py's own cache granularity


def _snap(west: float, south: float, east: float, north: float) -> tuple[float, float, float, float]:
    """Rounds a city bbox onto the same grid _tiles_for(IDN_BBOX) would
    produce, anchored at IDN_BBOX's own corner. api/buildings.py's
    _covered() computes tile keys from that same anchor — a city bbox that
    isn't snapped to it would generate tiles whose keys never match what a
    real request asks for, even though the ingested geometry itself would
    be in the right place."""
    idn_west, idn_south = IDN_BBOX[0], IDN_BBOX[1]
    return (
        idn_west + round((west - idn_west) / TILE_DEG) * TILE_DEG,
        idn_south + round((south - idn_south) / TILE_DEG) * TILE_DEG,
        idn_west + round((east - idn_west) / TILE_DEG) * TILE_DEG,
        idn_south + round((north - idn_south) / TILE_DEG) * TILE_DEG,
    )


# Bounding boxes for 18 major Indonesian cities (west, south, east, north),
# snapped to IDN_BBOX's tile grid. See the module docstring for why this
# replaced tiling the whole country.
_CITIES = {
    name: _snap(*bbox) for name, bbox in {
        "jakarta":     (106.68, -6.38, 106.98, -6.08),
        "surabaya":    (112.60, -7.35, 112.85, -7.15),
        "bandung":     (107.55, -6.98, 107.75, -6.83),
        "medan":       (98.55, 3.50, 98.75, 3.68),
        "semarang":    (110.35, -7.05, 110.50, -6.90),
        "makassar":    (119.35, -5.20, 119.50, -5.08),
        "palembang":   (104.65, -3.05, 104.85, -2.90),
        "balikpapan":  (116.70, -1.35, 116.95, -1.05),
        "denpasar":    (115.15, -8.75, 115.30, -8.60),
        "yogyakarta":  (110.32, -7.85, 110.42, -7.75),
        "malang":      (112.58, -8.02, 112.68, -7.92),
        "batam":       (103.90, 1.00, 104.10, 1.18),
        "pekanbaru":   (101.35, 0.45, 101.50, 0.60),
        "banjarmasin": (114.50, -3.42, 114.70, -3.22),
        "manado":      (124.80, 1.42, 124.90, 1.52),
        "tangerang":   (106.55, -6.25, 106.75, -6.10),
        "bekasi":      (106.95, -6.30, 107.10, -6.15),
        "padang":      (100.30, -1.05, 100.42, -0.85),
    }.items()
}

# One batch touches at most this many not-yet-done tiles before upserting
# and picking the next batch. Kept modest: a tile is one Overpass request
# (up to OVERPASS_TIMEOUT), so this bounds how much a single loop iteration
# can be holding open connections and building up rows before writing them
# out.
BATCH_SIZE = 200

# Pause between batches — polite to the free Overpass mirrors.
BATCH_PAUSE_S = 2


def _tiles_for(bbox: tuple[float, float, float, float]) -> list[tuple[float, float, float, float]]:
    """Tile a bbox on TILE_DEG, indexed rather than built by repeated
    addition: adding 0.02 enough times lands on 116.85999999999999 (binary
    float drift), which can silently emit a sliver tile a fraction of a
    degree wide."""
    west, south, east, north = bbox
    nx = round((east - west) / TILE_DEG)
    ny = round((north - south) / TILE_DEG)
    return [
        (west + i * TILE_DEG, south + j * TILE_DEG,
         west + (i + 1) * TILE_DEG, south + (j + 1) * TILE_DEG)
        for j in range(ny) for i in range(nx)
    ]


def _tile_key(west: float, south: float, east: float, north: float) -> str:
    # Fixed precision, not str(float): repr can differ (1.0 vs 1) for the
    # same tile depending on how it was computed, which would silently
    # duplicate progress rows for what is really the same cell.
    return f"{west:.4f},{south:.4f},{east:.4f},{north:.4f}"


def _all_tiles() -> list[tuple[float, float, float, float]]:
    # Deduplicated by key, not just concatenated: two cities in _CITIES
    # close enough to share a tile would otherwise queue that tile twice.
    seen: dict[str, tuple[float, float, float, float]] = {}
    for bbox in _CITIES.values():
        for tile in _tiles_for(bbox):
            seen.setdefault(_tile_key(*tile), tile)
    return list(seen.values())


def _ensure_tables() -> None:
    with conn() as c, c.cursor() as cur:
        cur.execute("""
            CREATE TABLE IF NOT EXISTS building (
              osm_id   BIGINT PRIMARY KEY,
              kind     TEXT NOT NULL,
              building TEXT NOT NULL,
              levels   INTEGER,
              name     TEXT,
              amenity  TEXT,
              area_m2  DOUBLE PRECISION NOT NULL,
              geom     GEOMETRY(Polygon, 4326) NOT NULL
            )
        """)
        cur.execute(
            "CREATE INDEX IF NOT EXISTS building_geom_idx ON building USING GIST (geom)"
        )
        # Tracks which tiles are done, so a batch run picks up where the
        # last one left off instead of re-fetching finished ground.
        cur.execute("""
            CREATE TABLE IF NOT EXISTS building_prewarm_progress (
              tile_key   TEXT PRIMARY KEY,
              done_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
              jev_used   BOOLEAN NOT NULL
            )
        """)


def _pending_tiles(limit: int) -> list[tuple[float, float, float, float]]:
    with conn() as c, c.cursor() as cur:
        cur.execute("SELECT tile_key FROM building_prewarm_progress")
        done = {r["tile_key"] for r in cur.fetchall()}
    pending = [tile for tile in _all_tiles() if _tile_key(*tile) not in done]
    return pending[:limit]


def _fetch_tile(west: float, south: float, east: float, north: float) -> list[dict]:
    query_str = f"""
    [out:json][timeout:60];
    way["building"]({south},{west},{north},{east});
    out geom {MAX_FEATURES};
    """
    data = None
    last: Exception | None = None
    with httpx.Client(timeout=OVERPASS_TIMEOUT, headers=HEADERS) as client:
        for url in OVERPASS_URLS:
            try:
                resp = client.post(url, data={"data": query_str})
                resp.raise_for_status()
                data = resp.json()
                break
            except httpx.HTTPError as exc:
                last = exc
                log.warning("overpass %s gagal: %s", url.split("/")[2], exc)
    if data is None:
        raise RuntimeError(f"overpass tidak merespons: {last}")

    rows = []
    for el in data.get("elements", []):
        geom = el.get("geometry")
        if not geom or len(geom) < 3:
            continue
        coords = [[p["lon"], p["lat"]] for p in geom]
        if coords[0] != coords[-1]:
            coords.append(coords[0])
        tags = el.get("tags", {})
        levels = tags.get("building:levels")
        try:
            levels = int(float(levels)) if levels is not None else None
        except ValueError:
            levels = None
        kind = _classify(tags)
        rows.append({
            "osm_id": el["id"],
            "kind": kind,
            "building": tags.get("building", "yes"),
            "levels": levels,
            "name": tags.get("name"),
            "amenity": tags.get("amenity"),
            "area_m2": round(_area_m2(coords)),
            "coords": coords,
        })
    return rows


def ingest_buildings() -> dict:
    """Fetch up to BATCH_SIZE not-yet-done tiles and upsert into the
    `building` table. One failed tile doesn't block the rest — a partial
    refresh still beats none, and a re-run later fills the gaps."""
    _ensure_tables()

    pending = _pending_tiles(BATCH_SIZE)
    if not pending:
        log.info("ingest bangunan: semua tile Indonesia sudah selesai")
        return {"tiles_ok": 0, "tiles_failed": 0, "buildings": 0, "remaining": 0}

    tiles_ok, tiles_failed, upserted = 0, 0, 0
    for west, south, east, north in pending:
        try:
            rows = _fetch_tile(west, south, east, north)
        except Exception as exc:  # noqa: BLE001 - one bad mirror shouldn't skip the rest
            log.warning("ingest bangunan tile %s gagal: %s",
                        (west, south, east, north), exc)
            tiles_failed += 1
            continue
        tiles_ok += 1
        with conn() as c, c.cursor() as cur:
            for r in rows:
                # POLYGON needs a double-paren ring: the outer pair is the
                # polygon itself (it can hold multiple rings, e.g. a hole),
                # the inner pair is this one ring's own coordinate list.
                # A single pair parses as a syntax error at the first '-'
                # of a negative coordinate, since PostGIS expects another
                # '(' there instead.
                ring = "(" + ",".join(f"{x} {y}" for x, y in r["coords"]) + ")"
                cur.execute(
                    """
                    INSERT INTO building
                        (osm_id, kind, building, levels, name, amenity, area_m2, geom)
                    VALUES (%(osm_id)s, %(kind)s, %(building)s, %(levels)s, %(name)s,
                            %(amenity)s, %(area_m2)s, ST_GeomFromText(%(wkt)s, 4326))
                    ON CONFLICT (osm_id) DO UPDATE SET
                        kind=CASE WHEN building.kind = 'lainnya' THEN EXCLUDED.kind ELSE building.kind END,
                        building=EXCLUDED.building,
                        levels=EXCLUDED.levels, name=EXCLUDED.name,
                        amenity=EXCLUDED.amenity, area_m2=EXCLUDED.area_m2,
                        geom=EXCLUDED.geom
                    """,
                    {**r, "wkt": f"POLYGON({ring})"},
                )
            upserted += len(rows)
            # Marked done even for an empty tile (open sea or forest between
            # cities is a real, permanent finding). jev_used is an unused
            # column, kept so existing rows stay valid.
            cur.execute(
                """
                INSERT INTO building_prewarm_progress (tile_key, jev_used)
                VALUES (%s, %s)
                ON CONFLICT (tile_key) DO NOTHING
                """,
                (_tile_key(west, south, east, north), False),
            )

    # Not a plain row count: a prior version of this job tiled the whole of
    # IDN_BBOX rather than _CITIES (see the module docstring), and its
    # progress rows for tiles outside any city are still in this table.
    # Counting them here would under-report how much of _CITIES is left.
    all_keys = [_tile_key(*t) for t in _all_tiles()]
    with conn() as c, c.cursor() as cur:
        cur.execute(
            "SELECT COUNT(*) AS c FROM building_prewarm_progress WHERE tile_key = ANY(%s)",
            (all_keys,),
        )
        done_count = cur.fetchone()["c"]
    remaining = len(all_keys) - done_count

    log.info("ingest bangunan: %d tile ok, %d gagal, %d baris, %d tile tersisa",
              tiles_ok, tiles_failed, upserted, remaining)
    return {
        "tiles_ok": tiles_ok, "tiles_failed": tiles_failed,
        "buildings": upserted, "remaining": remaining,
    }


_running = False


def run_forever() -> None:
    """Runs batches back-to-back until every tile in Indonesia is done,
    then returns. Meant for a single daemon thread started once at
    startup — Overpass's own latency is the throughput limit here, not an
    artificial schedule, so there's no point spacing batches further apart
    than BATCH_PAUSE_S.

    A module-level guard rather than trusting the caller not to start two:
    /api/admin/refresh-buildings can fire this from a request handler too,
    and two loops racing to upsert the same tiles would waste Overpass
    calls for no gain (ON CONFLICT already makes that safe, just wasteful).
    """
    global _running
    if _running:
        log.info("prewarm bangunan sudah berjalan, tidak memulai yang baru")
        return
    _running = True
    try:
        while True:
            report = ingest_buildings()
            if report["remaining"] == 0 and report["tiles_ok"] == 0:
                log.info("prewarm bangunan selesai: semua kota di _CITIES sudah ter-ingest")
                return
            time.sleep(BATCH_PAUSE_S)
    finally:
        _running = False


def start_background() -> None:
    threading.Thread(target=run_forever, daemon=True).start()


if __name__ == "__main__":
    from ..db import init_pool
    init_pool()
    print(ingest_buildings())
