"""Fire: NASA FIRMS hotspots → observations → per-region indicators.

This is the vertical built end to end. The other aspects follow the same
shape: fetch → observation rows → aggregate into indicator rows.
"""
import csv
import io
import logging
import time
from datetime import datetime, timedelta, timezone

import httpx

from ..config import HTTP_TIMEOUT, FIRMS_MAP_KEY, IDN_BBOX
from ..db import conn, execute, query

log = logging.getLogger(__name__)

# Keyless regional feed covering Indonesia. 24h/48h/7d variants exist.
FIRMS_CSV = (
    "https://firms.modaps.eosdis.nasa.gov/data/active_fire/"
    "suomi-npp-viirs-c2/csv/SUOMI_VIIRS_C2_SouthEast_Asia_{window}.csv"
)
FIRMS_AREA = (
    "https://firms.modaps.eosdis.nasa.gov/api/area/csv/"
    "{key}/VIIRS_SNPP_NRT/{bbox}/{days}"
)

CONFIDENCE_RANK = {"low": 1, "nominal": 3, "high": 5}

# The hotspots every count, list and index uses: one satellite (VIIRS SNPP) and
# no low-confidence detections. The other satellites see the same fire on their
# own passes, so counting them too counted one fire up to five times; low
# confidence is mostly sun glint and hot surfaces (FIRMS' own guidance). The
# other rows stay stored as a backup feed. Unqualified columns of `observation`.
COUNTED = "source_id = 'firms_viirs' AND attrs->>'confidence' <> 'low'"
# How far outside a province polygon a detection still counts as Indonesia's:
# a coastal fire's pixel can sit just off the boundary. Points beyond it are
# fires in Timor-Leste or Malaysia, or flares at sea, inside the bounding box only.
NEAR_LAND_DEG = 0.02


def confidence(raw: str | None) -> str:
    """VIIRS says low/nominal/high; MODIS gives 0-100. One scale for both,
    with FIRMS' MODIS classes: below 30 low, 30-79 nominal, 80 and up high."""
    raw = (raw or "nominal").strip().lower()
    if raw in ("l", "n", "h"):
        return {"l": "low", "n": "nominal", "h": "high"}[raw]
    try:
        n = float(raw)
    except ValueError:
        return raw if raw in CONFIDENCE_RANK else "nominal"
    return "low" if n < 30 else "nominal" if n < 80 else "high"

# Other keyless 7-day regional feeds. Stored under source 'firms_extra' so
# the per-region aggregates below (calibrated on SNPP alone) don't count one
# fire three times; /hotspots and the Agent still see every detection.
FIRMS_EXTRA = [
    "https://firms.modaps.eosdis.nasa.gov/data/active_fire/modis-c6.1/csv/MODIS_C6_1_SouthEast_Asia_7d.csv",
    "https://firms.modaps.eosdis.nasa.gov/data/active_fire/noaa-20-viirs-c2/csv/J1_VIIRS_C2_SouthEast_Asia_7d.csv",
    "https://firms.modaps.eosdis.nasa.gov/data/active_fire/noaa-21-viirs-c2/csv/J2_VIIRS_C2_SouthEast_Asia_7d.csv",
]


def _fetch_csv(days: int = 7):
    """Iterator over CSV rows (not a list: see _store)."""
    """Prefer the area API when a key is configured; fall back to the open feed."""
    with httpx.Client(timeout=HTTP_TIMEOUT, follow_redirects=True) as client:
        if FIRMS_MAP_KEY:
            w, s, e, n = IDN_BBOX
            url = FIRMS_AREA.format(
                key=FIRMS_MAP_KEY, bbox=f"{w},{s},{e},{n}", days=min(days, 10)
            )
            r = client.get(url)
            if r.status_code == 200 and not r.text.startswith("Invalid"):
                return csv.DictReader(io.StringIO(r.text))
            log.warning("FIRMS area API ditolak, memakai feed terbuka: %s", r.text[:80])

        window = "7d" if days > 2 else "24h"
        r = client.get(FIRMS_CSV.format(window=window))
        r.raise_for_status()
        return csv.DictReader(io.StringIO(r.text))


def ingest_hotspots(days: int = 7) -> int:
    """Load SNPP hotspots inside the Indonesia bbox into `observation`."""
    return _store(_fetch_csv(days), "firms_viirs")


