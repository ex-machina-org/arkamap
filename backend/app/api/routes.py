"""Public API.

The important idea: nothing here is fire-specific. `/map/{metric}` serves
whatever metrics exist in the database, and `/score` combines them with
weights supplied per request. Adding a theme means ingesting rows, not
editing this file.
"""
import json
import logging
from datetime import datetime, timedelta, timezone

from fastapi import APIRouter, HTTPException, Query

from ..db import query, query_one
from .schemas import (
    ClassificationStats, DisasterCollection, ErrorResponse, EventHistory, HealthReport, HotspotCollection,
    LevelInfo, MapLayer, MetricDef, Notifications, QuakeCollection, RegionRef, RegionSummary,
    MarineForecast, ScoreResponse, SolarForecast, ScoreWeights, SourceInfo, WarningCollection, WindGrid,
)

log = logging.getLogger(__name__)
router = APIRouter()


def _normalise(value: float, lo: float, hi: float, polarity: str) -> float:
    """Map a raw value onto 0-100 where 100 ALWAYS means 'needs attention'.

    For a high_bad metric (hotspots, PM2.5) that is simply the high end.
    For a high_good metric (rainfall, solar potential) the scale is flipped,
    so 100 means "least of the good thing". Mixing the two directions is the
    whole point: one composite score can combine hazards and shortfalls
    without the caller tracking which way each metric runs.
    """
    if hi == lo:
        return 0.0
    t = (value - lo) / (hi - lo)
    t = max(0.0, min(1.0, t))
    if polarity == "high_good":
        t = 1.0 - t
    return round(t * 100, 1)


# Stated on every response that carries a normalised number, so nobody has to
# infer the direction from the values.
SCORE_MEANING = (
    "0-100, arah sudah disamakan: 100 = paling perlu perhatian. "
    "Untuk metrik high_good (mis. potensi PLTS, curah hujan), 100 berarti "
    "paling sedikit — bukan paling banyak."
)


def counted(kind: str) -> str:
    """Which stored rows of an event kind count: for hotspots one satellite and no
    low confidence (ingest/fire.py COUNTED), so one fire is one point; quakes and
    disasters are deduplicated at ingest. A condition on unqualified observation columns."""
    from ..ingest.fire import COUNTED   # late: ingest modules load the HTTP clients
    return COUNTED if kind == "hotspot" else "TRUE"


def in_region(region_id: str | None) -> str:
    """Optional region filter shared by the point queries (params region_id,
    margin). Quakes use a 1° margin (same as the seismic index's OFFSHORE_DEG):
    the megathrust events that threaten a province sit offshore, outside its
    polygon. Built per call, not as "(region IS NULL OR EXISTS ...)": that OR
    kept PostgreSQL off the spatial index, so every hotspot of the period was
    tested against the region one by one (1-2 s per count; it made the
    dashboard take 12-18 s). The region's geometry is read once, as a scalar."""
    if region_id is None:
        return "TRUE"
    return "ST_DWithin((SELECT geom FROM region WHERE id = %(region_id)s), observation.geom, %(margin)s)"


@router.get("/health", response_model=HealthReport)
def health() -> HealthReport:
    try:
        counts = query_one(
            """
            SELECT (SELECT COUNT(*) FROM region)      AS regions,
                   (SELECT COUNT(*) FROM indicator)   AS indicators,
                   (SELECT COUNT(*) FROM observation) AS observations
            """
        )
        srcs = query("SELECT * FROM source ORDER BY aspect, id")
        return HealthReport(
            status="ok",
            database="connected",
            regions=counts["regions"],
            indicators=counts["indicators"],
            observations=counts["observations"],
            sources=[SourceInfo(**s) for s in srcs],
        )
    except Exception as exc:  # noqa: BLE001
        raise HTTPException(503, f"database tidak siap: {exc}") from exc


@router.get("/metrics", response_model=list[MetricDef])
def metrics(aspect: str | None = None) -> list[MetricDef]:
    """Metric catalogue — the frontend builds its layer list from this."""
    sql = "SELECT * FROM metric_def"
    params: tuple = ()
    if aspect:
        sql += " WHERE aspect = %s"
        params = (aspect,)
    sql += " ORDER BY aspect, metric"
    return [MetricDef(**r) for r in query(sql, params)]


