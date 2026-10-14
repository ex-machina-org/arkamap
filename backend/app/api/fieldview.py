"""Panels for a field's dashboard, scoped to the user's region (or all of
Indonesia when no region is set) and to the profile's mode (modes.py:
how far back events reach, plus impact for protected and history for
plan). Every number comes from the database."""
from datetime import datetime, timedelta, timezone

from .. import modes
from ..db import query, query_one
from . import routes
from .schemas import ScoreWeights

# margins as in routes.in_region
_MARGIN = {"hotspot": 0.0, "quake": 1.0, "disaster": 0.5}


def focus(region_id: str | None) -> dict | None:
    """Where the map should open: the region and its bounding box."""
    if not region_id:
        return None
    r = query_one("SELECT id, name, level, parent_id, ST_XMin(geom) w, ST_YMin(geom) s,"
                  " ST_XMax(geom) e, ST_YMax(geom) n FROM region WHERE id = %s", (region_id,))
    return r and {"id": r["id"], "name": r["name"], "level": r["level"], "parent_id": r["parent_id"],
                  "bbox": [r["w"], r["s"], r["e"], r["n"]]}


def events(field: dict, region_id: str | None, windows: dict) -> list[dict]:
    out = []
    now = datetime.now(timezone.utc)
    for kind in field["events"]:
        days = windows[kind]
        row = query_one(
            "SELECT COUNT(*) AS n, MAX(value) AS mx FROM observation"
            " WHERE metric = %(kind)s AND " + routes.counted(kind) + " AND observed_at >= %(since)s"
            " AND (%(kind)s <> 'disaster' OR %(types)s::text[] IS NULL OR attrs->>'type' = ANY(%(types)s))"
            " AND " + routes.in_region(region_id),
            {"kind": kind, "since": now - timedelta(days=days), "types": field["disaster_types"],
             "region_id": region_id, "margin": _MARGIN[kind]})
        if kind == "quake":
            fc = routes.quakes(days=days, limit=5, min_mag=3.5, region_id=region_id)
        elif kind == "hotspot":
            fc = routes.hotspots(days=min(days, 30), limit=5, min_frp=0.0, region_id=region_id)
        else:
            fc = routes.disasters(days=days, limit=50, type=None, min_alert=0, region_id=region_id)
            if field["disaster_types"]:
                fc["features"] = [f for f in fc["features"]
                                  if f["properties"].get("type") in field["disaster_types"]]
            fc["features"] = fc["features"][:5]
        out.append({"kind": kind, "days": days, "count": row["n"],
                    "max_value": row["mx"] if kind != "disaster" else None,
                    "top": [{**f["properties"], "lon": f["geometry"]["coordinates"][0],
                             "lat": f["geometry"]["coordinates"][1]} for f in fc["features"]]})
    return out


def ranking(field: dict, region: dict | None, top: int = 5) -> dict:
    """Neighbours: kabupaten/kota of the user's province, or provinces
    nationally. Sort per field (see fields.py)."""
    metric, sort = field["rank"]["metric"], field["rank"]["sort"]
    if region:
        prov = region["id"] if region["level"] == "provinsi" else region["parent_id"]
        scope = query("SELECT id FROM region WHERE parent_id = %s AND population IS NOT NULL", (prov,))
        scope_name = query_one("SELECT name FROM region WHERE id = %s", (prov,))["name"]
    else:
        scope = query("SELECT id FROM region WHERE level = 'provinsi'")
        scope_name = "Indonesia"
    ids = {r["id"] for r in scope}
    res = routes.composite_score(ScoreWeights(weights={metric: 1}))
    rows = [{"region_id": r["region_id"], "name": r["name"], "score": r["score"],
             "value": r["parts"][metric]["value"],
             "is_you": bool(region and r["region_id"] == region["id"])}
            for r in res["results"] if r["region_id"] in ids]
    if sort == "value_desc":
        rows.sort(key=lambda x: x["value"], reverse=True)
    mine = next((i + 1 for i, r in enumerate(rows) if r["is_you"]), None)
    return {"metric": metric, "sort": sort, "scope": scope_name, "polarity": res["polarity"][metric],
            "your_rank": mine, "of": len(rows), "results": rows[:top],
            "score_meaning": routes.SCORE_MEANING}


def alerts(field: dict, region: dict | None) -> dict:
    n = routes.notifications()
    in_scope = (lambda rid: True) if not region else (
        lambda rid: rid == region["id"] or rid in {r["id"] for r in query(
            "SELECT id FROM region WHERE parent_id = %s", (region["id"],))})
    types = field["disaster_types"]
    return {
        "region_alerts": [a for a in n["region_alerts"]
                          if a["metric"] in field["metrics"] and in_scope(a["region_id"])][:10],
        "disaster_alerts": [a for a in n["disaster_alerts"] if not types or a["type"] in types][:10],
        "quake_alerts": n["quake_alerts"][:10] if "quake" in field["events"] else [],
        # severe weather matters to every field; only those over the user's area
        "weather_warnings": [{k: v for k, v in w.items() if k != "gj"}
                             for w in routes._active_warnings(region["id"] if region else None)][:10],
    }


