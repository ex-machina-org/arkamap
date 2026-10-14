"""Earthquakes: USGS catalogue → observations → per-region hazard index.

What this is NOT: a prediction. There is no scientifically accepted method
for forecasting when an earthquake will occur, and USGS says so plainly.
Everything here is either an event that already happened or a long-run
frequency derived from those events.

The hazard index answers "how much seismic energy has this area absorbed
historically", which is the standard basis for seismic zoning — not "when
will the next one hit".
"""
import logging
from datetime import date, datetime, timedelta, timezone

import httpx

from ..config import HTTP_TIMEOUT, IDN_BBOX
from ..db import conn, execute, query

log = logging.getLogger(__name__)


def urgency(mag: float, depth_km: float | None, tsunami: bool = False) -> str:
    """Action category for a dashboard, from magnitude, depth and the USGS
    tsunami flag. Rules, not a model: free, instant and explainable. Unknown
    depth counts as shallow (the cautious reading). Thresholds follow the
    usual practice: shallow (<= 70 km) M7+ is BMKG's tsunami-warning range,
    shallow M6+ is where damage becomes likely."""
    shallow = depth_km is None or depth_km <= 70
    if tsunami or (mag >= 7.0 and shallow):
        return "siaga_tsunami"
    if mag >= 6.0 and shallow:
        return "darurat"
    if mag >= 6.0 or (mag >= 5.0 and (depth_km is None or depth_km <= 300)):
        return "pantau"
    return "informasi"

USGS_QUERY = "https://earthquake.usgs.gov/fdsnws/event/1/query"
# EMSC's FDSN mirror. Many Indonesian events here are authored by BMKG,
# whose own API refuses requests from outside Indonesia.
EMSC_QUERY = "https://www.seismicportal.eu/fdsnws/event/1/query"

HAZARD_YEARS = 30

# USGS caps one query at 20k events. Indonesia over 30 years yields ~20k+
# at M4.5 (which silently truncates the catalogue and biases the index
# toward recent events) but ~6.9k at M5.0 — measured, not assumed. M5 is
# also roughly where damage becomes plausible.
HAZARD_MIN_MAG = 5.0
MAX_EVENTS = 20000

# How far offshore an event still counts toward a province. Indonesia's
# megathrust events sit off the west coast of Sumatra, so 0 would zero out
# exactly the provinces they threaten. At 2.0° inland provinces (Jambi,
# Sumatera Selatan) inherited the whole Sunda trench and scored 96+; 1.0°
# (~110 km) keeps the coast covered without reaching across the island.
OFFSHORE_DEG = 1.0

# Bounds for log10(summed energy). Calibrated against this pipeline's own
# output rather than a cell-binned approximation: at lo=7.5/hi=13.0 the
# mean landed at 74 with the top clamped, so the range is widened to spread
# provinces out instead of bunching them in the 80s and 90s.
ENERGY_LOG_MIN = 8.0
ENERGY_LOG_MAX = 15.0


def _fetch(start: date, end: date, min_mag: float) -> list[dict]:
    w, s, e, n = IDN_BBOX
    params = {
        "format": "geojson",
        "starttime": start.isoformat(),
        "endtime": end.isoformat(),
        "minlatitude": s, "maxlatitude": n,
        "minlongitude": w, "maxlongitude": e,
        "minmagnitude": min_mag,
        "limit": MAX_EVENTS,
        "orderby": "time",
    }
    with httpx.Client(timeout=HTTP_TIMEOUT, follow_redirects=True) as client:
        r = client.get(USGS_QUERY, params=params)
        r.raise_for_status()
        return r.json().get("features", [])


