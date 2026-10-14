"""Building footprints for the currently-viewed map area.

Indonesia's building count is too large to store wholesale, so most of the
country is still served live: query Overpass per request and keep a
short-lived in-memory cache keyed by the rounded bbox, so panning a pixel
doesn't re-fire the same query.

Downtown Balikpapan is the exception (see ingest/buildings_prewarm.py): it
is ingested once into the `building` table and served straight from
Postgres, which is why it answers in milliseconds instead of 40-80s and
survives a restart. A bbox that only partly overlaps ingested coverage
still falls through to Overpass — geometry lives in the DB is a bonus for
covered ground, not a promise that the map only ever shows loaded data.
"""
import json
import logging
import math
import time

import httpx
from fastapi import APIRouter, HTTPException, Query

from ..config import IDN_BBOX
from ..db import query
from .schemas import BuildingCollection, ErrorResponse


log = logging.getLogger(__name__)
router = APIRouter()

# Tried in order. Order matters and is measured, not assumed — and it has
# flipped at least once: overpass-api.de used to refuse connections from
# this VPS while kumi answered fine, but re-measured 2026-09-25, kumi is
# the one that hangs (TCP connects, then never sends a byte — no error,
# just silence past any reasonable timeout) while overpass-api.de answers
# in a few seconds with real data. overpass.osm.ch answers in under a
# second but carries only European data — it returns 0 elements for
# Indonesia, so it is deliberately absent regardless of which of the other
# two is currently healthy.
OVERPASS_URLS = [
    "https://overpass-api.de/api/interpreter",
    "https://overpass.kumi.systems/api/interpreter",
]

# Overpass answers 406 to requests it can't attribute, and the OSM usage
# policy asks clients to identify themselves.
HEADERS = {"User-Agent": "Arkamap/0.6 (environmental monitoring; JOINTS UGM 2026)"}

# Building footprints are only meaningful once zoomed to roughly a
# neighbourhood — at province scale this would be millions of polygons.
MAX_BBOX_DEG = 0.08  # ~9 km across at the equator
CACHE_TTL_S = 1800
# A single dense view can hold thousands of footprints; past a few thousand
# the map is a solid block of outlines anyway and the payload dominates.
MAX_FEATURES = 2500
# A mirror that's actually down answers in seconds (connection refused) or
# a query genuinely takes a while (large tile, busy server) — 25s covers
# both. A mirror that hangs silently (TCP connects, never sends a byte, no
# error) is the case this actually has to bound: at 75s, prewarming all of
# Indonesia one 0.02-degree tile at a time meant every hung tile cost over
# a minute before falling through to the next mirror.
OVERPASS_TIMEOUT = 25.0
_cache: dict[tuple, tuple[float, dict]] = {}

# OSM's building=* vocabulary is long and uneven. The map only needs a few
# stable buckets to colour by, so the mapping lives here rather than in the
# frontend: a new OSM value falls through to "lainnya" instead of breaking
# the legend.
_KIND = {
    "residential": "hunian", "house": "hunian", "detached": "hunian",
    "apartments": "hunian", "dormitory": "hunian", "bungalow": "hunian",
    "terrace": "hunian", "semidetached_house": "hunian", "hut": "hunian",
    "commercial": "niaga", "retail": "niaga", "shop": "niaga",
    "supermarket": "niaga", "kiosk": "niaga", "office": "niaga",
    "hotel": "niaga",
    "industrial": "industri", "warehouse": "industri", "factory": "industri",
    "manufacture": "industri",
    "school": "fasilitas", "hospital": "fasilitas", "university": "fasilitas",
    "college": "fasilitas", "kindergarten": "fasilitas", "clinic": "fasilitas",
    "mosque": "fasilitas", "church": "fasilitas", "temple": "fasilitas",
    "public": "fasilitas", "civic": "fasilitas", "government": "fasilitas",
    "train_station": "fasilitas", "transportation": "fasilitas",
}


def _classify(tags: dict) -> str:
    b = (tags.get("building") or "").lower()
    if b in _KIND:
        return _KIND[b]
    # building=yes is the majority tag in Indonesia and says nothing, so fall
    # back to whatever the amenity/shop tags reveal about actual use.
    use = (tags.get("building:use") or "").lower()
    if use in _KIND:
        return _KIND[use]
    if tags.get("shop") or tags.get("office") or tags.get("tourism"):
        return "niaga"
    amenity = (tags.get("amenity") or "").lower()
    if amenity in {"school", "hospital", "clinic", "university", "college",
                   "place_of_worship", "townhall", "police", "fire_station"}:
        return "fasilitas"
    if amenity in {"restaurant", "cafe", "bank", "marketplace", "pharmacy"}:
        return "niaga"
    return "lainnya"


