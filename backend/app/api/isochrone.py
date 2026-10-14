"""Reachable area in N minutes from a point (Valhalla isochrone), cached."""
import json
import logging
from typing import Literal

import httpx
from fastapi import APIRouter, HTTPException, Query
from psycopg.types.json import Jsonb

from ..config import IDN_BBOX
from ..db import execute, query_one
from .schemas import ErrorResponse, Isochrone

log = logging.getLogger(__name__)
router = APIRouter()

VALHALLA = "https://valhalla1.openstreetmap.de/isochrone"
CACHE_DAYS = 30


@router.get("/isochrone", response_model=Isochrone,
            responses={400: {"model": ErrorResponse}, 502: {"model": ErrorResponse}})
def isochrone(
    lat: float = Query(..., ge=-90, le=90),
    lon: float = Query(..., ge=-180, le=180),
    minutes: int = Query(15, ge=1, le=60),
    mode: Literal["auto", "pedestrian", "bicycle"] = "auto",
) -> dict:
    """Area reachable from (lat, lon) within `minutes` by car, on foot or by
    bicycle, over the OSM road network. Answers from cache when possible."""
    # the bbox alone admits Singapore, Malaysia and Timor-Leste
    w, s, e, n = IDN_BBOX
    if not (w <= lon <= e and s <= lat <= n) or not query_one(
            "SELECT 1 FROM region WHERE level = 'provinsi'"
            " AND ST_DWithin(geom, ST_SetSRID(ST_MakePoint(%s, %s), 4326), 0.05) LIMIT 1", (lon, lat)):
        raise HTTPException(400, "titik di luar Indonesia")
    # ~110 m grid: nearby clicks share one cached answer
    key = f"{mode}:{minutes}:{lat:.3f}:{lon:.3f}"
    hit = query_one("SELECT geojson, area_km2, created_at FROM isochrone_cache WHERE key = %s"
                    f" AND created_at > now() - interval '{CACHE_DAYS} days'", (key,))
    if hit:
        return {**hit["geojson"], "area_km2": hit["area_km2"], "minutes": minutes, "mode": mode,
                "cached": True, "created_at": hit["created_at"]}

    req = {"locations": [{"lat": round(lat, 3), "lon": round(lon, 3)}], "costing": mode,
           "contours": [{"time": minutes}], "polygons": True}
    try:
        # compact JSON: httpx encodes spaces as '+', which Valhalla rejects
        r = httpx.get(VALHALLA, params={"json": json.dumps(req, separators=(",", ":"))}, timeout=15,
                      headers={"User-Agent": "nusantara-atlas/0.3"})
        r.raise_for_status()
        fc = r.json()
    except Exception as exc:  # noqa: BLE001
        log.warning("valhalla gagal: %s", exc)
        raise HTTPException(502, "layanan isochrone tidak merespons; coba lagi nanti") from exc

    geom = json.dumps(fc["features"][0]["geometry"])
    row = query_one("SELECT ST_Area(ST_GeomFromGeoJSON(%s)::geography) / 1e6 AS a", (geom,))
    fc = {"type": "FeatureCollection", "features": [
        {"type": "Feature", "properties": {"minutes": minutes, "mode": mode},
         "geometry": fc["features"][0]["geometry"]}]}
    execute(
        "INSERT INTO isochrone_cache (key, geojson, area_km2) VALUES (%s, %s, %s)"
        " ON CONFLICT (key) DO UPDATE SET geojson = EXCLUDED.geojson,"
        " area_km2 = EXCLUDED.area_km2, created_at = now()",
        (key, Jsonb(fc), row["a"]),
    )
    return {**fc, "area_km2": row["a"], "minutes": minutes, "mode": mode, "cached": False,
            "created_at": None}
