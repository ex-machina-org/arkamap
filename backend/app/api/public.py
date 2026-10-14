"""The public landing page: no login, one call for the national picture."""
import time
from datetime import datetime, timedelta, timezone

from fastapi import APIRouter

from .. import fields, modes
from ..db import query, query_one
from . import routes
from .schemas import FieldInfo, ModeInfo, PublicOverview, ScoreWeights

router = APIRouter()

_cache: dict = {}   # per-process 5-minute cache; the landing page is the hot path
TTL_S = 300


@router.get("/fields", response_model=list[FieldInfo])
def list_fields() -> list[dict]:
    """Fields a user can pick after login; also shown on the public page."""
    return fields.catalogue()


@router.get("/modes", response_model=list[ModeInfo])
def list_modes() -> list[dict]:
    """Profile modes (protected / responden / plan) for the profile screen."""
    return modes.catalogue()


@router.get("/public/overview", response_model=PublicOverview)
def overview() -> dict:
    """National snapshot for the public landing page."""
    if _cache and time.monotonic() - _cache["at"] < TTL_S:
        return _cache["data"]
    now = datetime.now(timezone.utc)

    def count(metric: str, days: int, extra: str = "") -> int:
        return query_one(f"SELECT COUNT(*) AS n FROM observation WHERE metric = %s AND {routes.counted(metric)}"
                         f" AND observed_at >= %s {extra}", (metric, now - timedelta(days=days)))["n"]

    top = routes.composite_score(ScoreWeights(weights={"fire_risk": 1}))
    prov = {r["id"] for r in query("SELECT id FROM region WHERE level = 'provinsi'")}
    notes = routes.snapshot(fires=False)   # fire_alerts are not in the overview
    data = {
        "generated_at": now,
        "counts": {
            "hotspots_24h": count("hotspot", 1),
            "hotspots_7d": count("hotspot", 7),
            "quakes_7d_m45": count("quake", 7, "AND value >= 4.5"),
            "disasters_30d": count("disaster", 30),
            "community_devices": query_one(
                "SELECT COUNT(*) AS n FROM device WHERE visibility = 'community'"
                " AND community_status = 'approved'")["n"],
        },
        "fire_risk_top": [{"region_id": r["region_id"], "name": r["name"], "score": r["score"]}
                          for r in top["results"] if r["region_id"] in prov][:5],
        "disaster_alerts": notes["disaster_alerts"][:5],
        "quake_alerts": notes["quake_alerts"][:5],
        "stale_sources": [{"id": s["id"], "title": s["title"], "last_ok_at": s["last_ok_at"]}
                          for s in notes["source_alerts"]],
        "fields": [{"id": f["id"], "label": f["label"], "description": f["description"]}
                   for f in fields.catalogue()],
    }
    _cache.update(at=time.monotonic(), data=data)
    return data