def ingest_quakes(days: int = 30, min_mag: float = 3.5) -> int:
    """Recent events as observation rows — the layer behind the index."""
    today = datetime.now(timezone.utc).date()
    feats = _fetch(today - timedelta(days=days), today + timedelta(days=1), min_mag)

    rows = []
    for f in feats:
        geom = (f.get("geometry") or {}).get("coordinates") or []
        p = f.get("properties") or {}
        if len(geom) < 2 or p.get("mag") is None or p.get("time") is None:
            continue
        lon, lat = geom[0], geom[1]
        depth = geom[2] if len(geom) > 2 else None
        when = datetime.fromtimestamp(p["time"] / 1000, tz=timezone.utc)
        mag = float(p["mag"])
        tsunami = bool(p.get("tsunami"))
        rows.append((
            when, mag, depth, p.get("place"), 1 if tsunami else 0,
            urgency(mag, depth, tsunami), lon, lat,
        ))

    if not rows:
        log.warning("USGS tidak mengembalikan gempa")
        return 0

    with conn() as c, c.cursor() as cur:
        cur.executemany(
            """
            INSERT INTO observation (source_id, metric, observed_at, value, attrs, geom)
            VALUES ('usgs_quake', 'quake', %s, %s,
                    jsonb_strip_nulls(jsonb_build_object(
                        'depth_km', %s::float8, 'place', %s::text,
                        'tsunami', %s::int, 'urgency', %s::text)),
                    ST_SetSRID(ST_MakePoint(%s::float8, %s::float8), 4326))
            ON CONFLICT DO NOTHING
            """,
            rows,
        )
    log.info("%d gempa masuk", len(rows))
    return len(rows)


def ingest_quakes_emsc(days: int = 30, min_mag: float = 3.5) -> int:
    """Second catalogue, so /quakes keeps updating when USGS is down.
    Stored as metric 'quake' under 'emsc_quake'; dedupe_quakes() then drops
    every EMSC row USGS also reported, so one event is never shown twice."""
    w, s, e, n = IDN_BBOX
    today = datetime.now(timezone.utc).date()
    with httpx.Client(timeout=HTTP_TIMEOUT, follow_redirects=True) as client:
        r = client.get(EMSC_QUERY, params={
            "format": "json", "limit": 5000, "minmag": min_mag,
            "starttime": (today - timedelta(days=days)).isoformat(),
            "endtime": (today + timedelta(days=1)).isoformat(),
            "minlat": s, "maxlat": n, "minlon": w, "maxlon": e,
        })
        # FDSN answers 204 No Content for an empty window
        feats = r.json().get("features", []) if r.status_code == 200 else []
        if r.status_code not in (200, 204):
            r.raise_for_status()

    rows = []
    for f in feats:
        p = f.get("properties") or {}
        if p.get("mag") is None or not p.get("time"):
            continue
        mag, depth = float(p["mag"]), p.get("depth")
        rows.append((
            datetime.fromisoformat(p["time"].replace("Z", "+00:00")), mag,
            depth, (p.get("flynn_region") or "").title() or None, p.get("auth"),
            urgency(mag, depth), p["lon"], p["lat"],
        ))
    if rows:
        with conn() as c, c.cursor() as cur:
            cur.executemany(
                """
                INSERT INTO observation (source_id, metric, observed_at, value, attrs, geom)
                VALUES ('emsc_quake', 'quake', %s, %s,
                        jsonb_strip_nulls(jsonb_build_object(
                            'depth_km', %s::float8, 'place', %s::text, 'agency', %s::text,
                            'urgency', %s::text)),
                        ST_SetSRID(ST_MakePoint(%s::float8, %s::float8), 4326))
                ON CONFLICT DO NOTHING
                """,
                rows,
            )
    log.info("%d gempa EMSC masuk", len(rows))
    return len(rows)


def classify_missing() -> int:
    """Give an urgency to quakes stored without one (older rows, or rows
    from when this used a model that wasn't available)."""
    rows = query("SELECT id, value, (attrs->>'depth_km')::float8 AS depth,"
                 " COALESCE((attrs->>'tsunami')::int, 0) AS tsunami FROM observation"
                 " WHERE metric = 'quake' AND NOT attrs ? 'urgency'")
    with conn() as c, c.cursor() as cur:
        cur.executemany(
            "UPDATE observation SET attrs = (attrs - 'urgency_confidence')"
            " || jsonb_build_object('urgency', %s::text) WHERE id = %s",
            [(urgency(r["value"], r["depth"], bool(r["tsunami"])), r["id"]) for r in rows])
    return len(rows)