@router.get("/sources", response_model=list[SourceInfo])
def sources() -> list[SourceInfo]:
    return [SourceInfo(**r) for r in query("SELECT * FROM source ORDER BY aspect, id")]


@router.get("/levels", response_model=list[LevelInfo])
def levels() -> list[dict]:
    """Which administrative levels have data, and how many regions each has."""
    return query(
        """
        SELECT level,
               COUNT(*) AS regions,
               COUNT(*) FILTER (WHERE population IS NOT NULL) AS with_population
        FROM region GROUP BY level ORDER BY level DESC
        """
    )


@router.get("/map/{metric}", response_model=MapLayer, responses={404: {"model": ErrorResponse}})
def map_layer(
    metric: str,
    simplify: float = Query(0.01, ge=0.0, le=0.5),
    level: str = Query("provinsi", pattern="^(provinsi|kabkota)$"),
) -> dict:
    """Any metric as a GeoJSON FeatureCollection, ready to drop on a map.

    `simplify` trades polygon fidelity for payload size; province outlines
    stay recognisable down to about 0.02 degrees.
    """
    mdef = query_one("SELECT * FROM metric_def WHERE metric = %s", (metric,))
    if not mdef:
        raise HTTPException(404, f"metrik '{metric}' tidak dikenal")

    rows = query(
        """
        SELECT r.id, r.name, r.population, r.area_km2, r.parent_id,
               i.value, i.period, i.confidence, i.is_modelled, i.source_id,
               ST_AsGeoJSON(ST_SimplifyPreserveTopology(r.geom, %s)) AS gj
        FROM region r
        LEFT JOIN indicator_latest i
               ON i.region_id = r.id AND i.metric = %s
        WHERE r.level = %s
        ORDER BY r.name
        """,
        (simplify, metric, level),
    )

    features = []
    for r in rows:
        if r["gj"] is None:
            continue
        value = r["value"]
        props = {
            "region_id": r["id"],
            "name": r["name"],
            "parent_id": r["parent_id"],
            "population": r["population"],
            "area_km2": round(r["area_km2"], 1) if r["area_km2"] else None,
            "value": value,
            "unit": mdef["unit"],
            "period": r["period"].isoformat() if r["period"] else None,
            "confidence": r["confidence"],
            "is_modelled": r["is_modelled"],
            "source_id": r["source_id"],
            "normalised": (
                _normalise(value, mdef["scale_min"], mdef["scale_max"], mdef["polarity"])
                if value is not None else None
            ),
        }
        features.append({
            "type": "Feature",
            "id": r["id"],
            "properties": props,
            "geometry": json.loads(r["gj"]),
        })

    return {
        "type": "FeatureCollection",
        "metric": {
            "metric": mdef["metric"], "label": mdef["label"], "unit": mdef["unit"],
            "aspect": mdef["aspect"], "description": mdef["description"],
            "polarity": mdef["polarity"],
            "scale_min": mdef["scale_min"], "scale_max": mdef["scale_max"],
            "normalised_meaning": SCORE_MEANING,
        },
        "features": features,
    }


@router.get("/regions", response_model=list[RegionRef])
def regions(
    q: str | None = Query(None, min_length=2, description="cari nama, tanpa peka huruf besar"),
    level: str | None = Query(None, pattern="^(provinsi|kabkota)$"),
    parent_id: str | None = Query(None, description="kabupaten/kota dalam satu provinsi"),
    limit: int = Query(50, ge=1, le=600),
) -> list[dict]:
    """Region list / search for pickers and autocomplete. Exact name first,
    then provinces, then alphabetical."""
    return query(
        """
        SELECT id, name, level, parent_id, population FROM region
        WHERE (%(q)s::text IS NULL OR name ILIKE '%%' || %(q)s || '%%')
          AND (%(level)s::text IS NULL OR level = %(level)s)
          AND (%(parent)s::text IS NULL OR parent_id = %(parent)s)
        ORDER BY (lower(name) = lower(coalesce(%(q)s, ''))) DESC, (level = 'provinsi') DESC, name
        LIMIT %(limit)s
        """,
        {"q": q, "level": level, "parent": parent_id, "limit": limit},
    )