def ingest_extra_hotspots() -> int:
    """MODIS + NOAA-20/21, one feed at a time (each is ~5 MB of CSV; holding
    all three at once overran a 1 GB VPS). One failing feed doesn't drop the
    others."""
    total, errors = 0, []
    with httpx.Client(timeout=HTTP_TIMEOUT, follow_redirects=True) as client:
        for url in FIRMS_EXTRA:
            try:
                r = client.get(url)
                r.raise_for_status()
                total += _store(csv.DictReader(io.StringIO(r.text)), "firms_extra")
                del r
            except Exception as exc:  # noqa: BLE001
                errors.append(f"{url.rsplit('/', 1)[-1]}: {exc}")
    if errors and not total:
        raise RuntimeError("; ".join(errors))
    for e in errors:
        log.warning("feed FIRMS gagal: %s", e)
    return total


BATCH = 5000   # rows per INSERT round trip; bounds memory on small servers


def _store(rows, source_id: str) -> int:
    """rows: any iterable of FIRMS CSV dicts; streamed, inserted in batches."""
    w, s, e, n = IDN_BBOX
    batch, stored = [], 0
    for r in rows:
        try:
            lat, lon = float(r["latitude"]), float(r["longitude"])
        except (KeyError, ValueError):
            continue
        if not (w <= lon <= e and s <= lat <= n):
            continue
        # acq_time is HHMM, zero-padded inconsistently
        t = str(r.get("acq_time", "0")).zfill(4)
        try:
            when = datetime.strptime(
                f"{r['acq_date']} {t[:2]}:{t[2:]}", "%Y-%m-%d %H:%M"
            ).replace(tzinfo=timezone.utc)
        except ValueError:
            continue
        try:
            frp = float(r.get("frp") or 0)
        except ValueError:
            frp = 0.0
        batch.append((source_id, when, frp, confidence(r.get("confidence")),
                      r.get("daynight", ""), r.get("satellite", ""), lon, lat))
        if len(batch) >= BATCH:
            _insert(batch)
            stored += len(batch)
            batch = []
    if batch:
        _insert(batch)
        stored += len(batch)

    if not stored:
        log.warning("tidak ada titik panas dalam bbox Indonesia")
        return 0
    log.info("%d titik panas masuk (%s)", stored, source_id)
    return stored


def _insert(rows: list[tuple]) -> None:
    with conn() as c, c.cursor() as cur:
        cur.executemany(
            f"""
            INSERT INTO observation (source_id, metric, observed_at, value, attrs, geom)
            SELECT %s, 'hotspot', %s, %s,
                   jsonb_build_object('confidence', %s::text, 'daynight', %s::text, 'satellite', %s::text), p.g
            FROM (SELECT ST_SetSRID(ST_MakePoint(%s::float8, %s::float8), 4326) AS g) p
            -- Indonesia only: the bounding box also covers Timor-Leste, Malaysia and open sea
            WHERE EXISTS (SELECT 1 FROM region r WHERE r.level = 'provinsi'
                          AND ST_DWithin(r.geom, p.g, {NEAR_LAND_DEG}))
            ON CONFLICT DO NOTHING
            """,
            rows,
        )


def prune_outside() -> int:
    """Delete stored hotspots outside Indonesia (rows from before the ingest filter)."""
    return execute(
        "DELETE FROM observation o WHERE o.metric = 'hotspot' AND NOT EXISTS ("
        " SELECT 1 FROM region r WHERE r.level = 'provinsi' AND ST_DWithin(r.geom, o.geom, %s))", (NEAR_LAND_DEG,))


# ── possible fires ──────────────────────────────────────────────────────
# A hotspot is a hot pixel, not a fire: gas flares, smelters, power plants
# and volcanoes are hot too. Two filters turn hotspots into possible fires:
#  1. Static heat: FIRMS' own Static Thermal Anomalies mask (400 m grid,
#     cells seen again and again) is a viewer layer with no download, so the
#     same idea runs on our stored hotspots. Peat fires smoulder for weeks in
#     one place, so "static" also needs the heat to recur across months: a
#     fire season is about three; industry burns all year. The mask starts
#     empty and grows with the stored history.
#  2. Known plants: FIRMS filters its mask with power plant inventories; the
#     Climate TRACE plants we already store (ingest/energy.py) do the same
#     here. Solar, wind and hydro plants give off no heat and are ignored.
#  3. Persistence: one detection may be noise; detections within ~1 km of
#     each other (one cluster, so a fire on a grid line isn't split) seen on
#     at least two passes (any satellite) within the window are a possible fire.
STATIC_CELL_DEG = 0.0036     # ~400 m, FIRMS' mask grid
STATIC_MIN_DAYS = 5          # FIRMS: 5+ detections in a year
STATIC_MIN_MONTHS = 4
STATIC_LOOKBACK_DAYS = 400
EVENT_CLUSTER_DEG = 0.01     # ~1.1 km: one fire across satellites' pixel offsets
EVENT_MIN_PASSES = 2
FIRE_WINDOW_HOURS = 48       # FIRMS feeds are refreshed twice a day
PLANT_RADIUS_DEG = 0.01      # ~1 km around a thermal power plant