# Which catalogue wins when two report the same event: BMKG (official,
# with felt reports and its own tsunami statement) > USGS (tsunami flag) >
# EMSC.
_PRIORITY = "CASE {t}.source_id WHEN 'bmkg_quake' THEN 3 WHEN 'usgs_quake' THEN 2 ELSE 1 END"


def dedupe_quakes() -> int:
    """Delete every quake row that is another row's duplicate, so one event is one point:
    - a revision: the agency later moved the same event by seconds and a few km
      (USGS does, BMKG re-solves; the row key includes time and place, so the
      revision arrived as a new row). The newest row, the latest solution, stays.
    - the same event in a lower-priority catalogue. Agencies' origin times differ
      by up to ~2 minutes (BMKG vs EMSC); a similar magnitude keeps two real
      quakes a minute apart from being merged.
    Order-independent, so it doesn't matter which catalogue was ingested first."""
    # ponytail: fixed windows (60 s / 0.15° same catalogue; 120 s / 1° / 1 magnitude across);
    # tighten if two real quakes ever get merged
    revisions = execute(
        """
        DELETE FROM observation old
        WHERE old.metric = 'quake'
          AND EXISTS (
            SELECT 1 FROM observation new
            WHERE new.metric = 'quake' AND new.source_id = old.source_id AND new.id > old.id
              AND new.observed_at BETWEEN old.observed_at - interval '60 seconds'
                                      AND old.observed_at + interval '60 seconds'
              AND ST_DWithin(new.geom, old.geom, 0.15))
        """
    )
    return revisions + execute(
        f"""
        DELETE FROM observation lo
        WHERE lo.metric = 'quake'
          AND EXISTS (
            SELECT 1 FROM observation hi
            WHERE hi.metric = 'quake' AND {_PRIORITY.format(t='hi')} > {_PRIORITY.format(t='lo')}
              AND hi.observed_at BETWEEN lo.observed_at - interval '120 seconds'
                                     AND lo.observed_at + interval '120 seconds'
              AND abs(hi.value - lo.value) <= 1.0
              AND ST_DWithin(hi.geom, lo.geom, 1.0))
        """
    )


