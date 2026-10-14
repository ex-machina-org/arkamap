"""Energy: real power stations (Climate TRACE) and long-term solar (NASA POWER).

Both are keyless public APIs. Everything here is an observation from the
publisher, not a model of ours — except where noted.
"""
import logging
from datetime import datetime, timezone

import httpx

from ..config import HTTP_TIMEOUT
from ..db import conn, execute, query

log = logging.getLogger(__name__)

CLIMATE_TRACE = "https://api.climatetrace.org/v6/assets"
NASA_POWER = "https://power.larc.nasa.gov/api/temporal/climatology/point"

# A single plant above this is implausible (the largest in Indonesia is ~4 GW);
# Climate TRACE mixes units on some rows, so anything larger is dropped rather
# than silently inflating a region's capacity by orders of magnitude.
MAX_PLAUSIBLE_MW = 6000


def ingest_power_plants() -> int:
    """Load power stations as point observations, then aggregate per region."""
    assets: list[dict] = []
    with httpx.Client(timeout=HTTP_TIMEOUT, follow_redirects=True) as client:
        for offset in (0, 500, 1000):
            r = client.get(CLIMATE_TRACE, params={
                "countries": "IDN",
                "sectors": "electricity-generation",
                "limit": 500,
                "offset": offset,
            })
            if r.status_code != 200:
                break
            page = r.json().get("assets") or []
            if not page:
                break
            assets.extend(page)
            if len(page) < 500:
                break

    rows = []
    skipped = 0
    for a in assets:
        geom = (a.get("Centroid") or {}).get("Geometry")
        if not geom or len(geom) < 2:
            continue
        lon, lat = float(geom[0]), float(geom[1])

        summary = a.get("EmissionsSummary") or []
        cap = None
        for s in summary:
            if s.get("CapacityUnits") == "MW" and s.get("Capacity"):
                cap = float(s["Capacity"])
                break
        if cap is None:
            continue
        if cap > MAX_PLAUSIBLE_MW:
            skipped += 1
            continue

        rows.append((
            datetime.now(timezone.utc), cap,
            a.get("Name") or "", a.get("AssetType") or "", lon, lat,
        ))

    if skipped:
        log.warning("%d pembangkit dilewati (kapasitas tidak masuk akal)", skipped)
    if not rows:
        log.warning("tidak ada pembangkit terbaca")
        return 0

    with conn() as c, c.cursor() as cur:
        cur.execute("DELETE FROM observation WHERE source_id = 'climate_trace'")
        cur.executemany(
            """
            INSERT INTO observation (source_id, metric, observed_at, value, attrs, geom)
            VALUES ('climate_trace', 'power_plant', %s, %s,
                    jsonb_build_object('name', %s::text, 'fuel', %s::text),
                    ST_SetSRID(ST_MakePoint(%s::float8, %s::float8), 4326))
            ON CONFLICT DO NOTHING
            """,
            rows,
        )
    log.info("%d pembangkit listrik masuk", len(rows))
    return len(rows)


def aggregate_power_capacity() -> int:
    """Installed generation capacity per region, from the plants above."""
    today = datetime.now(timezone.utc).date()
    return execute(
        """
        INSERT INTO indicator (region_id, metric, period, value, unit, source_id,
                               confidence, is_modelled)
        SELECT r.id, 'power_capacity_mw', %(today)s,
               ROUND(COALESCE(SUM(o.value), 0)::numeric, 1), 'MW',
               'climate_trace', 4, FALSE
        FROM region r
        LEFT JOIN observation o
          ON o.metric = 'power_plant' AND ST_Intersects(o.geom, r.geom)
        GROUP BY r.id
        ON CONFLICT (region_id, metric, period) DO UPDATE
          SET value = EXCLUDED.value, computed_at = now()
        """,
        {"today": today},
    )


def ingest_solar_climatology(level: str = "provinsi") -> int:
    """Long-term annual GHI per region from NASA POWER.

    The Open-Meteo figure already stored is a rolling 30-day mean, so it moves
    with the season. This is the climatological annual average — the number an
    actual PV feasibility study would use.
    """
    regions = query(
        """
        SELECT id, ST_X(ST_PointOnSurface(geom)) AS lon,
               ST_Y(ST_PointOnSurface(geom)) AS lat
        FROM region WHERE level = %s ORDER BY id
        """,
        (level,),
    )
    if not regions:
        return 0

    today = datetime.now(timezone.utc).date()
    rows = []
    # POWER is one request per point, so this is province-only by default.
    with httpx.Client(timeout=HTTP_TIMEOUT) as client:
        for i, reg in enumerate(regions):
            try:
                d = client.get(NASA_POWER, params={
                    "parameters": "ALLSKY_SFC_SW_DWN",
                    "community": "RE",
                    "longitude": f"{reg['lon']:.4f}",
                    "latitude": f"{reg['lat']:.4f}",
                    "format": "JSON",
                }).json()
                p = d["properties"]["parameter"]["ALLSKY_SFC_SW_DWN"]
                ann = p.get("ANN")
                if ann is None:
                    months = [v for k, v in p.items() if k != "ANN" and v is not None]
                    ann = sum(months) / len(months) if months else None
                if ann is None or ann <= 0:
                    continue
                rows.append((reg["id"], "solar_ghi_annual", today, float(ann),
                             "kWh/m²/hari", "nasa_power", 5, False))
            except Exception as exc:  # noqa: BLE001 — skip the point, keep going
                log.warning("POWER gagal untuk %s: %s", reg["id"], exc)
            if (i + 1) % 10 == 0:
                log.info("NASA POWER: %d/%d wilayah", i + 1, len(regions))

    if not rows:
        return 0
    with conn() as c, c.cursor() as cur:
        cur.executemany(
            """
            INSERT INTO indicator (region_id, metric, period, value, unit,
                                   source_id, confidence, is_modelled)
            VALUES (%s,%s,%s,%s,%s,%s,%s,%s)
            ON CONFLICT (region_id, metric, period) DO UPDATE
              SET value = EXCLUDED.value, computed_at = now()
            """,
            rows,
        )
    log.info("%d nilai iradiasi tahunan disimpan", len(rows))
    return len(rows)
