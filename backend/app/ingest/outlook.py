"""Looking ahead: seasonal rain for farmers (per region, daily ingest) and
rooftop-solar output for PV owners (per point, on demand). Open-Meteo,
keyless.
"""
import logging
import time
from datetime import datetime, timezone

import httpx

from ..config import HTTP_TIMEOUT
from ..db import conn
from .climate import _centroids, _fetch

log = logging.getLogger(__name__)

SEASONAL = "https://seasonal-api.open-meteo.com/v1/seasonal"
FORECAST = "https://api.open-meteo.com/v1/forecast"
CHUNK = 40   # 51 ensemble members per location: small batches keep a 1 GB VPS comfortable
HORIZON_DAYS = 30


def ingest_seasonal() -> int:
    """Expected rain over the next 30 days (ensemble mean) per region."""
    regions = _centroids()
    today = datetime.now(timezone.utc).date()
    rows, empty = [], 0
    with httpx.Client(timeout=HTTP_TIMEOUT) as client:
        for i in range(0, len(regions), CHUNK):
            part = regions[i:i + CHUNK]
            res = _fetch(client, SEASONAL, {
                "latitude": ",".join(f"{r['lat']:.4f}" for r in part),
                "longitude": ",".join(f"{r['lon']:.4f}" for r in part),
                "daily": "precipitation_sum", "forecast_days": HORIZON_DAYS,
            }, len(part))
            for reg, d in zip(part, res):
                # `precipitation_sum` alone is one run (control), not the mean
                # (verified: 3.7 mm vs a 12.4 mm member mean); average every
                # series with enough of the window to be a real 30-day total
                totals = [sum(x for x in xs[:HORIZON_DAYS] if x is not None)
                          for k, xs in (d.get("daily") or {}).items()
                          if k.startswith("precipitation_sum")
                          and sum(x is not None for x in xs[:HORIZON_DAYS]) >= HORIZON_DAYS * 0.8]
                if not totals:
                    empty += 1
                    continue
                rows.append((reg["id"], today, sum(totals) / len(totals)))
            del res
    with conn() as c, c.cursor() as cur:
        cur.executemany(
            """
            INSERT INTO indicator (region_id, metric, period, value, unit, source_id, confidence, is_modelled)
            VALUES (%s, 'rain_forecast_30d', %s, %s, 'mm', 'open_meteo_seasonal', 3, FALSE)
            ON CONFLICT (region_id, metric, period) DO UPDATE SET value = EXCLUDED.value, computed_at = now()
            """,
            rows,
        )
    log.info("musiman: %d wilayah, %d tanpa data", len(rows), empty)
    return len(rows)


PERFORMANCE_RATIO = 0.8   # losses: heat, inverter, wiring, dirt; a common default
_solar_cache: dict[tuple, tuple[float, dict]] = {}   # ponytail: per-process, 1 hour
SOLAR_TTL_S = 3600


def solar_forecast(lat: float, lon: float, kwp: float, tilt: float, azimuth: float) -> dict:
    """Estimated PV output for the next 2 days: kWp x irradiance on the panel
    plane (W/m², Open-Meteo) / 1000 x performance ratio. An estimate, not a
    manufacturer's yield model; good for "is my panel underperforming?"."""
    key = (round(lat, 2), round(lon, 2), round(kwp, 2), round(tilt), round(azimuth))
    hit = _solar_cache.get(key)
    if hit and time.monotonic() - hit[0] < SOLAR_TTL_S:
        return hit[1]
    r = httpx.get(FORECAST, timeout=15, params={
        "latitude": key[0], "longitude": key[1], "hourly": "global_tilted_irradiance",
        "tilt": key[3], "azimuth": key[4], "forecast_days": 2, "timezone": "Asia/Jakarta"})
    r.raise_for_status()
    h = r.json()["hourly"]
    hours = [{"time": t, "kw": round(kwp * (g or 0) / 1000 * PERFORMANCE_RATIO, 3)}
             for t, g in zip(h["time"], h["global_tilted_irradiance"])]
    days: dict[str, float] = {}
    for x in hours:
        days[x["time"][:10]] = days.get(x["time"][:10], 0) + x["kw"]   # 1-hour steps: kW -> kWh
    out = {"kwp": kwp, "tilt": key[3], "azimuth": key[4], "performance_ratio": PERFORMANCE_RATIO,
           "daily": [{"date": d, "kwh": round(v, 2)} for d, v in days.items()], "hourly": hours}
    _solar_cache[key] = (time.monotonic(), out)
    return out