SATELLITES = {"N": "VIIRS S-NPP", "N20": "VIIRS NOAA-20", "N21": "VIIRS NOAA-21",
              "1": "VIIRS NOAA-20", "2": "VIIRS NOAA-21",
              "T": "MODIS Terra", "Terra": "MODIS Terra", "A": "MODIS Aqua", "Aqua": "MODIS Aqua"}


def refresh_static_cells() -> int:
    """Rebuild static_heat_cell from every stored non-low hotspot of the
    lookback period, all satellites. Returns the number of static cells."""
    # Limit: full scan of the period's hotspots twice a day; keep a running
    # per-cell tally if the observation table outgrows that
    with conn() as c, c.cursor() as cur:
        cur.execute("DELETE FROM static_heat_cell")
        cur.execute(
            """
            INSERT INTO static_heat_cell (gx, gy, days, months, first_seen, last_seen)
            SELECT gx, gy, COUNT(DISTINCT observed_at::date), COUNT(DISTINCT date_trunc('month', observed_at)),
                   MIN(observed_at), MAX(observed_at)
            FROM (SELECT floor(ST_X(geom) / %(cell)s)::int AS gx, floor(ST_Y(geom) / %(cell)s)::int AS gy, observed_at
                  FROM observation
                  WHERE metric = 'hotspot' AND attrs->>'confidence' <> 'low'
                    AND observed_at >= now() - make_interval(days => %(lookback)s)) d
            GROUP BY gx, gy
            HAVING COUNT(DISTINCT observed_at::date) >= %(days)s
               AND COUNT(DISTINCT date_trunc('month', observed_at)) >= %(months)s
            """,
            {"cell": STATIC_CELL_DEG, "lookback": STATIC_LOOKBACK_DAYS,
             "days": STATIC_MIN_DAYS, "months": STATIC_MIN_MONTHS},
        )
        n = cur.execute("SELECT COUNT(*) AS n FROM static_heat_cell").fetchone()["n"]
    log.info("%d sel panas statis", n)
    return n


# Hotspots change only when FIRMS is ingested (a few times a day), yet /notifications is polled
# every 30-60 s by every open dashboard and map: the answer is kept for a few minutes.
# Per-process cache: several API workers would each keep their own (a shared cache would fix that).
CACHE_SECONDS = 300
_cache: dict[tuple[str | None, int], tuple[float, list[dict]]] = {}


def possible_fires(region_id: str | None = None, hours: int = FIRE_WINDOW_HOURS) -> list[dict]:
    """Possible fires (see _possible_fires), reused for CACHE_SECONDS. Each caller gets its own copies."""
    key, now = (region_id, hours), time.monotonic()
    hit = _cache.get(key)
    if not hit or now - hit[0] >= CACHE_SECONDS:
        hit = _cache[key] = (now, _possible_fires(region_id, hours))
    return [dict(f) for f in hit[1]]


