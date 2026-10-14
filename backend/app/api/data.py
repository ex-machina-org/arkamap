"""Every dataset in the database, in the shapes a table, a dashboard or the Agent need.

  /catalog               what exists: every indicator with its coverage and periods,
                         every observation layer, and the endpoint that serves each dataset
  /observations          any observation layer (power plants, transit stops, quakes, ...) as GeoJSON

Indicators without a metric_def row (humidity_mean, wind_max, wind_direction)
are included and flagged `internal`: they are stored data, only not map layers
(see ingest/runner.py).
"""
from datetime import datetime

from fastapi import APIRouter, HTTPException, Query

from ..db import query
from . import routes
from .schemas import Catalog, ErrorResponse, ObservationCollection

router = APIRouter()
# An explicit description: FastAPI otherwise uses Python's phrase for 422, which
# changed in 3.13 ("Unprocessable Entity" -> "Content") and breaks the contract check.
_INVALID = {"model": ErrorResponse, "description": "Parameter tidak valid"}

# The other datasets, each already served by its own endpoint; listed here so a
# frontend finds every dataset from /catalog alone.
_DATASETS = [
    {"id": "regions", "label": "Wilayah (provinsi, kab/kota)", "endpoint": "/api/regions"},
    {"id": "region_detail", "label": "Semua indikator terbaru satu wilayah", "endpoint": "/api/regions/{region_id}"},
    {"id": "map", "label": "Satu indikator untuk semua wilayah (GeoJSON)", "endpoint": "/api/map/{metric}"},
    {"id": "score", "label": "Skor gabungan beberapa indikator", "endpoint": "/api/score"},
    {"id": "hotspots", "label": "Titik panas", "endpoint": "/api/hotspots"},
    {"id": "quakes", "label": "Gempa", "endpoint": "/api/quakes"},
    {"id": "disasters", "label": "Bencana (GDACS, EONET)", "endpoint": "/api/disasters"},
    {"id": "event_history", "label": "Riwayat kejadian per hari", "endpoint": "/api/history/events"},
    {"id": "warnings", "label": "Peringatan cuaca BMKG", "endpoint": "/api/warnings"},
    {"id": "notifications", "label": "Peringatan yang perlu perhatian", "endpoint": "/api/notifications"},
    {"id": "windgrid", "label": "Grid angin", "endpoint": "/api/windgrid"},
    {"id": "marine", "label": "Prakiraan laut satu titik", "endpoint": "/api/marine"},
    {"id": "solar_forecast", "label": "Prakiraan surya satu titik", "endpoint": "/api/solar-forecast"},
    {"id": "buildings", "label": "Bangunan", "endpoint": "/api/buildings"},
    {"id": "building_stats", "label": "Statistik klasifikasi bangunan", "endpoint": "/api/stats/classification"},
    {"id": "isochrone", "label": "Jangkauan waktu tempuh", "endpoint": "/api/isochrone"},
    {"id": "report", "label": "Laporan satu wilayah", "endpoint": "/api/reports/{region_id}"},
    {"id": "sources", "label": "Sumber data dan kesegarannya", "endpoint": "/api/sources"},
    {"id": "community_devices", "label": "Alat IoT komunitas yang publik", "endpoint": "/api/community/devices"},
    {"id": "my_devices", "label": "Alat IoT milik pengguna (perlu login)", "endpoint": "/api/me/devices"},
]


def _indicators() -> list[dict]:
    """Every indicator, defined or only stored, with its coverage per level and its periods."""
    return query("""
        WITH k AS (SELECT metric FROM metric_def UNION SELECT DISTINCT metric FROM indicator_latest),
        latest AS (
            SELECT l.metric, count(*) FILTER (WHERE r.level = 'provinsi') AS provinsi,
                   count(*) FILTER (WHERE r.level = 'kabkota') AS kabkota,
                   bool_or(l.is_modelled) AS modelled, max(l.unit) AS unit
            FROM indicator_latest l JOIN region r ON r.id = l.region_id GROUP BY l.metric),
        periods AS (
            -- ponytail: scans the whole history; keep a per-metric summary table if it grows large
            SELECT metric, count(DISTINCT period) AS periods, min(period) AS first_period,
                   max(period) AS last_period
            FROM indicator GROUP BY metric)
        SELECT k.metric, coalesce(m.label, k.metric) AS label, coalesce(m.unit, latest.unit, '') AS unit,
               m.aspect, m.polarity, m.description, m.source_id, m.metric IS NULL AS internal,
               coalesce(latest.provinsi, 0) AS provinsi, coalesce(latest.kabkota, 0) AS kabkota,
               coalesce(latest.modelled, false) AS modelled,
               coalesce(periods.periods, 0) AS periods, periods.first_period, periods.last_period
        FROM k LEFT JOIN metric_def m USING (metric) LEFT JOIN latest USING (metric)
        LEFT JOIN periods USING (metric)
        ORDER BY internal, m.aspect NULLS LAST, k.metric""")


