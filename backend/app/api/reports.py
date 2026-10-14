"""One-call region report for the frontend: indicators, recent events,
alerts and how fresh each source behind them is."""
from datetime import datetime, timedelta, timezone

from fastapi import APIRouter, Query

from ..db import query
from . import routes
from .schemas import ErrorResponse, RegionReport

router = APIRouter()

# How long after a source's cadence its data counts as stale. None = no
# schedule (census, on-demand), never stale.
STALE_AFTER = {
    "menit": timedelta(hours=12), "per jam": timedelta(hours=24),
    "15 menit": timedelta(hours=2),
    "harian": timedelta(days=2), "mingguan": timedelta(days=9), "tahunan": timedelta(days=400),
}

# Same margins as the Agent's events tool: offshore quakes still count.
_MARGIN = {"quake": 1.0, "hotspot": 0.0, "disaster": 0.5}


@router.get("/reports/{region_id}", response_model=RegionReport,
            responses={404: {"model": ErrorResponse}})
def region_report(region_id: str, days: int = Query(30, ge=1, le=365)) -> dict:
    region = routes.region_detail(region_id)  # 404 on unknown id
    now = datetime.now(timezone.utc)
    since = now - timedelta(days=days)

    events = {}
    for kind, margin in _MARGIN.items():
        row = query(
            "SELECT COUNT(*) AS n, MAX(value) AS mx FROM observation"
            " WHERE metric = %(kind)s AND " + routes.counted(kind) + " AND observed_at >= %(since)s AND "
            + routes.in_region(region_id),
            {"kind": kind, "since": since, "region_id": region_id, "margin": margin},
        )[0]
        events[kind] = {"count": row["n"], "max_value": row["mx"] if kind != "disaster" else None}

    disasters = [f["properties"] for f in routes.disasters(
        days=days, limit=50, type=None, min_alert=0, region_id=region_id)["features"]]
    alerts = [a for a in routes.notifications(region_id)["region_alerts"] if a["region_id"] == region_id]

    used = {i.source_id for i in region.indicators} | {
        "usgs_quake", "emsc_quake", "firms_viirs", "firms_extra", "gdacs", "nasa_eonet"}
    sources = []
    for s in query("SELECT id, title, cadence, is_modelled, last_ok_at FROM source"
                   " WHERE id = ANY(%s) ORDER BY id", (sorted(used),)):
        limit = STALE_AFTER.get(s["cadence"])
        stale = bool(limit) and (s["last_ok_at"] is None or now - s["last_ok_at"] > limit)
        sources.append({**s, "stale": stale})

    return {"generated_at": now, "days": days, "region": region, "events": events,
            "disasters": disasters, "alerts": alerts, "sources": sources}