@router.get("/regions/{region_id}", response_model=RegionSummary, responses={404: {"model": ErrorResponse}})
def region_detail(region_id: str) -> RegionSummary:
    """Everything known about one region, across all three aspects."""
    reg = query_one(
        "SELECT id, name, level, population, area_km2 FROM region WHERE id = %s",
        (region_id,),
    )
    if not reg:
        raise HTTPException(404, "wilayah tidak ditemukan")

    rows = query(
        """
        SELECT i.metric, i.value, i.period, i.confidence, i.is_modelled, i.source_id,
               m.label, m.unit, m.scale_min, m.scale_max, m.polarity
        FROM indicator_latest i
        JOIN metric_def m ON m.metric = i.metric
        WHERE i.region_id = %s
        ORDER BY m.aspect, i.metric
        """,
        (region_id,),
    )
    inds = [{
        "metric": r["metric"], "label": r["label"], "unit": r["unit"],
        "value": r["value"], "period": r["period"], "confidence": r["confidence"],
        "is_modelled": r["is_modelled"], "source_id": r["source_id"],
        "normalised": _normalise(r["value"], r["scale_min"], r["scale_max"], r["polarity"]),
    } for r in rows]

    return RegionSummary(**reg, indicators=inds)


@router.get("/hotspots", response_model=HotspotCollection)
def hotspots(
    days: int = Query(7, ge=1, le=30),
    limit: int = Query(4000, ge=1, le=20000),
    min_frp: float = Query(0.0, ge=0.0),
    region_id: str | None = None,
) -> dict:
    """Raw fire detections as points — the observation layer behind the index."""
    since = datetime.now(timezone.utc) - timedelta(days=days)
    rows = query(
        """
        SELECT ST_X(geom) AS lon, ST_Y(geom) AS lat, value AS frp,
               observed_at, attrs
        FROM observation
        WHERE metric = 'hotspot' AND """ + counted("hotspot") + """ AND observed_at >= %(since)s AND value >= %(min)s
          AND """ + in_region(region_id) + """
        ORDER BY value DESC
        LIMIT %(limit)s
        """,
        {"since": since, "min": min_frp, "limit": limit, "region_id": region_id, "margin": 0.0},
    )
    return {
        "type": "FeatureCollection",
        "count": len(rows),
        "features": [{
            "type": "Feature",
            "properties": {
                "frp": r["frp"],
                "observed_at": r["observed_at"].isoformat(),
                "confidence": (r["attrs"] or {}).get("confidence"),
                "daynight": (r["attrs"] or {}).get("daynight"),
            },
            "geometry": {"type": "Point", "coordinates": [r["lon"], r["lat"]]},
        } for r in rows],
    }


@router.get("/quakes", response_model=QuakeCollection)
def quakes(
    days: int = Query(30, ge=1, le=365),
    limit: int = Query(1000, ge=1, le=5000),
    min_mag: float = Query(3.5, ge=0.0, le=10.0),
    region_id: str | None = None,
) -> dict:
    """Recent earthquakes as points.

    These are recorded events, never a forecast — see the `usgs_quake`
    source note.
    """
    since = datetime.now(timezone.utc) - timedelta(days=days)
    rows = query(
        """
        SELECT ST_X(geom) AS lon, ST_Y(geom) AS lat, value AS mag,
               observed_at, attrs, source_id
        FROM observation
        WHERE metric = 'quake' AND observed_at >= %(since)s AND value >= %(min)s
          AND """ + in_region(region_id) + """
        ORDER BY observed_at DESC
        LIMIT %(limit)s
        """,
        {"since": since, "min": min_mag, "limit": limit, "region_id": region_id, "margin": 1.0},
    )
    return {
        "type": "FeatureCollection",
        "count": len(rows),
        "features": [{
            "type": "Feature",
            "properties": {
                "mag": r["mag"],
                "observed_at": r["observed_at"].isoformat(),
                "depth_km": (r["attrs"] or {}).get("depth_km"),
                "place": (r["attrs"] or {}).get("place"),
                "tsunami": bool((r["attrs"] or {}).get("tsunami")),
                "urgency": (r["attrs"] or {}).get("urgency"),
                "urgency_confidence": (r["attrs"] or {}).get("urgency_confidence"),
                "felt": (r["attrs"] or {}).get("felt"),
                "potensi": (r["attrs"] or {}).get("potensi"),
                "source_id": r["source_id"],
            },
            "geometry": {"type": "Point", "coordinates": [r["lon"], r["lat"]]},
        } for r in rows],
    }