# Requests are snapped outwards to this grid before hitting Overpass, so
# panning within a cell is a cache hit instead of another 30-second query.
# Rounding the raw bbox instead (the previous approach) meant almost every
# pan produced a new key and therefore a fresh upstream request.
TILE_DEG = 0.02


def _tile(west: float, south: float, east: float, north: float) -> tuple:
    import math
    # round() the division BEFORE floor/ceil, not just the final product:
    # 116.82 / 0.02 is exactly 5841 in real arithmetic but
    # 5840.999999999999 in binary float, so floor() silently knocks it
    # down to 5840 and snaps to the wrong tile — one edge case away from
    # right, not just imprecise. Rounding only the final x*TILE_DEG result
    # doesn't fix this: by then the wrong integer has already been picked.
    # 1e-6 is far finer than TILE_DEG (0.02) needs, just enough to absorb
    # float noise without merging genuinely different tiles. The final
    # round(..., 6) then keeps equal tiles from differing by a ulp in the
    # multiply-back, which is what actually made two in-the-same-cell
    # bboxes hash to different dict keys.
    return (
        round(math.floor(round(west / TILE_DEG, 6)) * TILE_DEG, 6),
        round(math.floor(round(south / TILE_DEG, 6)) * TILE_DEG, 6),
        round(math.ceil(round(east / TILE_DEG, 6)) * TILE_DEG, 6),
        round(math.ceil(round(north / TILE_DEG, 6)) * TILE_DEG, 6),
    )


def _area_m2(ring: list[list[float]]) -> float:
    """Planar shoelace area, with longitude degrees shrunk by cos(lat).

    A building spans metres, not kilometres, so treating the local patch as
    flat is well within the error of the footprint itself — and it keeps
    this endpoint dependency-free.
    """
    lat0 = sum(p[1] for p in ring) / len(ring)
    mx = 111_320 * math.cos(math.radians(lat0))
    my = 110_540
    s = 0.0
    for (x1, y1), (x2, y2) in zip(ring, ring[1:]):
        s += (x1 * mx) * (y2 * my) - (x2 * mx) * (y1 * my)
    return abs(s) / 2


def _fetch_and_cache(west: float, south: float, east: float, north: float) -> dict:
    """Shared by the endpoint and the prewarm job: same tile snap, same
    cache, same Overpass call. A prewarmed tile is just a cache entry
    filled in before anyone asked, so both paths have to agree on the key."""
    west, south, east, north = _tile(west, south, east, north)
    key = (west, south, east, north)
    cached = _cache.get(key)
    if cached and time.time() - cached[0] < CACHE_TTL_S:
        return cached[1]

    # `out geom` returns every node of every way. For a dense city that is
    # megabytes and tens of seconds; the map draws footprints a few pixels
    # across, where that precision is invisible. Asking Overpass to
    # generalise first is what makes this fast enough to feel live.
    query = f"""
    [out:json][timeout:25];
    way["building"]({south},{west},{north},{east});
    out geom {MAX_FEATURES};
    """
    data = None
    last: Exception | None = None
    # Overpass is slow by nature: a working mirror took ~11s for a single
    # neighbourhood, so the shared HTTP timeout is too tight and would
    # abandon a request that was about to succeed.
    with httpx.Client(timeout=OVERPASS_TIMEOUT, headers=HEADERS) as client:
        for url in OVERPASS_URLS:
            try:
                resp = client.post(url, data={"data": query})
                resp.raise_for_status()
                data = resp.json()
                break
            except httpx.HTTPError as exc:
                last = exc
                log.warning("overpass %s gagal: %s", url.split("/")[2], exc)

    if data is None:
        raise HTTPException(
            502, "sumber data bangunan (OSM Overpass) sedang tidak merespons",
        ) from last

    features = []
    counts: dict[str, int] = {}
    for el in data.get("elements", []):
        geom = el.get("geometry")
        if not geom or len(geom) < 3:
            continue
        coords = [[p["lon"], p["lat"]] for p in geom]
        if coords[0] != coords[-1]:
            coords.append(coords[0])
        tags = el.get("tags", {})
        kind = _classify(tags)
        counts[kind] = counts.get(kind, 0) + 1

        levels = tags.get("building:levels")
        try:
            levels = int(float(levels)) if levels is not None else None
        except ValueError:
            levels = None

        features.append({
            "type": "Feature",
            "id": el["id"],
            "properties": {
                "kind": kind,
                "building": tags.get("building", "yes"),
                "levels": levels,
                "name": tags.get("name"),
                "amenity": tags.get("amenity"),
                "area_m2": round(_area_m2(coords)),
            },
            "geometry": {"type": "Polygon", "coordinates": [coords]},
        })

    out = {
        "type": "FeatureCollection",
        "count": len(features),
        "by_kind": counts,
        "features": features,
    }
    _cache[key] = (time.time(), out)
    if len(_cache) > 200:
        oldest = min(_cache, key=lambda k: _cache[k][0])
        del _cache[oldest]
    return out


