"""A regular wind grid over Indonesia, for the animated particle layer.

Separate from climate.py on purpose. That module samples one point per
region — right for a per-wilayah indicator, wrong for a flow animation,
which needs values on an even lattice to interpolate between. Region
centroids are hundreds of kilometres apart in Papua and a few kilometres
apart in Java, so particles built on them would crawl in one place and
jump in another.

The grid is fetched on the ingest schedule and stored, never per request:
Open-Meteo rate-limits at roughly four rapid calls per minute, so a
browser-triggered fetch would fail on the first page load.
"""
import logging
import time
from datetime import datetime, timezone

import httpx

from ..config import HTTP_TIMEOUT, IDN_BBOX
from ..db import conn

log = logging.getLogger(__name__)

FORECAST = "https://api.open-meteo.com/v1/forecast"

# Open-Meteo's free tier is capped by DAILY call weight (roughly locations
# x variables), not by requests. Measured the hard way: repeated test runs
# exhausted it and every call returned 429 "Daily API request limit
# exceeded", which no amount of pacing or retrying can work around.
#
# 0.75 deg is the coarsest-that-still-looks-fine / finest-that-still-fits
# trade-off: 1,426 points x 4 variables = ~5,700 weight, leaving just
# enough headroom for the existing 06:00/18:00 schedule (2 runs) without a
# spare for manual refresh. Coarser (1.0-1.25 deg) rendered the heat
# basemap as a handful of giant blobs — too few points to tell one city
# from the next, which is the whole point of the layer.
STEP_DEG = 0.75
# Open-Meteo allows roughly four rapid calls per minute. With 200 points
# per chunk the whole grid is five calls, so throttling is certain, not
# exceptional — pace between chunks rather than only retrying after a 429.
CHUNK = 200
RETRY_WAIT_S = 30
RETRY_ATTEMPTS = 5
BETWEEN_CHUNKS_S = 16


def _grid() -> list[tuple[float, float]]:
    w, s, e, n = IDN_BBOX
    out = []
    lat = s
    while lat <= n + 1e-9:
        lon = w
        while lon <= e + 1e-9:
            out.append((lon, lat))
            lon += STEP_DEG
        lat += STEP_DEG
    return out


def ingest_wind_grid() -> int:
    pts = _grid()
    got: list[tuple] = []

    with httpx.Client(timeout=HTTP_TIMEOUT) as client:
        for i in range(0, len(pts), CHUNK):
            part = pts[i:i + CHUNK]
            params = {
                "latitude": ",".join(f"{p[1]:.2f}" for p in part),
                "longitude": ",".join(f"{p[0]:.2f}" for p in part),
                "current": "wind_speed_10m,wind_direction_10m,temperature_2m,soil_temperature_0cm",
                "timezone": "UTC",
            }
            # Wait before every chunk after the first: arriving under the
            # limit is cheaper than being refused and retrying.
            if i:
                time.sleep(BETWEEN_CHUNKS_S)
            resp = None
            for attempt in range(RETRY_ATTEMPTS):
                resp = client.get(FORECAST, params=params)
                if resp.status_code == 200:
                    break
                # A per-minute 429 clears after a wait; a daily one does
                # not, so stop immediately instead of sleeping for minutes
                # on a limit that will not lift until tomorrow.
                if "Daily" in resp.text:
                    raise RuntimeError(
                        "kuota harian Open-Meteo habis — grid angin/suhu "
                        "tidak bisa diperbarui sampai besok"
                    )
                log.info("grid angin: %s, tunggu %ss", resp.status_code, RETRY_WAIT_S)
                time.sleep(RETRY_WAIT_S)
            if resp is None or resp.status_code != 200:
                # Partial grids are worse than none: the map would paint a
                # heat surface over part of the country and leave the rest
                # blank, which reads as real data rather than a failure.
                raise RuntimeError(
                    f"grid angin: chunk {i // CHUNK} gagal setelah "
                    f"{RETRY_ATTEMPTS} percobaan (status "
                    f"{resp.status_code if resp else 'tidak ada respons'})"
                )

            body = resp.json()
            arr = body if isinstance(body, list) else [body]
            for k, obj in enumerate(arr):
                cur = obj.get("current") or {}
                deg, spd = cur.get("wind_direction_10m"), cur.get("wind_speed_10m")
                tmp = cur.get("temperature_2m")
                # Surface temperature, not air: asphalt and roofs run far
                # hotter than the air above them (Jakarta measured 42.2 C
                # surface against 33.2 C air), and that gap is the urban
                # heat island the map is meant to show.
                srf = cur.get("soil_temperature_0cm")
                if deg is None or spd is None:
                    continue
                lon, lat = part[k]
                # Both ride along on the same request, so the heat basemap
                # costs no extra calls against a rate-limited API.
                got.append((lon, lat, float(deg) % 360, float(spd),
                            None if tmp is None else float(tmp),
                            None if srf is None else float(srf)))

    if not got:
        raise RuntimeError("grid angin kosong")

    now = datetime.now(timezone.utc)
    with conn() as c, c.cursor() as cur:
        # Table lives in sql/003_wind_grid.sql. Replace wholesale: a partial
        # grid with stale corners would make particles flow into a boundary
        # that no longer exists.
        cur.execute("DELETE FROM wind_grid")
        cur.executemany(
            "INSERT INTO wind_grid (lon, lat, direction, speed, temperature,"
            " surface, observed_at) VALUES (%s,%s,%s,%s,%s,%s,%s)",
            [(lon, lat, d, s, t, sf, now) for lon, lat, d, s, t, sf in got],
        )

    log.info("grid angin: %d titik", len(got))
    return len(got)
