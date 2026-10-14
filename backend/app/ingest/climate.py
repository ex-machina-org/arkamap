"""Weather and air quality per region centroid (Open-Meteo).

Feeds three things: the drought terms of fire risk, the rainfall side of
water stress, and solar irradiance for the energy aspect.
"""
import logging
import time
from datetime import datetime, timedelta, timezone

import httpx

from ..config import HTTP_TIMEOUT
from ..db import conn, query

log = logging.getLogger(__name__)

WEATHER = "https://api.open-meteo.com/v1/forecast"
AIRQ = "https://air-quality-api.open-meteo.com/v1/air-quality"
FLOOD = "https://flood-api.open-meteo.com/v1/flood"


def _centroids() -> list[dict]:
    return query(
        """
        SELECT id, name,
               ST_X(ST_PointOnSurface(geom)) AS lon,
               ST_Y(ST_PointOnSurface(geom)) AS lat
        FROM region
        ORDER BY id
        """
    )


def _dry_spell(precip: list[float | None]) -> int:
    """Consecutive days at the end of the series with < 1 mm rain."""
    n = 0
    for v in reversed(precip):
        if v is None or v >= 1.0:
            break
        n += 1
    return n


def _fetch(client: httpx.Client, url: str, params: dict, n: int, tries: int = 3) -> list[dict]:
    """Exactly n results, one per location, in order. Open-Meteo answers 429
    after a few large batches; retry with a pause, and if it still fails
    return n empty dicts. Returning fewer than n (e.g. the one error object)
    would shift every later batch onto the wrong regions."""
    for attempt in range(tries):
        r = client.get(url, params=params)
        if r.status_code == 429 and attempt < tries - 1:
            time.sleep(10 * (attempt + 1))
            continue
        body = r.json() if r.status_code == 200 else None
        if isinstance(body, dict):
            body = [body]            # a single location comes back unwrapped
        if isinstance(body, list) and len(body) == n:
            return body
        log.warning("open-meteo %s: HTTP %s untuk %d lokasi; dilewati",
                    url.split("/")[2], r.status_code, n)
        return [{}] * n
    return [{}] * n


WX_METRICS = ["rain_30d", "dry_days", "humidity_mean", "temp_max_mean", "temp_max_peak",
              "wind_max", "wind_direction", "wind_speed", "solar_ghi",
              "uv_index_max", "heat_index_max", "wet_bulb_max"]
AQ_METRICS = ["pm25_mean", "no2_mean", "co_mean", "pm25_forecast_max", "aqi_forecast_max"]
FORECAST_HOURS = 48


def _air_and_water(region_id: str, aq: dict, fl: dict, add, failed: dict) -> None:
    """Air quality and river discharge for one region; empty dict = fetch failed."""
    if not fl:
        failed["fl"].append(region_id)
    else:
        # GloFAS river discharge: the surface-water side of the water balance,
        # which rainfall alone does not capture.
        rqv = [x for x in fl.get("daily", {}).get("river_discharge") or [] if x is not None]
        if rqv:
            add("river_discharge", sum(rqv) / len(rqv), "m³/detik", "open_meteo_flood")
    if not aq:
        failed["aq"].append(region_id)
        return
    # The response runs from 7 days ago into the next days: hours up to now
    # are the observed-period means, hours after now are the forecast.
    hourly = aq.get("hourly", {})
    times = hourly.get("time") or []
    now = datetime.now(timezone.utc)
    until = (now + timedelta(hours=FORECAST_HOURS)).strftime("%Y-%m-%dT%H:%M")
    now_s = now.strftime("%Y-%m-%dT%H:%M")
    past = [i for i, t in enumerate(times) if t <= now_s] if times else None
    ahead = [i for i, t in enumerate(times) if now_s < t <= until]

    def vals(var: str, idx) -> list[float]:
        xs = hourly.get(var) or []
        pick = xs if idx is None else [xs[i] for i in idx if i < len(xs)]
        return [x for x in pick if x is not None]

    # NO2 is the traffic pollutant: most of it at street level comes from
    # vehicle exhaust, so it is the keyless proxy for traffic emissions. CO
    # adds combustion (vehicles and burning).
    for var, metric in (("pm2_5", "pm25_mean"), ("nitrogen_dioxide", "no2_mean"),
                        ("carbon_monoxide", "co_mean")):
        v = vals(var, past)
        if v:
            add(metric, sum(v) / len(v), "µg/m³", "open_meteo_aq", 3, True)
    # forecast: what the next two days look like, for health warnings.
    # Every air value is the CAMS model (no monitor network behind it), so it is flagged
    # modelled; and the US AQI scale ends at 500 ("hazardous"): Open-Meteo extrapolates
    # past it (1565 over Pulang Pisau's peat fires), a number the scale gives no meaning.
    if (v := vals("pm2_5", ahead)):
        add("pm25_forecast_max", max(v), "µg/m³", "open_meteo_aq", 3, True)
    if (v := vals("us_aqi", ahead)):
        add("aqi_forecast_max", min(max(v), 500), "US AQI", "open_meteo_aq", 3, True)