def _possible_fires(region_id: str | None = None, hours: int = FIRE_WINDOW_HOURS) -> list[dict]:
    """Possible fires per kabkota: clusters of non-low hotspots away from
    static heat and thermal power plants, seen on at least two passes within
    `hours`. `confirmed` = a GDACS wildfire is reported within 0.5°.
    region_id narrows to detections inside it."""
    events = query(
        """
        WITH d AS (
          SELECT observed_at, value AS frp, attrs->>'satellite' AS sat, geom,
                 floor(ST_X(geom) / %(scell)s)::int AS gx, floor(ST_Y(geom) / %(scell)s)::int AS gy
          FROM observation
          WHERE metric = 'hotspot' AND attrs->>'confidence' <> 'low'
            AND observed_at >= now() - make_interval(hours => %(hours)s)
            AND (%(region_id)s::text IS NULL OR ST_Intersects(
                 (SELECT geom FROM region WHERE id = %(region_id)s), observation.geom))
        ), live AS (
          SELECT d.*, ST_ClusterDBSCAN(d.geom, %(eps)s, 1) OVER () AS cid
          FROM d
          WHERE NOT EXISTS (SELECT 1 FROM static_heat_cell s
                            WHERE s.gx BETWEEN d.gx - 1 AND d.gx + 1 AND s.gy BETWEEN d.gy - 1 AND d.gy + 1)
            AND NOT EXISTS (SELECT 1 FROM observation pp
                            WHERE pp.metric = 'power_plant' AND ST_DWithin(pp.geom, d.geom, %(plant)s)
                              AND COALESCE(pp.attrs->>'fuel', '') !~* '(solar|wind|hydro)')
        ), ev AS (
          SELECT COUNT(*) AS detections, COUNT(DISTINCT observed_at) AS passes,
                 array_agg(DISTINCT sat) AS sats, MAX(frp) AS frp_max,
                 MIN(observed_at) AS first_seen, MAX(observed_at) AS last_seen,
                 ST_Centroid(ST_Collect(geom)) AS g
          FROM live
          GROUP BY cid
          HAVING COUNT(DISTINCT observed_at) >= %(passes)s
        )
        SELECT ev.detections, ev.passes, ev.sats, ev.frp_max, ev.first_seen, ev.last_seen,
               ST_X(ev.g) AS lon, ST_Y(ev.g) AS lat, k.id AS region_id, k.name, p.name AS province,
               EXISTS (SELECT 1 FROM observation w
                       WHERE w.metric = 'disaster' AND w.source_id = 'gdacs' AND w.attrs->>'type' = 'wildfire'
                         AND (w.attrs->>'current' = 'true' OR w.observed_at >= now() - interval '7 days')
                         AND ST_DWithin(w.geom, ev.g, 0.5)) AS confirmed
        FROM ev
        JOIN LATERAL (SELECT id, name, parent_id FROM region
                      WHERE level = 'kabkota' AND ST_DWithin(geom, ev.g, 0.05)
                      ORDER BY geom <-> ev.g LIMIT 1) k ON TRUE
        LEFT JOIN region p ON p.id = k.parent_id
        """,
        {"scell": STATIC_CELL_DEG, "eps": EVENT_CLUSTER_DEG, "hours": hours, "plant": PLANT_RADIUS_DEG,
         "passes": EVENT_MIN_PASSES, "region_id": region_id},
    )
    return group_fires(events)


def group_fires(events: list[dict]) -> list[dict]:
    """Events -> one row per kabkota: how many fire cells, their strongest
    point, every satellite that saw them. Confirmed regions first, then by
    cell count."""
    out: dict[str, dict] = {}
    for e in events:
        r = out.get(e["region_id"])
        if r is None:
            r = out[e["region_id"]] = {
                "region_id": e["region_id"], "name": e["name"], "province": e["province"],
                "clusters": 0, "detections": 0, "satellites": set(), "frp_max": 0.0,
                "first_seen": e["first_seen"], "last_seen": e["last_seen"],
                "lon": e["lon"], "lat": e["lat"], "confirmed": False}
        r["clusters"] += 1
        r["detections"] += e["detections"]
        r["satellites"] |= {SATELLITES.get(s, s) for s in e["sats"] if s}
        if (e["frp_max"] or 0) >= r["frp_max"]:
            r.update(frp_max=e["frp_max"] or 0.0, lon=e["lon"], lat=e["lat"])
        r["first_seen"] = min(r["first_seen"], e["first_seen"])
        r["last_seen"] = max(r["last_seen"], e["last_seen"])
        r["confirmed"] = r["confirmed"] or e["confirmed"]
    rows = [{**r, "satellites": sorted(r["satellites"])} for r in out.values()]
    return sorted(rows, key=lambda r: (not r["confirmed"], -r["clusters"], -r["frp_max"]))