def felt_radius_km(mag: float) -> float:
    """How far a quake is roughly felt, from magnitude alone:
    10^(0.5 M - 0.6) km (M5 ~ 80 km, M6 ~ 250 km, M7 ~ 500 km, capped).
    ponytail: ignores depth and soil; a real shaking map (BMKG/USGS
    ShakeMap) would replace this if ingested."""
    return min(10 ** (0.5 * mag - 0.6), 500.0)


QUAKE_IMPACT_MIN_MAG = 5.0


def impact(region: dict | None, windows: dict) -> dict:
    """Protected mode: what happened and who is exposed. Quakes (M5+ or
    flagged by the urgency rules) with the kabupaten/kota inside their
    felt radius and their population; active BMKG warnings with the
    kabupaten/kota they cover."""
    since = datetime.now(timezone.utc) - timedelta(days=windows["quake"])
    qs = query(
        """
        SELECT o.id, o.value AS mag, o.observed_at, o.attrs, o.source_id, ST_X(o.geom) lon, ST_Y(o.geom) lat
        FROM observation o
        WHERE o.metric = 'quake' AND o.observed_at >= %s
          AND (o.value >= %s OR o.attrs->>'urgency' IN ('darurat', 'siaga_tsunami'))
        ORDER BY o.observed_at DESC LIMIT 20
        """, (since, QUAKE_IMPACT_MIN_MAG))
    quakes = []
    for q in qs:
        r_km = felt_radius_km(q["mag"])
        near = query(
            """
            SELECT r.id, r.name, r.parent_id, r.population,
                   round((ST_Distance(r.geom::geography, ST_SetSRID(ST_MakePoint(%(lon)s, %(lat)s), 4326)::geography)
                          / 1000)::numeric) AS distance_km
            FROM region r
            WHERE r.level = 'kabkota'
              -- indexed prefilter in degrees (1° >= 110 km everywhere in Indonesia), then exact metres
              AND ST_DWithin(r.geom, ST_SetSRID(ST_MakePoint(%(lon)s, %(lat)s), 4326), %(deg)s)
              AND ST_DWithin(r.geom::geography,
                  ST_SetSRID(ST_MakePoint(%(lon)s, %(lat)s), 4326)::geography, %(m)s)
            ORDER BY distance_km LIMIT 30
            """, {"lon": q["lon"], "lat": q["lat"], "m": r_km * 1000, "deg": r_km / 110})
        if region and not any(region["id"] in (n["id"], n["parent_id"]) for n in near):
            continue      # the user's area is outside this quake's reach
        a = q["attrs"] or {}
        quakes.append({
            "mag": q["mag"], "observed_at": q["observed_at"], "lat": q["lat"], "lon": q["lon"],
            "depth_km": a.get("depth_km"), "place": a.get("place"), "urgency": a.get("urgency"),
            "tsunami": bool(a.get("tsunami")), "felt": a.get("felt"), "potensi": a.get("potensi"),
            "source_id": q["source_id"], "radius_km": round(r_km),
            "regions": near, "population": sum(n["population"] or 0 for n in near),
        })
    warns = []
    for w in routes._active_warnings(region["id"] if region else None)[:10]:
        covered = query(
            """
            SELECT r.id, r.name, r.population FROM region r, weather_warning w
            WHERE w.id = %s AND r.level = 'kabkota' AND ST_Intersects(r.geom, w.geom)
            ORDER BY r.population DESC NULLS LAST LIMIT 30
            """, (w["id"],))
        warns.append({**{k: v for k, v in w.items() if k != "gj"}, "regions": covered,
                      "population": sum(c["population"] or 0 for c in covered)})
    return {"quakes": quakes, "warnings": warns,
            "radius_note": "Radius terasa diperkirakan dari magnitudo saja, bukan peta guncangan resmi; "
                           "'felt' adalah laporan BMKG bila ada."}


def history(field: dict, region_id: str | None, days: int = 365) -> list[dict]:
    """Plan mode: monthly event counts over the past year, per kind."""
    since = datetime.now(timezone.utc) - timedelta(days=days)
    out = []
    for kind in field["events"]:
        rows = query(
            "SELECT date_trunc('month', observed_at) AS month, COUNT(*) AS n FROM observation"
            " WHERE metric = %(kind)s AND " + routes.counted(kind) + " AND observed_at >= %(since)s"
            " AND (%(kind)s <> 'disaster' OR %(types)s::text[] IS NULL OR attrs->>'type' = ANY(%(types)s))"
            " AND " + routes.in_region(region_id) + " GROUP BY 1 ORDER BY 1",
            {"kind": kind, "since": since, "types": field["disaster_types"],
             "region_id": region_id, "margin": _MARGIN[kind]})
        out.append({"kind": kind, "days": days,
                    "months": [{"month": r["month"].date().isoformat(), "count": r["n"]} for r in rows]})
    return out


def build(field: dict, region_id: str | None, mode: str | None = None) -> dict:
    m = modes.get(mode)
    region = focus(region_id)
    out = {"mode": {k: m[k] for k in ("id", "label", "title", "description", "panels")},
           "focus": region, "layers": modes.layers(m["id"], field["layers"]),
           "events": events(field, region_id, m["windows"]),
           "ranking": ranking(field, region), "alerts": alerts(field, region)}
    if "impact" in m["panels"]:
        out["impact"] = impact(region, m["windows"])
    if "history" in m["panels"]:
        out["history"] = history(field, region_id)
    return out
