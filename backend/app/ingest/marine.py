"""Sea conditions for coastal regions and any point (Open-Meteo Marine):
wave height and sea surface temperature, for fishers and coastal users.

Marine data exists only over water. Each region's coastline is the part of
its border not shared with a neighbour; the coastal point used is the one
nearest the region's centre. Landlocked regions get none and are skipped.
"""
import logging
import time
from datetime import datetime, timezone

import httpx

from ..config import HTTP_TIMEOUT
from ..db import conn, execute, query
from .climate import _fetch

log = logging.getLogger(__name__)

MARINE = "https://marine-api.open-meteo.com/v1/marine"
CHUNK = 80


def ensure_coast_points() -> int:
    """Compute coastal points for regions not examined yet. Borders shared
    with a neighbour are buffered by ~2 km so simplified outlines that
    don't quite touch still count as shared, not as coast."""
    return execute(
        """
        UPDATE region r SET coast_checked = TRUE, coast_point = (
          SELECT CASE WHEN ST_IsEmpty(coast) THEN NULL
                      ELSE ST_ClosestPoint(coast, ST_Centroid(r.geom)) END
          FROM (SELECT ST_Difference(
                         ST_Boundary(r.geom),
                         COALESCE(ST_Buffer(ST_Union(n.geom), 0.02),
                                  ST_GeomFromText('GEOMETRYCOLLECTION EMPTY', 4326))
                       ) AS coast
                FROM region n
                WHERE n.level = r.level AND n.id <> r.id AND ST_DWithin(n.geom, r.geom, 0.05)) s)
        WHERE NOT r.coast_checked
        """
    )


def ingest_marine() -> int:
    ensure_coast_points()
    regions = query("SELECT id, ST_X(coast_point) AS lon, ST_Y(coast_point) AS lat FROM region"
                    " WHERE coast_point IS NOT NULL ORDER BY id")
    today = datetime.now(timezone.utc).date()
    rows, empty = [], 0
    with httpx.Client(timeout=HTTP_TIMEOUT) as client:
        for i in range(0, len(regions), CHUNK):
            part = regions[i:i + CHUNK]
            res = _fetch(client, MARINE, {
                "latitude": ",".join(f"{r['lat']:.4f}" for r in part),
                "longitude": ",".join(f"{r['lon']:.4f}" for r in part),
                "daily": "wave_height_max", "hourly": "sea_surface_temperature",
                "forecast_days": 3, "timezone": "UTC",
            }, len(part))
            for reg, d in zip(part, res):
                waves = [x for x in (d.get("daily") or {}).get("wave_height_max") or [] if x is not None]
                sst = [x for x in (d.get("hourly") or {}).get("sea_surface_temperature") or [] if x is not None]
                if not waves and not sst:
                    empty += 1       # fetch failed, or the point snapped to no sea cell
                    continue
                if waves:
                    rows.append((reg["id"], "wave_height_max", today, max(waves), "m"))
                if sst:
                    rows.append((reg["id"], "sea_surface_temp", today, sum(sst[:24]) / len(sst[:24]), "°C"))
    with conn() as c, c.cursor() as cur:
        cur.executemany(
            """
            INSERT INTO indicator (region_id, metric, period, value, unit, source_id, confidence, is_modelled)
            VALUES (%s, %s, %s, %s, %s, 'open_meteo_marine', 4, FALSE)
            ON CONFLICT (region_id, metric, period) DO UPDATE SET value = EXCLUDED.value, computed_at = now()
            """,
            rows,
        )
    log.info("laut: %d nilai, %d wilayah pesisir tanpa data", len(rows), empty)
    return len(rows)


_point_cache: dict[tuple, tuple[float, dict]] = {}   # per-process, 1 hour
POINT_TTL_S = 3600


def point_forecast(lat: float, lon: float) -> dict | None:
    """Next 3 days of sea conditions at one point (e.g. a fisher's position
    or a sensor on a boat). None when the point has no sea cell nearby."""
    key = (round(lat, 2), round(lon, 2))
    hit = _point_cache.get(key)
    if hit and time.monotonic() - hit[0] < POINT_TTL_S:
        return hit[1]
    r = httpx.get(MARINE, timeout=15, params={
        "latitude": key[0], "longitude": key[1],
        "daily": "wave_height_max,wave_period_max,wave_direction_dominant,wind_wave_height_max",
        "hourly": "sea_surface_temperature", "forecast_days": 3, "timezone": "Asia/Jakarta"})
    r.raise_for_status()
    d = r.json()
    daily = d.get("daily") or {}
    if not any(x is not None for x in daily.get("wave_height_max") or []):
        out = None
    else:
        sst = [x for x in (d.get("hourly") or {}).get("sea_surface_temperature") or [] if x is not None]
        out = {"lat": d["latitude"], "lon": d["longitude"], "days": [
            {"date": t, "wave_height_max": daily["wave_height_max"][i],
             "wave_period_max": (daily.get("wave_period_max") or [None] * 9)[i],
             "wave_direction": (daily.get("wave_direction_dominant") or [None] * 9)[i],
             "wind_wave_height_max": (daily.get("wind_wave_height_max") or [None] * 9)[i]}
            for i, t in enumerate(daily.get("time") or [])],
            "sea_surface_temp": round(sum(sst[:24]) / len(sst[:24]), 1) if sst else None}
    _point_cache[key] = (time.monotonic(), out)
    return out