def aggregate_fire_indicators() -> int:
    """Roll hotspots up to regions: count, peak intensity, and a risk index.

    The risk index is explicitly a derived number — it is stored against
    `derived_fire_risk`, whose `is_modelled` flag is TRUE, so the API can
    label it as a model output rather than an observation.
    """
    today = datetime.now(timezone.utc).date()
    since = today - timedelta(days=7)

    # counts and peak FRP per region
    n = execute(
        """
        INSERT INTO indicator (region_id, metric, period, value, unit, source_id,
                               confidence, is_modelled)
        SELECT r.id, 'hotspot_count_7d', %(today)s, COUNT(o.id), 'titik',
               'firms_viirs', 5, FALSE
        FROM region r
        LEFT JOIN observation o
          ON o.metric = 'hotspot'
         AND o.source_id = 'firms_viirs' AND o.attrs->>'confidence' <> 'low'  -- COUNTED
         AND o.observed_at >= %(since)s
         AND ST_Intersects(o.geom, r.geom)
        GROUP BY r.id
        ON CONFLICT (region_id, metric, period) DO UPDATE
          SET value = EXCLUDED.value, computed_at = now()
        """,
        {"today": today, "since": since},
    )

    execute(
        """
        INSERT INTO indicator (region_id, metric, period, value, unit, source_id,
                               confidence, is_modelled)
        SELECT r.id, 'hotspot_frp_max', %(today)s, COALESCE(MAX(o.value), 0), 'MW',
               'firms_viirs', 5, FALSE
        FROM region r
        LEFT JOIN observation o
          ON o.metric = 'hotspot'
         AND o.source_id = 'firms_viirs' AND o.attrs->>'confidence' <> 'low'  -- COUNTED
         AND o.observed_at >= %(since)s
         AND ST_Intersects(o.geom, r.geom)
        GROUP BY r.id
        ON CONFLICT (region_id, metric, period) DO UPDATE
          SET value = EXCLUDED.value, computed_at = now()
        """,
        {"today": today, "since": since},
    )

    # Composite risk. Hotspot density carries the most weight because it is
    # the only directly observed term; the weather terms modulate it.
    execute(
        """
        WITH parts AS (
          SELECT r.id AS region_id,
                 COALESCE(h.value, 0) AS hotspots,
                 GREATEST(r.area_km2, 1) AS area_km2,
                 COALESCE(d.value, 0)  AS dry_days,
                 COALESCE(rh.value, 80) AS humidity,
                 COALESCE(w.value, 5)   AS wind
          FROM region r
          LEFT JOIN indicator_latest h  ON h.region_id  = r.id AND h.metric  = 'hotspot_count_7d'
          LEFT JOIN indicator_latest d  ON d.region_id  = r.id AND d.metric  = 'dry_days'
          LEFT JOIN indicator_latest rh ON rh.region_id = r.id AND rh.metric = 'humidity_mean'
          LEFT JOIN indicator_latest w  ON w.region_id  = r.id AND w.metric  = 'wind_max'
        ), scored AS (
          SELECT region_id,
                 -- Hotspots per 10k km², log-compressed against a 2000/10k km²
                 -- ceiling. 600 (and before it 80) saturated: in October 2026
                 -- Kalimantan Tengah (~1160), Sumatera Selatan (~1040) and
                 -- Maluku Utara (~740) all scored the same full fire term, so
                 -- the weather terms alone ordered the provinces burning most.
                 LEAST(1.0, GREATEST(0.0,
                   ln(1 + hotspots / (area_km2 / 10000.0)) / ln(1 + 2000)
                 )) AS f_hot,
                 LEAST(1.0, dry_days / 30.0)               AS f_dry,
                 LEAST(1.0, GREATEST(0.0, (90 - humidity) / 50.0)) AS f_hum,
                 LEAST(1.0, wind / 40.0)                   AS f_wind
          FROM parts
        )
        INSERT INTO indicator (region_id, metric, period, value, unit, source_id,
                               confidence, is_modelled)
        -- Observed fire density carries 70 percent: it is the only directly
        -- measured term, and a province burning at 1000 hotspots/10k km2 is
        -- the top risk whatever today's humidity says. Weather modulates,
        -- it does not overrule.
        SELECT region_id, 'fire_risk', %(today)s,
               ROUND((100 * (0.70*f_hot + 0.14*f_dry + 0.10*f_hum + 0.06*f_wind))::numeric, 1),
               'indeks 0-100', 'derived_fire_risk', 3, TRUE
        FROM scored
        ON CONFLICT (region_id, metric, period) DO UPDATE
          SET value = EXCLUDED.value, computed_at = now()
        """,
        {"today": today},
    )
    log.info("indikator kebakaran diperbarui untuk %d wilayah", n)
    return n