def ingest_climate() -> int:
    regions = _centroids()
    if not regions:
        log.warning("belum ada wilayah; jalankan load_regions dulu")
        return 0

    today = datetime.now(timezone.utc).date()
    rows: list[tuple] = []

    # Open-Meteo batches coordinates in one request, but 500+ of them blow
    # past the URL length limit, so send them in chunks and stitch the
    # responses back together in region order.
    CHUNK = 80
    wx: list[dict] = []
    aq: list[dict] = []
    fl: list[dict] = []
    with httpx.Client(timeout=HTTP_TIMEOUT) as client:
        for i in range(0, len(regions), CHUNK):
            part = regions[i:i + CHUNK]
            lats = ",".join(f"{r['lat']:.4f}" for r in part)
            lons = ",".join(f"{r['lon']:.4f}" for r in part)

            wx.extend(_fetch(client, WEATHER, {
                "latitude": lats, "longitude": lons,
                "daily": "precipitation_sum,temperature_2m_max,"
                         "relative_humidity_2m_mean,wind_speed_10m_max,"
                         "wind_direction_10m_dominant,shortwave_radiation_sum,"
                         "uv_index_max,apparent_temperature_max,wet_bulb_temperature_2m_max",
                # today + 2 days ahead, for UV and heat; past metrics are cut at today
                "past_days": 30, "forecast_days": 3, "timezone": "UTC",
            }, len(part)))
            aq.extend(_fetch(client, AIRQ, {
                "latitude": lats, "longitude": lons,
                "hourly": "pm2_5,nitrogen_dioxide,carbon_monoxide,us_aqi", "past_days": 7,
                "forecast_days": 3, "timezone": "UTC",
            }, len(part)))
            fl.extend(_fetch(client, FLOOD, {
                "latitude": lats, "longitude": lons,
                "daily": "river_discharge", "past_days": 30, "forecast_days": 1,
            }, len(part)))
            log.info("iklim: %d/%d wilayah", min(i + CHUNK, len(regions)), len(regions))

    # A failed fetch is an empty dict (see _fetch). Such a region gets no row
    # for that source: storing the defaults (0 mm rain, 0 dry days, 80 %
    # humidity) would publish made-up numbers as observations.
    failed: dict[str, list[str]] = {"wx": [], "aq": [], "fl": []}
    for i, reg in enumerate(regions):
        add = lambda m, v, u, src, conf=5, mod=False: rows.append(
            (reg["id"], m, today, float(v), u, src, conf, mod)
        )
        _air_and_water(reg["id"], aq[i], fl[i], add, failed)
        if not wx[i]:
            failed["wx"].append(reg["id"])
            continue
        d = wx[i].get("daily", {})
        # days up to and including today are observations; later days are
        # forecast and must not leak into 30-day totals or dry spells
        n_past = sum(1 for t in d.get("time") or [] if t <= today.isoformat()) or None
        past = lambda k: (d.get(k) or [])[:n_past]            # noqa: E731
        ahead = lambda k: [x for x in (d.get(k) or [])[(n_past or 1) - 1:] if x is not None]  # noqa: E731
        precip = past("precipitation_sum")
        hum = past("relative_humidity_2m_mean")
        wind = past("wind_speed_10m_max")
        wdir = past("wind_direction_10m_dominant")
        rad = past("shortwave_radiation_sum")
        temp = past("temperature_2m_max")
        # today and the next two days: the worst of each, for warnings
        for key, metric, unit in (("uv_index_max", "uv_index_max", "indeks UV"),
                                  ("apparent_temperature_max", "heat_index_max", "°C"),
                                  ("wet_bulb_temperature_2m_max", "wet_bulb_max", "°C")):
            if (xs := ahead(key)):
                add(metric, max(xs), unit, "open_meteo_daily")

        def _mean(xs, default=0.0):
            vals = [x for x in xs if x is not None]
            return sum(vals) / len(vals) if vals else default

        rain30 = sum(x for x in precip if x is not None)
        add("rain_30d", rain30, "mm", "open_meteo_daily")
        add("dry_days", _dry_spell(precip), "hari", "open_meteo_daily")
        add("humidity_mean", _mean(hum, 80), "%", "open_meteo_daily")

        # Temperature was already being requested from Open-Meteo and then
        # thrown away. Two figures, because they answer different questions:
        # the 7-day mean is what a place feels like now, while the 30-day
        # peak is the worst it got and is what heat planning cares about.
        recent = [x for x in temp[-7:] if x is not None]
        if recent:
            add("temp_max_mean", sum(recent) / len(recent), "°C", "open_meteo_daily")
        peak = [x for x in temp if x is not None]
        if peak:
            add("temp_max_peak", max(peak), "°C", "open_meteo_daily")
        add("wind_max", max((x for x in wind if x is not None), default=0), "km/jam", "open_meteo_daily")

        # Latest day's dominant bearing, not a mean: direction is circular,
        # so averaging 350 and 10 degrees gives 180 — the exact opposite of
        # the real wind. The most recent value is also what a "where is the
        # smoke blowing now" question actually wants.
        recent_dir = next((x for x in reversed(wdir) if x is not None), None)
        recent_spd = next((x for x in reversed(wind) if x is not None), None)
        # Stored but deliberately absent from metric_def: a bearing has no
        # "bad" end, so both the choropleth and the region panel would
        # rank 359 degrees as near-worst and 1 degree as near-best. The
        # particle layer already shows direction, read straight from
        # /windgrid. Kept in the table so a future circular-aware display
        # has history to draw on.
        if recent_dir is not None:
            add("wind_direction", float(recent_dir) % 360, "derajat", "open_meteo_daily")
        if recent_spd is not None:
            add("wind_speed", float(recent_spd), "km/jam", "open_meteo_daily")

        # MJ/m²/day → kWh/m²/day
        if rad:
            add("solar_ghi", _mean(rad) / 3.6, "kWh/m²/hari", "open_meteo_daily")

    with conn() as c, c.cursor() as cur:
        # A region that failed now may still hold today's row from an earlier
        # run (possibly one of the old made-up zeros); drop it so the API
        # falls back to the last real value instead.
        for key, metrics in (("wx", WX_METRICS), ("aq", AQ_METRICS), ("fl", ["river_discharge"])):
            if failed[key]:
                cur.execute("DELETE FROM indicator WHERE period = %s AND region_id = ANY(%s)"
                            " AND metric = ANY(%s)", (today, failed[key], metrics))
        if any(failed.values()):
            log.warning("iklim: tanpa data (dilewati) cuaca %d, udara %d, sungai %d wilayah",
                        len(failed["wx"]), len(failed["aq"]), len(failed["fl"]))
        cur.executemany(
            """
            INSERT INTO indicator (region_id, metric, period, value, unit,
                                   source_id, confidence, is_modelled)
            VALUES (%s,%s,%s,%s,%s,%s,%s,%s)
            ON CONFLICT (region_id, metric, period) DO UPDATE
              SET value = EXCLUDED.value, is_modelled = EXCLUDED.is_modelled,
                  confidence = EXCLUDED.confidence, computed_at = now()
            """,
            rows,
        )
    log.info("%d nilai iklim/udara disimpan", len(rows))
    return len(rows)