# Same grid the prewarm job tiles Indonesia on (see TILE_DEG, IDN_BBOX in
# ingest/buildings_prewarm.py) — tile keys must be computed identically on
# both sides, or a bbox's key never matches the row a real ingested tile
# was stored under.
_TILE_DEG = 0.02
_IDN_WEST, _IDN_SOUTH = IDN_BBOX[0], IDN_BBOX[1]

# Binary floats rarely land exactly on a multiple of 0.02 (0.02 itself has
# no exact binary representation), so a bbox edge that should sit exactly
# on a tile boundary can come out a hair past it. Without this, ceil() on
# that hair-past value rounds up to an extra, never-ingested tile and a
# fully-covered bbox reports as not covered.
_EPS = 1e-6

# Cached after the first hit rather than checked every request: the
# progress table, once created by the prewarm job, is never dropped, so
# this can only go False -> True once per process — never back again.
_progress_table_seen = False


def _covered(west: float, south: float, east: float, north: float) -> bool:
    """True only if every prewarm tile touching this bbox is already
    ingested. The prewarm job works through Indonesia one batch at a time
    (see BATCH_SIZE in buildings_prewarm.py), so any given bbox can sit
    half-done for a while — serving from the DB before every tile lands
    would show real gaps as "no buildings here" instead of "not loaded
    yet", which live Overpass would at least answer honestly.
    """
    global _progress_table_seen

    # The progress table is created by the prewarm job itself (see
    # _ensure_tables in buildings_prewarm.py), not the main schema — on a
    # brand new database it may not exist for the first few seconds of
    # startup, before that job's background thread has run once. Live
    # Overpass is the correct answer for that window, not an error page.
    if not _progress_table_seen:
        exists = query("SELECT to_regclass('building_prewarm_progress') IS NOT NULL AS ok")
        if not exists[0]["ok"]:
            return False
        _progress_table_seen = True

    i0 = math.floor((west - _IDN_WEST) / _TILE_DEG + _EPS)
    j0 = math.floor((south - _IDN_SOUTH) / _TILE_DEG + _EPS)
    nx = math.ceil((east - (_IDN_WEST + i0 * _TILE_DEG)) / _TILE_DEG - _EPS)
    ny = math.ceil((north - (_IDN_SOUTH + j0 * _TILE_DEG)) / _TILE_DEG - _EPS)
    needed = {
        f"{_IDN_WEST + (i0 + i) * _TILE_DEG:.4f},{_IDN_SOUTH + (j0 + j) * _TILE_DEG:.4f},"
        f"{_IDN_WEST + (i0 + i + 1) * _TILE_DEG:.4f},{_IDN_SOUTH + (j0 + j + 1) * _TILE_DEG:.4f}"
        for i in range(nx) for j in range(ny)
    }

    rows = query(
        "SELECT tile_key FROM building_prewarm_progress WHERE tile_key = ANY(%s)",
        (list(needed),),
    )
    return {r["tile_key"] for r in rows} >= needed


def _from_db(west: float, south: float, east: float, north: float) -> dict:
    rows = query(
        """
        SELECT osm_id, kind, building, levels, name, amenity, area_m2,
               ST_AsGeoJSON(geom) AS gj
        FROM building
        WHERE geom && ST_MakeEnvelope(%s, %s, %s, %s, 4326)
        LIMIT %s
        """,
        (west, south, east, north, MAX_FEATURES),
    )
    features, counts = [], {}
    for r in rows:
        counts[r["kind"]] = counts.get(r["kind"], 0) + 1
        features.append({
            "type": "Feature",
            "id": r["osm_id"],
            "properties": {
                "kind": r["kind"], "building": r["building"], "levels": r["levels"],
                "name": r["name"], "amenity": r["amenity"], "area_m2": r["area_m2"],
            },
            "geometry": json.loads(r["gj"]),
        })
    return {"type": "FeatureCollection", "count": len(features), "by_kind": counts,
            "features": features}


@router.get("/buildings", response_model=BuildingCollection, responses={400: {"model": ErrorResponse}})
def buildings(
    west: float = Query(...),
    south: float = Query(...),
    east: float = Query(...),
    north: float = Query(...),
) -> dict:
    if east <= west or north <= south:
        raise HTTPException(400, "bbox tidak valid")
    if (east - west) > MAX_BBOX_DEG or (north - south) > MAX_BBOX_DEG:
        raise HTTPException(
            400,
            f"area terlalu luas untuk jejak bangunan (maks {MAX_BBOX_DEG}° per sisi) — zoom lebih dekat",
        )
    if _covered(west, south, east, north):
        return _from_db(west, south, east, north)
    return _fetch_and_cache(west, south, east, north)