def aggregate_seismic_indicators() -> int:
    """Per-region hazard from the long-run catalogue.

    Energy, not event count, is what matters: a single M7 releases about a
    thousand times the energy of an M5, so counting them equally would rank
    a swarm of small tremors above a genuinely dangerous zone. Magnitude is
    logarithmic, so 10**(1.5*M) recovers a linear energy scale (the standard
    Gutenberg-Richter relation).
    """
    today = datetime.now(timezone.utc).date()
    feats = _fetch(
        date(today.year - HAZARD_YEARS, today.month, today.day),
        today + timedelta(days=1),
        HAZARD_MIN_MAG,
    )
    pts = []
    for f in feats:
        g = (f.get("geometry") or {}).get("coordinates") or []
        m = (f.get("properties") or {}).get("mag")
        if len(g) < 2 or m is None:
            continue
        pts.append((g[0], g[1], float(m)))

    if not pts:
        log.warning("katalog gempa historis kosong; indeks dilewati")
        return 0

    with conn() as c, c.cursor() as cur:
        # Explicit DROP rather than ON COMMIT DROP: the connection comes from
        # a pool, so the table can outlive the run that created it and the
        # next run would silently aggregate the previous run's events.
        cur.execute("DROP TABLE IF EXISTS _q")
        cur.execute("CREATE TEMP TABLE _q (lon float8, lat float8, mag float8)")
        cur.executemany("INSERT INTO _q VALUES (%s,%s,%s)", pts)

        # Most Indonesian quakes are offshore subduction events, so matching
        # only by containment would drop exactly the coastal provinces most
        # at risk. Instead every event joins to any province within ~2°,
        # which the GiST index answers directly — a per-event nearest-
        # neighbour subquery took minutes here, this takes seconds.
        # An event near a coast counts for each nearby province, which is
        # the intent: a shared fault line threatens all of them.
        cur.execute("CREATE INDEX ON _q USING gist (ST_SetSRID(ST_MakePoint(lon, lat), 4326))")
        cur.execute("ANALYZE _q")
        cur.execute("SELECT COUNT(*) FROM _q")
        log.info("agregasi gempa dari %s kejadian", cur.fetchone()["count"])

        # Clear today's rows first: a region that matched under an earlier
        # run's parameters but matches nothing now would otherwise keep its
        # stale value forever, since ON CONFLICT only touches regions the
        # current run still produces.
        cur.execute(
            """
            DELETE FROM indicator
             WHERE period = %(today)s
               AND metric IN ('quake_count_30y', 'quake_max_mag_30y', 'seismic_hazard')
            """,
            {"today": today},
        )
        cur.execute(
            """
            WITH ev AS (
              SELECT r.id AS region_id, q.mag
                FROM _q q
                JOIN region r
                  ON r.level = 'provinsi'
                 AND ST_DWithin(r.geom, ST_SetSRID(ST_MakePoint(q.lon, q.lat), 4326), %(near)s)
            ),
            -- Left join so an aseismic province records a real zero rather
            -- than vanishing: "no M5+ within range in 30 years" is a
            -- finding about Kalimantan, not missing data, and a blank cell
            -- on the map would read as "unknown" instead of "quiet".
            agg AS (
              SELECT r.id AS region_id,
                     COUNT(ev.mag) AS n,
                     MAX(ev.mag) AS max_mag,
                     COALESCE(SUM(POWER(10, 1.5 * ev.mag)), 0) AS energy
                FROM region r
                LEFT JOIN ev ON ev.region_id = r.id
               WHERE r.level = 'provinsi'
               GROUP BY r.id
            )
            INSERT INTO indicator (region_id, metric, period, value, unit,
                                   confidence, is_modelled, source_id)
            SELECT region_id, 'quake_count_30y', %(today)s, n, 'kejadian',
                   5, FALSE, 'usgs_quake'
              FROM agg
            UNION ALL
            -- Only where something was actually recorded: a "strongest
            -- quake" of 0 would be a fabricated reading, unlike a count or
            -- a hazard index, where zero is the true value.
            SELECT region_id, 'quake_max_mag_30y', %(today)s,
                   ROUND(max_mag::numeric, 1), 'magnitudo',
                   5, FALSE, 'usgs_quake'
              FROM agg WHERE max_mag IS NOT NULL
            UNION ALL
            -- Log of summed energy, rescaled against the measured range,
            -- then damped by how often the area is actually struck.
            --
            -- Energy alone is misleading at the low end: Kepulauan Riau
            -- caught a single distant M7.3 in 30 years and scored as high
            -- as Bengkulu, which absorbed 585 events on a live fault. The
            -- damping factor reaches ~1 by about 30 events, so it barely
            -- touches genuinely active provinces and only pulls down those
            -- ranked on one-off shaking.
            SELECT region_id, 'seismic_hazard', %(today)s,
                   ROUND((
                     100 * GREATEST(0, LEAST(1,
                       (LOG(GREATEST(energy, 1)) - %(lo)s) / (%(hi)s - %(lo)s)
                     )) * LEAST(1.0, LN(1 + n) / LN(31))
                   )::numeric, 1),
                   'indeks 0-100',
                   3, TRUE, 'derived_seismic'
              FROM agg
            ON CONFLICT (region_id, metric, period) DO UPDATE
              SET value = EXCLUDED.value, unit = EXCLUDED.unit,
                  confidence = EXCLUDED.confidence,
                  is_modelled = EXCLUDED.is_modelled, source_id = EXCLUDED.source_id
            """,
            {
                "today": today, "near": OFFSHORE_DEG,
                "lo": ENERGY_LOG_MIN, "hi": ENERGY_LOG_MAX,
            },
        )
        n = cur.rowcount

    log.info("indikator gempa: %d baris dari %d kejadian", n, len(pts))
    return n