def _active_warnings(region_id: str | None = None) -> list[dict]:
    return query(
        """
        SELECT w.id, w.event, w.headline, w.description, w.area, w.severity, w.urgency,
               w.certainty, w.effective, w.expires, w.url, ST_AsGeoJSON(w.geom, 4) AS gj
        FROM weather_warning w
        WHERE w.expires > now()
          AND (%(r)s::text IS NULL OR EXISTS (SELECT 1 FROM region rg
               WHERE rg.id = %(r)s AND ST_Intersects(rg.geom, w.geom)))
        ORDER BY w.effective DESC
        """, {"r": region_id})


@router.get("/warnings", response_model=WarningCollection)
def warnings(region_id: str | None = None) -> dict:
    """Active BMKG severe-weather warnings (heavy rain, lightning, strong
    wind...) as polygons; optionally only those touching a region.
    Source: BMKG, which must be credited."""
    rows = _active_warnings(region_id)
    return {"type": "FeatureCollection", "count": len(rows), "features": [{
        "type": "Feature",
        "properties": {k: v for k, v in r.items() if k != "gj"},
        "geometry": json.loads(r["gj"]),
    } for r in rows]}


@router.get("/marine", response_model=MarineForecast,
            responses={404: {"model": ErrorResponse}, 502: {"model": ErrorResponse}})
def marine_forecast(lat: float = Query(..., ge=-12, le=7), lon: float = Query(..., ge=94, le=142)) -> dict:
    """Sea conditions for the next 3 days at a point (a fisher's position, a
    boat sensor). Coastal points snap to the nearest sea cell; inland points
    have no sea data (404). Cached for an hour per ~1 km."""
    from ..ingest.marine import point_forecast
    try:
        out = point_forecast(lat, lon)
    except Exception as exc:  # noqa: BLE001
        log.warning("prakiraan laut gagal: %s", exc)
        raise HTTPException(502, "layanan prakiraan laut tidak merespons; coba lagi nanti") from None
    if out is None:
        raise HTTPException(404, "tidak ada data laut di titik ini (terlalu jauh ke darat)")
    return out


@router.get("/solar-forecast", response_model=SolarForecast, responses={502: {"model": ErrorResponse}})
def solar_forecast(
    lat: float = Query(..., ge=-12, le=7), lon: float = Query(..., ge=94, le=142),
    kwp: float = Query(1.0, gt=0, le=10000, description="kapasitas panel, kWp"),
    tilt: float = Query(15, ge=0, le=90, description="kemiringan panel, derajat"),
    azimuth: float = Query(0, ge=-180, le=180,
                           description="arah hadap: 0 = selatan, -90 = timur, 90 = barat (konvensi Open-Meteo)"),
) -> dict:
    """Estimated rooftop-PV output for the next 2 days at a site: compare with
    a PV owner's own inverter/sensor data. Cached for an hour."""
    from ..ingest.outlook import solar_forecast as forecast
    try:
        return forecast(lat, lon, kwp, tilt, azimuth)
    except Exception as exc:  # noqa: BLE001
        log.warning("prakiraan PLTS gagal: %s", exc)
        raise HTTPException(502, "layanan prakiraan surya tidak merespons; coba lagi nanti") from None