def aggregate_water_and_energy() -> int:
    """Derived indicators that depend on climate being loaded first."""
    today = datetime.now(timezone.utc).date()

    # Water stress: rainfall supply per person against a 60 L/day baseline.
    # Crude on purpose — it is flagged is_modelled and the card says so.
    from ..db import execute
    execute(
        """
        WITH s AS (
          SELECT r.id AS region_id,
                 GREATEST(r.area_km2, 1) AS area_km2,
                 GREATEST(COALESCE(r.population, 0), 1) AS pop,
                 COALESCE(rn.value, 0) AS rain_mm
          FROM region r
          LEFT JOIN indicator_latest rn ON rn.region_id = r.id AND rn.metric = 'rain_30d'
        ), s2 AS (
          -- GloFAS has no river cell at most province centroids, but does at
          -- kabupaten level, so roll the children up when the parent is null.
          SELECT s.*,
                 COALESCE(
                   rq.value,
                   (SELECT SUM(k.value)
                      FROM indicator_latest k
                      JOIN region kr ON kr.id = k.region_id
                     WHERE k.metric = 'river_discharge'
                       AND kr.parent_id = s.region_id),
                   0
                 ) AS discharge_m3s
          FROM s LEFT JOIN indicator_latest rq
            ON rq.region_id = s.region_id AND rq.metric = 'river_discharge'
        ), calc AS (
          SELECT region_id,
                 -- Two supplies: rainfall that becomes usable (15 percent of
                 -- what falls), plus river flow over the same 30 days.
                 (rain_mm * area_km2 * 1000.0 * 0.15)
                   + (discharge_m3s * 86400.0 * 30.0 * 0.05) AS usable_m3,
                 (pop * 0.060 * 30.0) AS need_m3
          FROM s2
        )
        INSERT INTO indicator (region_id, metric, period, value, unit, source_id,
                               confidence, is_modelled)
        SELECT region_id, 'water_stress', %(today)s,
               ROUND((100 * LEAST(1.0, GREATEST(0.0,
                 1.0 - (usable_m3 / NULLIF(need_m3, 0))
               )))::numeric, 1),
               'indeks 0-100', 'derived_water', 3, TRUE
        FROM calc
        ON CONFLICT (region_id, metric, period) DO UPDATE
          SET value = EXCLUDED.value, computed_at = now()
        """,
        {"today": today},
    )

    # Population density (urban aspect) straight from the region table.
    execute(
        """
        INSERT INTO indicator (region_id, metric, period, value, unit, source_id,
                               confidence, is_modelled)
        SELECT r.id, 'population_density', %(today)s,
               ROUND((
                 CASE
                   WHEN r.population IS NOT NULL
                     THEN r.population / GREATEST(r.area_km2, 1)
                   -- Fallback only: kabupaten now carry their own census
                   -- population, so this applies to the handful of ADM2
                   -- features that are lakes/forests rather than regions.
                   ELSE COALESCE(p.population, 0) / GREATEST(p.area_km2, 1)
                 END
               )::numeric, 1),
               'jiwa/km²', 'cod_population',
               CASE WHEN r.population IS NOT NULL THEN 4 ELSE 2 END,
               r.population IS NULL
        FROM region r
        LEFT JOIN region p ON p.id = r.parent_id
        WHERE r.population IS NOT NULL OR p.population IS NOT NULL
        ON CONFLICT (region_id, metric, period) DO UPDATE
          SET value = EXCLUDED.value, computed_at = now()
        """,
        {"today": today},
    )

    # Rooftop solar potential: irradiance × assumed built area × yield.
    # Built area is itself modelled here (density × region area) until the
    # OSM building ingest fills it in per region.
    execute(
        """
        WITH s AS (
          SELECT r.id AS region_id,
                 GREATEST(r.area_km2,1) AS area_km2,
                 COALESCE(pd.value, 0) AS pop_density,
                 COALESCE(g.value, 4.5) AS ghi
          FROM region r
          LEFT JOIN indicator_latest pd ON pd.region_id = r.id AND pd.metric = 'population_density'
          LEFT JOIN indicator_latest g  ON g.region_id  = r.id AND g.metric  = 'solar_ghi'
        )
        INSERT INTO indicator (region_id, metric, period, value, unit, source_id,
                               confidence, is_modelled)
        SELECT region_id, 'solar_rooftop_mwp', %(today)s,
               ROUND((
                 -- roof area proxy: 12 m² of usable roof per person,
                 -- capped by a plausible built fraction of the region
                 LEAST(area_km2 * 1e6 * 0.04,
                       pop_density * area_km2 * 12.0)
                 * 0.19 * 0.7 / 1000.0
               )::numeric, 1),
               'MWp', 'derived_energy', 2, TRUE
        FROM s
        ON CONFLICT (region_id, metric, period) DO UPDATE
          SET value = EXCLUDED.value, computed_at = now()
        """,
        {"today": today},
    )
    return 1