@router.get("/catalog", response_model=Catalog)
def catalog() -> dict:
    """What data exists: each indicator (coverage per region level, periods,
    `internal` when it is not a map layer), each observation layer, and the
    endpoint serving every dataset. Build table and dashboard pickers from this."""
    layers = query("""
        SELECT metric, array_agg(DISTINCT source_id ORDER BY source_id) AS sources, count(*) AS count,
               min(observed_at) AS first, max(observed_at) AS last
        FROM observation GROUP BY metric ORDER BY metric""")
    return {"indicators": _indicators(),
            "observations": [{**layer, "endpoint": f"/api/observations?metric={layer['metric']}"}
                             for layer in layers],
            "datasets": _DATASETS}


@router.get("/observations", response_model=ObservationCollection,
            responses={404: {"model": ErrorResponse}, 422: _INVALID})
def observations(
    metric: str = Query(..., description="jenis observasi, mis. power_plant, transit_stop, hotspot; lihat /api/catalog"),
    source_id: str | None = None,
    since: datetime | None = None,
    until: datetime | None = None,
    region_id: str | None = Query(None, description="hanya titik di dalam wilayah ini"),
    bbox: str | None = Query(None, description="minlon,minlat,maxlon,maxlat"),
    min_value: float | None = None,
    limit: int = Query(1000, ge=1, le=5000),
) -> dict:
    """Any observation layer as a GeoJSON FeatureCollection, newest first. Each
    feature carries the source, time, value and the source's own attributes."""
    if not query("SELECT 1 FROM observation WHERE metric = %s LIMIT 1", (metric,)):
        raise HTTPException(404, f"tidak ada observasi '{metric}'; lihat /api/catalog")
    box = None
    if bbox:
        try:
            box = [float(x) for x in bbox.split(",")]
        except ValueError:
            box = []
        if len(box) != 4:
            raise HTTPException(422, "bbox: minlon,minlat,maxlon,maxlat")
    # only the filters given: "(%s IS NULL OR ...)" would keep the planner off the spatial index
    # (a region filter took 2.4 s that way, 0.1 s like this)
    # hotspots: one point per fire (routes.counted) unless a satellite source is asked for by name
    where = ["o.metric = %(metric)s"] + ([routes.counted(metric)] if not source_id else [])
    for value, cond in ((source_id, "o.source_id = %(src)s"), (since, "o.observed_at >= %(since)s"),
                        (until, "o.observed_at <= %(until)s"), (min_value, "o.value >= %(min)s"),
                        (box, "o.geom && ST_MakeEnvelope(%(b0)s, %(b1)s, %(b2)s, %(b3)s, 4326)"),
                        (region_id, "ST_Intersects(rg.geom, o.geom)")):
        if value is not None:
            where.append(cond)
    rows = query(f"""
        SELECT o.id, o.source_id, o.observed_at, o.value, o.attrs, ST_X(o.geom) AS lon, ST_Y(o.geom) AS lat
        FROM observation o {", region rg" if region_id else ""}
        WHERE {" AND ".join(where)} {"AND rg.id = %(region)s" if region_id else ""}
        ORDER BY o.observed_at DESC LIMIT %(limit)s""",
        {"metric": metric, "src": source_id, "since": since, "until": until, "min": min_value,
         "region": region_id, "limit": limit, **{f"b{i}": box[i] if box else None for i in range(4)}})
    return {"type": "FeatureCollection", "metric": metric, "count": len(rows), "limit": limit,
            "features": [{"type": "Feature",
                          "properties": {"id": r["id"], "source_id": r["source_id"], "observed_at": r["observed_at"],
                                         "value": r["value"], "attrs": r["attrs"] or {}},
                          "geometry": {"type": "Point", "coordinates": [r["lon"], r["lat"]]}} for r in rows]}
