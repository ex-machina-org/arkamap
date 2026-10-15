"""Every dataset in the database, in the shapes a table, a dashboard or the Agent need.

  /catalog               what exists: every indicator with its coverage and periods,
                         every observation layer, and the endpoint that serves each dataset
  /indicators            indicators as a region x metric table (JSON or CSV)
  /indicators/history    one or more regions' values per period
  /observations          any observation layer (power plants, transit stops, quakes, ...) as GeoJSON

Indicators without a metric_def row (humidity_mean, wind_max, wind_direction)
are included and flagged `internal`: they are stored data, only not map layers
(see ingest/runner.py).
"""
import csv
import io
from datetime import date, datetime
from typing import Literal

from fastapi import APIRouter, HTTPException, Query
from fastapi.responses import Response

from .. import panels
from ..agent import standards
from ..db import query
from . import routes
from .schemas import AirStandards, Catalog, PanelCatalog, ErrorResponse, IndicatorHistory, IndicatorTable, ObservationCollection

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
            -- Limit: scans the whole history; keep a per-metric summary table if it grows large
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


def _metrics(requested: str | None, level: str) -> list[dict]:
    """The table's columns: the requested metrics in that order, else every metric with data at this level."""
    known = {m["metric"]: m for m in _indicators()}
    if requested:
        names = [m.strip() for m in requested.split(",") if m.strip()]
        if unknown := [m for m in names if m not in known]:
            raise HTTPException(422, f"metrik tidak dikenal: {', '.join(unknown)}; lihat /api/catalog")
        return [known[m] for m in names]
    return [m for m in known.values() if m[level]]


@router.get("/indicators", response_model=IndicatorTable,
            responses={200: {"content": {"text/csv": {}}}, 422: _INVALID})
def indicator_table(
    level: Literal["provinsi", "kabkota"] = "provinsi",
    parent: str | None = Query(None, description="hanya kab/kota di provinsi ini (id provinsi)"),
    metrics: str | None = Query(None, description="daftar metrik dipisah koma; kosong = semua yang ada datanya"),
    q: str | None = Query(None, max_length=100, description="cari nama wilayah"),
    sort: str = Query("name", description="'name' atau nama metrik"),
    order: Literal["asc", "desc"] = "asc",
    limit: int = Query(100, ge=1, le=1000),
    offset: int = Query(0, ge=0),
    format: Literal["json", "csv"] = "json",
) -> dict | Response:
    """Latest value of each metric per region, one row per region: for tables,
    dashboards and CSV export. Values are flat in each row, keyed by metric;
    `columns` gives each metric's label and unit. Older periods: /indicators/history."""
    cols = _metrics(metrics, level)
    names = [c["metric"] for c in cols]
    if sort != "name" and sort not in names:
        raise HTTPException(422, f"sort harus 'name' atau salah satu metrik tabel: {', '.join(names)}")
    direction = "DESC" if order == "desc" else "ASC"   # from a Literal: safe to format into the SQL
    rows = query(f"""
        WITH r AS (
            SELECT id, name, level, parent_id, population FROM region
            WHERE level = %(level)s AND (%(parent)s::text IS NULL OR parent_id = %(parent)s)
              AND (%(q)s::text IS NULL OR name ILIKE %(q)s)),
        v AS (
            SELECT region_id, jsonb_object_agg(metric, value) AS vals FROM indicator_latest
            WHERE metric = ANY(%(names)s) AND region_id IN (SELECT id FROM r) GROUP BY region_id)
        SELECT r.*, coalesce(v.vals, '{{}}'::jsonb) AS vals, count(*) OVER () AS total
        FROM r LEFT JOIN v ON v.region_id = r.id
        ORDER BY CASE WHEN %(sort)s = 'name' THEN NULL ELSE (v.vals ->> %(sort)s)::float END {direction} NULLS LAST,
                 r.name {direction}
        LIMIT %(limit)s OFFSET %(offset)s""",
        {"level": level, "parent": parent, "q": f"%{q}%" if q else None, "names": names, "sort": sort,
         "limit": limit, "offset": offset})
    flat = [{"region_id": r["id"], "name": r["name"], "level": r["level"], "parent_id": r["parent_id"],
             "population": r["population"], **{m: r["vals"].get(m) for m in names}} for r in rows]
    if format == "csv":
        buf = io.StringIO()
        w = csv.DictWriter(buf, fieldnames=["region_id", "name", "level", "parent_id", "population", *names])
        w.writeheader()
        w.writerows(flat)
        return Response(buf.getvalue(), media_type="text/csv; charset=utf-8",
                        headers={"Content-Disposition": f'attachment; filename="indikator-{level}.csv"'})
    return {"level": level, "parent": parent, "columns": cols, "rows": flat,
            "total": rows[0]["total"] if rows else 0, "limit": limit, "offset": offset}


@router.get("/standards", response_model=AirStandards)
def air_standards() -> dict:
    """Official limits per metric (PP 22/2021, WHO 2021, ISPU, US AQI): what "normal" is for
    a value, so a card can say where today sits. Metrics without a limit are absent."""
    return {"metrics": {m: standards.standard(m) for m in standards.STANDARDS}}


@router.get("/panels", response_model=PanelCatalog)
def panel_catalog() -> dict:
    """Every dashboard panel (card or chart) region data can fill; the AI picks from these."""
    return {"panels": panels.catalogue()}


@router.get("/indicators/history", response_model=IndicatorHistory, responses={422: _INVALID})
def indicator_history(
    region_id: str = Query(..., description="id wilayah, atau beberapa dipisah koma (maks. 20)"),
    metrics: str | None = Query(None, description="daftar metrik dipisah koma; kosong = semua"),
    since: date | None = None,
    until: date | None = None,
) -> dict:
    """Each region's values per period, one series per region and metric, oldest first: for line charts."""
    ids = [r.strip() for r in region_id.split(",") if r.strip()]
    if not 1 <= len(ids) <= 20:
        raise HTTPException(422, "region_id: 1 sampai 20 wilayah")
    names = [m.strip() for m in metrics.split(",") if m.strip()] if metrics else None
    rows = query("""
        SELECT i.region_id, r.name, i.metric, coalesce(m.label, i.metric) AS label, i.unit,
               m.metric IS NULL AS internal, i.period, i.value, i.is_modelled, i.source_id
        FROM indicator i JOIN region r ON r.id = i.region_id LEFT JOIN metric_def m ON m.metric = i.metric
        WHERE i.region_id = ANY(%(ids)s) AND (%(names)s::text[] IS NULL OR i.metric = ANY(%(names)s))
          AND (%(since)s::date IS NULL OR i.period >= %(since)s) AND (%(until)s::date IS NULL OR i.period <= %(until)s)
        ORDER BY i.region_id, i.metric, i.period""",
        {"ids": ids, "names": names, "since": since, "until": until})
    series: dict[tuple, dict] = {}
    for r in rows:
        s = series.setdefault((r["region_id"], r["metric"]), {
            k: r[k] for k in ("region_id", "name", "metric", "label", "unit", "internal", "source_id")} | {"points": []})
        s["points"].append({"period": r["period"], "value": r["value"], "is_modelled": r["is_modelled"]})
    return {"series": list(series.values())}


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