@router.get("/disasters", response_model=DisasterCollection)
def disasters(
    days: int = Query(90, ge=1, le=3650),
    limit: int = Query(500, ge=1, le=5000),
    type: str | None = Query(None, pattern="^(volcano|earthquake|flood|wildfire|cyclone|drought|landslide|other)$"),
    min_alert: int = Query(0, ge=0, le=3, description="GDACS saja: 1 Green, 2 Orange, 3 Red"),
    region_id: str | None = None,
) -> dict:
    """Disaster events from GDACS and NASA EONET as points."""
    since = datetime.now(timezone.utc) - timedelta(days=days)
    rows = query(
        """
        SELECT ST_X(geom) AS lon, ST_Y(geom) AS lat, value, observed_at, source_id, attrs
        FROM observation
        WHERE metric = 'disaster' AND observed_at >= %(since)s
          AND (%(type)s::text IS NULL OR attrs->>'type' = %(type)s)
          AND (%(alert)s = 0 OR (source_id = 'gdacs' AND value >= %(alert)s))
          AND """ + in_region(region_id) + """
        ORDER BY observed_at DESC
        LIMIT %(limit)s
        """,
        {"since": since, "type": type, "alert": min_alert, "limit": limit,
         "region_id": region_id, "margin": 0.5},
    )
    return {
        "type": "FeatureCollection",
        "count": len(rows),
        "features": [{
            "type": "Feature",
            "properties": {**(r["attrs"] or {}), "value": r["value"], "source_id": r["source_id"],
                           "observed_at": r["observed_at"].isoformat()},
            "geometry": {"type": "Point", "coordinates": [r["lon"], r["lat"]]},
        } for r in rows],
    }


@router.get("/windgrid", response_model=WindGrid, responses={503: {"model": ErrorResponse}})
def wind_grid() -> dict:
    """Wind on a regular lattice, for the animated particle layer.

    Returned as flat arrays rather than GeoJSON: the client indexes into
    them by grid position to interpolate, and a feature per point would be
    an order of magnitude more bytes for data with no geometry to speak of.
    """
    rows = query(
        "SELECT lon, lat, direction, speed, temperature, surface, observed_at"
        " FROM wind_grid"
        " ORDER BY lat, lon"
    )
    if not rows:
        raise HTTPException(503, "grid angin belum tersedia; jalankan ingest")

    lons = sorted({r["lon"] for r in rows})
    lats = sorted({r["lat"] for r in rows})

    # A partial grid (an ingest that died part-way) still has a full set of
    # longitudes but only some latitudes, so nx*ny no longer matches the
    # row count. Serving it anyway would place every value at the wrong
    # coordinate and paint a plausible-looking but wrong heat surface.
    if len(rows) != len(lons) * len(lats):
        raise HTTPException(
            503,
            f"grid tidak lengkap ({len(rows)} titik untuk kisi "
            f"{len(lons)}x{len(lats)}); jalankan ulang ingest",
        )
    return {
        "nx": len(lons), "ny": len(lats),
        "west": lons[0], "east": lons[-1],
        "south": lats[0], "north": lats[-1],
        "observed_at": rows[0]["observed_at"].isoformat(),
        # Row-major from the south-west corner, matching the ORDER BY.
        "direction": [r["direction"] for r in rows],
        "speed": [r["speed"] for r in rows],
        "temperature": [r["temperature"] for r in rows],
        "surface": [r["surface"] for r in rows],
    }


@router.post("/score", response_model=ScoreResponse, responses={400: {"model": ErrorResponse}})
def composite_score(body: ScoreWeights) -> dict:
    """Rank regions by a user-defined combination of any metrics.

    This is the adaptive part: a fire officer, a utility planner and a water
    agency send different weights and get different maps from one dataset.
    """
    if not body.weights:
        raise HTTPException(400, "beri minimal satu metrik dan bobotnya")

    defs = {r["metric"]: r for r in query(
        "SELECT * FROM metric_def WHERE metric = ANY(%s)",
        (list(body.weights.keys()),),
    )}
    unknown = set(body.weights) - set(defs)
    if unknown:
        raise HTTPException(400, f"metrik tidak dikenal: {sorted(unknown)}")

    total_w = sum(abs(w) for w in body.weights.values())
    if total_w == 0:
        raise HTTPException(400, "total bobot tidak boleh nol")

    rows = query(
        """
        SELECT i.region_id, r.name, i.metric, i.value, i.is_modelled, i.confidence
        FROM indicator_latest i
        JOIN region r ON r.id = i.region_id
        WHERE i.metric = ANY(%s)
        """,
        (list(body.weights.keys()),),
    )

    acc: dict[str, dict] = {}
    for r in rows:
        d = defs[r["metric"]]
        n = _normalise(r["value"], d["scale_min"], d["scale_max"], d["polarity"])
        e = acc.setdefault(r["region_id"], {
            "region_id": r["region_id"], "name": r["name"],
            "parts": {}, "weighted": 0.0, "used_w": 0.0,
            "modelled_share": 0.0, "min_confidence": 5,
        })
        w = body.weights[r["metric"]]
        e["parts"][r["metric"]] = {"value": r["value"], "normalised": n, "weight": w}
        e["weighted"] += n * w
        e["used_w"] += abs(w)
        if r["is_modelled"]:
            e["modelled_share"] += abs(w)
        e["min_confidence"] = min(e["min_confidence"], r["confidence"])

    out = []
    for e in acc.values():
        if e["used_w"] == 0:
            continue
        out.append({
            "region_id": e["region_id"],
            "name": e["name"],
            "score": round(e["weighted"] / e["used_w"], 1),
            "coverage": round(e["used_w"] / total_w, 2),
            "modelled_share": round(e["modelled_share"] / e["used_w"], 2),
            "min_confidence": e["min_confidence"],
            "parts": e["parts"],
        })
    out.sort(key=lambda x: x["score"], reverse=True)
    return {
        "weights": body.weights,
        "polarity": {m: defs[m]["polarity"] for m in body.weights},
        "score_meaning": SCORE_MEANING,
        "count": len(out),
        "results": out,
    }


@router.get("/stats/classification", response_model=ClassificationStats)
def classification_stats() -> dict:
    """Building classes (from OSM tags) and quake urgency (rules in
    ingest/seismic.urgency), counted from what ingest already stored."""
    building = {
        r["kind"]: r["n"]
        for r in query("SELECT kind, COUNT(*) AS n FROM building GROUP BY kind")
    }
    quake_urgency = {
        r["urgency"]: r["n"]
        for r in query(
            """
            SELECT attrs->>'urgency' AS urgency, COUNT(*) AS n
            FROM observation
            WHERE metric = 'quake' AND attrs ? 'urgency'
            GROUP BY 1
            """
        )
    }
    return {
        "building": building,
        "quake_urgency": quake_urgency,
        "total_buildings": sum(building.values()),
        "total_quakes_classified": sum(quake_urgency.values()),
    }


@router.get("/history/events", response_model=EventHistory)
def event_history(
    metric: str = Query(..., pattern="^(quake|hotspot|disaster)$"),
    days: int = Query(90, ge=1, le=3650),
    bucket: str = Query("day", pattern="^(day|week)$"),
) -> dict:
    """Event counts over time, split by urgency where it applies.

    Only quakes carry an urgency; hotspot and disaster rows come back with
    a null urgency key, so the frontend renders a single bar per bucket.
    """
    since = datetime.now(timezone.utc) - timedelta(days=days)
    rows = query(
        """
        SELECT date_trunc(%s, observed_at) AS bucket,
               attrs->>'urgency' AS urgency,
               COUNT(*) AS n
        FROM observation
        WHERE metric = %s AND observed_at >= %s AND """ + counted(metric) + """
        GROUP BY 1, 2
        ORDER BY 1
        """,
        (bucket, metric, since),
    )
    return {
        "metric": metric,
        "bucket": bucket,
        "buckets": [
            {"bucket": r["bucket"].isoformat(), "urgency": r["urgency"], "count": r["n"]}
            for r in rows
        ],
    }


# Region alert threshold on the same 0-100 "needs attention" scale _normalise
# produces — see SCORE_MEANING. Arbitrary but consistent with /score's own
# framing: 80 is deliberately high, so this flags only the regions genuinely
# near the top of a metric, not everything above the midpoint.
ALERT_THRESHOLD = 80


@router.get("/notifications", response_model=Notifications)
def notifications(region_id: str | None = None) -> dict:
    """What needs attention right now, computed from data already stored —
    not a persisted notification log. There is no read/unread state here on
    purpose: nothing asked for one, and a snapshot answers "what's urgent
    today" without a table that has to be kept in sync.

    region_id narrows everything but source health to that region: points
    within it (quakes with in_region's 1° offshore margin, disasters 0.5°),
    indicators of it and its child regions, warnings touching it, possible
    fires detected inside it (ingest/fire.py possible_fires).
    """
    since = datetime.now(timezone.utc) - timedelta(days=7)
    quake_alerts = query(
        """
        SELECT ST_X(geom) AS lon, ST_Y(geom) AS lat, value AS mag, observed_at,
               attrs->>'place' AS place, attrs->>'urgency' AS urgency,
               (attrs->>'urgency_confidence')::float AS urgency_confidence
        FROM observation
        WHERE metric = 'quake' AND observed_at >= %(since)s
          AND attrs->>'urgency' IN ('darurat', 'siaga_tsunami')
          AND """ + in_region(region_id) + """
        ORDER BY observed_at DESC
        """,
        {"since": since, "region_id": region_id, "margin": 1.0},
    )

    # high_bad only: for a high_good metric (power capacity, rainfall) a raw
    # value of 0 normalises to 100 ("most needs attention"), but 0 rooftop
    # solar potential in a district that simply has none isn't a hazard —
    # it would flood this list with the wrong kind of region.
    defs = {
        r["metric"]: r for r in query("SELECT * FROM metric_def WHERE polarity = 'high_bad'")
    }
    region_alerts = []
    for r in query(
        """
        SELECT i.region_id, rg.name, i.metric, i.value
        FROM indicator_latest i
        JOIN region rg ON rg.id = i.region_id
        WHERE i.metric = ANY(%(metrics)s)
          AND (%(region_id)s::text IS NULL OR rg.id = %(region_id)s OR rg.parent_id = %(region_id)s)
        """,
        {"metrics": list(defs.keys()), "region_id": region_id},
    ):
        d = defs[r["metric"]]
        n = _normalise(r["value"], d["scale_min"], d["scale_max"], d["polarity"])
        if n > ALERT_THRESHOLD:
            region_alerts.append({
                "region_id": r["region_id"], "name": r["name"],
                "metric": r["metric"], "label": d["label"],
                "value": r["value"], "normalised": n,
            })
    region_alerts.sort(key=lambda x: x["normalised"], reverse=True)

    disaster_alerts = query(
        """
        SELECT ST_X(geom) AS lon, ST_Y(geom) AS lat, observed_at,
               attrs->>'type' AS type, attrs->>'name' AS name,
               attrs->>'alertlevel' AS alertlevel, attrs->>'url' AS url
        FROM observation
        WHERE metric = 'disaster' AND source_id = 'gdacs' AND value >= 2
          AND (attrs->>'current' = 'true' OR observed_at >= %(since)s)
          AND """ + in_region(region_id) + """
        ORDER BY value DESC, observed_at DESC
        """,
        {"since": datetime.now(timezone.utc) - timedelta(days=30), "region_id": region_id, "margin": 0.5},
    )

    from ..ingest.fire import possible_fires   # late: ingest modules load the HTTP clients
    fire_alerts = possible_fires(region_id)

    source_alerts = query(
        "SELECT id, title, last_error, last_ok_at FROM source WHERE last_error IS NOT NULL"
    )
    weather = [{k: v for k, v in w.items() if k not in ("gj", "description")}
               for w in _active_warnings(region_id)]

    return {
        "weather_warnings": weather,
        "quake_alerts": [{
            "lon": r["lon"], "lat": r["lat"], "mag": r["mag"],
            "observed_at": r["observed_at"].isoformat(),
            "place": r["place"], "urgency": r["urgency"],
            "urgency_confidence": r["urgency_confidence"],
        } for r in quake_alerts],
        "region_alerts": region_alerts,
        "disaster_alerts": [{
            "lon": r["lon"], "lat": r["lat"], "observed_at": r["observed_at"].isoformat(),
            "type": r["type"], "name": r["name"], "alertlevel": r["alertlevel"], "url": r["url"],
        } for r in disaster_alerts],
        "fire_alerts": fire_alerts,
        "source_alerts": [{
            "id": r["id"], "title": r["title"], "last_error": r["last_error"],
            "last_ok_at": r["last_ok_at"].isoformat() if r["last_ok_at"] else None,
        } for r in source_alerts],
        "count": (len(quake_alerts) + len(region_alerts) + len(disaster_alerts) + len(source_alerts)
                  + len(weather) + len(fire_alerts)),
    }
