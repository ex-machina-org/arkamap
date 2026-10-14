"""Tool contract: what the Agent may call.

Every tool returns one envelope, always the same shape:
    {"tool": str, "data": {...}, "viz": {...} | None, "sources": [...]}
`data` is the only place numbers may come from — the Agent's answer is
checked against it (agent.py). `viz` is a render hint for the UI:
    {"type": "ranking" | "region_card" | "event_map" | "alerts", ...payload}
Tools reuse the API route functions so the API and the Agent can never
disagree on a number.
"""
import logging
from collections import Counter
from contextvars import ContextVar
from typing import Literal
from datetime import datetime, timedelta, timezone
from zoneinfo import ZoneInfo

from fastapi import HTTPException
from pydantic import BaseModel, Field

from ..api import routes
from ..api.schemas import ScoreWeights
from ..db import query, query_one
from . import catalog
from . import guide as guide_kb
from .standards import POLLUTANTS, assess, overall, standard

log = logging.getLogger(__name__)

# The signed-in user of the current chat turn, set by the agent from the request's
# token. Tools read it from here, never from model arguments, so a prompt can't
# make the model ask for someone else's data.
CURRENT_USER: ContextVar[dict | None] = ContextVar("agent_user", default=None)


class Empty(BaseModel):
    pass


class FindRegionArgs(BaseModel):
    name: str = Field(description="Nama provinsi atau kabupaten/kota, mis. 'Riau'")


class RegionArgs(BaseModel):
    region_id: str = Field(description="id wilayah dari find_region")
    # set by the agent from the question's topic (agent._focus), whatever the model sends
    metrics: list[str] | None = Field(None, description="diisi otomatis; kosongkan")


class RankArgs(BaseModel):
    weights: dict[str, float] = Field(
        description="metrik -> bobot, mis. {'fire_risk': 1}. Nama metrik dari list_metrics.")
    level: Literal["provinsi", "kabkota"] = "provinsi"
    top_n: int = Field(10, ge=1, le=50)
    sort: Literal["attention", "value_desc", "value_asc"] = Field("attention", description=(
        "attention = skor 'perlu perhatian' tertinggi dulu (gabungan beberapa metrik). "
        "Untuk satu metrik, pakai value_desc untuk 'tertinggi/terbanyak/terpadat' dan "
        "value_asc untuk 'terendah/tersedikit' menurut nilai aslinya."))
    within: str | None = Field(None, description="hanya kab/kota di provinsi ini (id provinsi); kosongkan untuk nasional")
    include: str | None = Field(None, description=(
        "id wilayah yang sedang dibahas: ikut ditampilkan dengan peringkatnya walau di luar top_n"))


class EventArgs(BaseModel):
    kind: Literal["quake", "hotspot", "disaster"] = Field(
        description="quake=gempa, hotspot=titik panas, disaster=erupsi/banjir/kebakaran hutan besar dll (GDACS, EONET)")
    days: int = Field(7, ge=1, le=365, description=(
        "rentang hari ke belakang. Untuk disaster pakai minimal 90 (bencana jarang terjadi); "
        "untuk 'akhir-akhir ini' tanpa angka, jangan pakai kurang dari 30."))
    min_mag: float = Field(4.5, ge=0, le=10, description="hanya untuk quake")
    region_id: str | None = Field(None, description=(
        "batasi ke satu wilayah (id dari find_region). Kosongkan untuk seluruh Indonesia."))


def _env(tool: str, data: dict, viz: dict | None = None, sources: list[str] | None = None) -> dict:
    return {"tool": tool, "data": data, "viz": viz, "sources": sorted(set(sources or []))}


def list_metrics() -> dict:
    ms = routes.metrics()
    return _env("list_metrics", {"metrics": [
        {"metric": m.metric, "label": m.label, "unit": m.unit, "aspect": m.aspect,
         "polarity": m.polarity} for m in ms]})


def find_region(name: str) -> dict:
    rows = query(
        "SELECT id, name, level FROM region WHERE name ILIKE %s"
        " ORDER BY (lower(name) = lower(%s)) DESC, (level = 'provinsi') DESC, name LIMIT 5",
        (f"%{name}%", name))
    return _env("find_region", {"matches": rows})


def region_summary(region_id: str, metrics: list[str] | None = None) -> dict:
    """`metrics`: only these indicators (the data asked about); None = all."""
    r = routes.region_detail(region_id)  # raises HTTPException 404 on unknown id
    inds = [i.model_dump(mode="json") for i in r.indicators if not metrics or i.metric in metrics]
    for i in inds:   # air values read against the official limit: "Tidak sehat", over the limit or not
        if (st := assess(i["metric"], i["value"])):
            i["status"], i["standar"] = st, standard(i["metric"])
    have = {i["metric"] for i in inds}
    cov = catalog.coverage()
    # asked for but absent: said plainly, with where it exists, instead of other data taking its place
    missing = [{"metric": m, "label": cov[m]["label"], "tersedia_untuk": catalog.where(cov[m])}
               for m in (metrics or []) if m not in have and m in cov]
    data = {"id": r.id, "name": r.name, "level": r.level, "population": r.population,
            "score_meaning": routes.SCORE_MEANING, "indicators": inds, "tidak_ada": missing}
    # air asked about as a whole (not one pollutant): one verdict from every pollutant, as ISPU reads it
    if not metrics or len(set(metrics) & set(POLLUTANTS)) > 1:
        if (air := overall({i.metric: i.value for i in r.indicators if i.metric in POLLUTANTS})):
            data["kualitas_udara"] = air
    return _env("region_summary", data, {"type": "region_card", **data},
                [i["source_id"] for i in inds])


def rank_regions(weights: dict[str, float], level: str = "provinsi", top_n: int = 10,
                 sort: str = "attention", within: str | None = None, include: str | None = None) -> dict:
    res = routes.composite_score(ScoreWeights(weights=weights))
    # /score ranks every level together; keep the requested one. Kabkota
    # without population are lakes/forest polygons in the boundary data
    # (Danau Toba, Waduk Cirata, "Hutan"), not places anyone asks about.
    ids = {r["id"] for r in query(
        "SELECT id FROM region WHERE level = %s AND (level = 'provinsi' OR population IS NOT NULL)"
        " AND (%s::text IS NULL OR parent_id = %s)", (level, within, within))}
    parent = within and query("SELECT name FROM region WHERE id = %s", (within,))
    rows = [{**{k: r[k] for k in ("region_id", "name", "score", "coverage", "modelled_share",
                                  "min_confidence")},
             # raw values: the score alone hides direction (for a high_good
             # metric a top score means the LEAST of it)
             "values": {m: p["value"] for m, p in r["parts"].items()}}
            for r in res["results"] if r["region_id"] in ids]
    total = len(rows)   # regions at this level that have the data, before the top_n cut
    if sort != "attention":
        if len(weights) != 1:
            raise ValueError("sort value_desc/value_asc hanya untuk satu metrik")
        m = next(iter(weights))
        rows.sort(key=lambda x: x["values"][m], reverse=(sort == "value_desc"))
    for i, row in enumerate(rows, 1):
        row["peringkat"] = i
    one = next(iter(weights)) if len(weights) == 1 else None
    # one metric with an official limit: each region's value read against it, and how many exceed it
    if one and (std := standard(one)):
        for row in rows:
            row["status"] = assess(one, row["values"].get(one))
        over = sum(bool((row["status"] or {}).get("melebihi_batas")) for row in rows)
    # the region under discussion stays in view, with its place, even outside the top
    extra = [row for row in rows[top_n:] if row["region_id"] == include]
    rows = rows[:top_n] + extra
    defs = query("SELECT metric, label, unit, source_id FROM metric_def WHERE metric = ANY(%s)",
                 (list(weights),))
    data = {"weights": weights, "level": level, "top_n": top_n, "sort": sort, "wilayah_dengan_data": total,
            "dalam_provinsi": parent[0]["name"] if parent else None,
            "polarity": res["polarity"], "score_meaning": res["score_meaning"],
            "labels": {d["metric"]: d["label"] for d in defs},
            "units": {d["metric"]: d["unit"] for d in defs}, "results": rows, "sorot": include}
    if one and std:
        data["standar"] = {one: std}
        if "batas" in std:
            data["melebihi_batas"] = {"jumlah": over, "dari": total}
    srcs = [d["source_id"] for d in defs]
    return _env("rank_regions", data, {"type": "ranking", **data}, srcs)


_EVENT_SOURCES = {"quake": ["usgs_quake", "emsc_quake"], "hotspot": ["firms_viirs", "firms_extra"],
                  "disaster": ["gdacs", "nasa_eonet"]}


_EVENT_MARGIN = {"quake": 1.0, "hotspot": 0.0, "disaster": 0.5}  # see routes.in_region


def _places(points: list[tuple[float, float]]) -> list[dict]:
    """Province and kabupaten/kota of each (lon, lat), so an answer can say where.
    Offshore points (quakes) take the nearest region within 1 degree."""
    if not points:
        return []
    rows = query(
        """
        SELECT p.i, k.name AS kabkota, pr.name AS provinsi
        FROM unnest(%(lon)s::float8[], %(lat)s::float8[]) WITH ORDINALITY AS p(lon, lat, i)
        CROSS JOIN LATERAL (SELECT ST_SetSRID(ST_MakePoint(p.lon, p.lat), 4326) AS g) pt
        LEFT JOIN LATERAL (SELECT name FROM region WHERE level = 'kabkota' AND ST_DWithin(geom, pt.g, 1.0)
                           ORDER BY geom <-> pt.g LIMIT 1) k ON TRUE
        LEFT JOIN LATERAL (SELECT name FROM region WHERE level = 'provinsi' AND ST_DWithin(geom, pt.g, 1.0)
                           ORDER BY geom <-> pt.g LIMIT 1) pr ON TRUE
        ORDER BY p.i
        """, {"lon": [p[0] for p in points], "lat": [p[1] for p in points]})
    return [{k: v for k, v in (("kabkota", r["kabkota"]), ("provinsi", r["provinsi"])) if v} for r in rows]


def _hotspots_by_region(region: dict | None) -> dict | None:
    """Where the fires are: the precomputed 7-day count per province, or per
    kabupaten/kota inside one province. Instant, unlike counting raw points."""
    if region and region["level"] != "provinsi":
        return None
    rows = query(
        "SELECT r.name, i.value FROM indicator_latest i JOIN region r ON r.id = i.region_id"
        " WHERE i.metric = 'hotspot_count_7d' AND i.value > 0 AND r.level = %s"
        " AND (%s::text IS NULL OR r.parent_id = %s) ORDER BY i.value DESC LIMIT 5",
        ("kabkota" if region else "provinsi", region and region["id"], region and region["id"]))
    return {"window_days": 7, "level": "kabkota" if region else "provinsi", "source": "firms_viirs",
            "top": [{"name": r["name"], "count": int(r["value"])} for r in rows]} if rows else None


def events(kind: str, days: int = 7, min_mag: float = 4.5, region_id: str | None = None) -> dict:
    """Recorded events only — quakes are never forecasts."""
    region = None
    if region_id:
        region = query("SELECT id, name, level FROM region WHERE id = %s", (region_id,))
        if not region:
            raise ValueError(f"wilayah '{region_id}' tidak ditemukan; pakai find_region dulu")
        region = region[0]
    if kind == "quake":
        fc = routes.quakes(days=days, limit=200, min_mag=min_mag, region_id=region_id)
    elif kind == "hotspot":
        fc = routes.hotspots(days=days, limit=200, min_frp=0.0, region_id=region_id)
    else:
        fc = routes.disasters(days=days, limit=200, type=None, min_alert=0, region_id=region_id)
    since = datetime.now(timezone.utc) - timedelta(days=days)
    total = query(
        "SELECT COUNT(*) AS n FROM observation WHERE metric = %(kind)s AND " + routes.counted(kind)
        + " AND observed_at >= %(since)s AND (%(kind)s <> 'quake' OR value >= %(min)s) AND " + routes.in_region(region_id),
        {"kind": kind, "since": since, "min": min_mag, "region_id": region_id,
         "margin": _EVENT_MARGIN[kind]})[0]["n"]
    feats = fc["features"]
    places = _places([tuple(f["geometry"]["coordinates"][:2]) for f in feats])
    top = [{**{k: v for k, v in f["properties"].items() if v is not None and k != "url"},
            "lon": f["geometry"]["coordinates"][0], "lat": f["geometry"]["coordinates"][1], **place}
           for f, place in zip(feats[:10], places)]
    # the shown events (strongest first) per province: where the notable ones are
    data = {"kind": kind, "days": days, "region": region, "total_count": total,
            "shown": fc["count"], "top": top,
            "shown_by_provinsi": [{"name": n, "count": c} for n, c in
                                  Counter(p["provinsi"] for p in places if p.get("provinsi")).most_common(5)]}
    if kind == "hotspot" and (by := _hotspots_by_region(region)):
        data["by_region_7d"] = by
    if kind == "quake":
        data["min_mag"] = min_mag
    if kind == "disaster":
        data["by_type"] = dict(Counter(f["properties"].get("type") for f in fc["features"]))
    viz = {"type": "event_map", **data, "geojson": fc}
    return _env("events", data, viz, _EVENT_SOURCES[kind])


class EventTrendArgs(BaseModel):
    kind: Literal["quake", "hotspot", "disaster"] = Field(description="quake=gempa, hotspot=titik panas, disaster=bencana lain")
    days: int = Field(30, ge=2, le=365, description="rentang hari ke belakang; per minggu bila lebih dari 90 hari")
    min_mag: float = Field(4.5, ge=0, le=10, description="hanya untuk quake")
    region_id: str | None = Field(None, description="batasi ke satu wilayah (id dari find_region); kosong = Indonesia")


_EVENT_LABEL = {"quake": "Gempa", "hotspot": "Titik panas", "disaster": "Bencana"}


def event_trend(kind: str, days: int = 30, min_mag: float = 4.5, region_id: str | None = None) -> dict:
    """How many events were recorded per day (per week past 90 days), WIB, oldest
    first and with the empty days too, so a chart shows when activity rose, peaked
    and calmed; for quakes also the strongest magnitude per bucket. The total,
    the busiest bucket, the empty ones and the first half against the second are
    computed here."""
    region = None
    if region_id and not (region := query_one("SELECT id, name, level FROM region WHERE id = %s", (region_id,))):
        raise ValueError(f"wilayah '{region_id}' tidak ditemukan; pakai find_region dulu")
    week = days > 90
    today = datetime.now(WIB).date()
    start = today - timedelta(days=days - 1)
    if week:
        start -= timedelta(days=start.weekday())   # whole weeks, Monday first, like date_trunc('week')
    rows = query(
        "SELECT date_trunc(%(unit)s, observed_at AT TIME ZONE 'Asia/Jakarta')::date AS t, count(*) AS n,"
        " max(value) AS top FROM observation WHERE metric = %(kind)s AND " + routes.counted(kind)
        + " AND observed_at >= %(since)s AND (%(kind)s <> 'quake' OR value >= %(min)s) AND " + routes.in_region(region_id)
        + " GROUP BY 1",
        {"unit": "week" if week else "day", "kind": kind, "min": min_mag, "region_id": region_id,
         "margin": _EVENT_MARGIN[kind], "since": datetime.combine(start, datetime.min.time(), WIB)})
    by = {r["t"]: r for r in rows}
    step = timedelta(days=7 if week else 1)
    points, t = [], start
    while t <= today:
        hit = by.get(t)
        points.append({"period": t, "value": hit["n"] if hit else 0,
                       **({"terkuat": hit["top"]} if kind == "quake" and hit else {})})
        t += step
    total = sum(p["value"] for p in points)
    # Arkamap only holds what it has collected: before every source of this kind has its first
    # stored event the empty days mean "not recorded yet", not "nothing happened", so they stay
    # out of the analysis (a feed's one old event, like GDACS's, does not make a year complete)
    first = query_one("SELECT max(f) AS t FROM (SELECT min(observed_at AT TIME ZONE 'Asia/Jakarta')::date AS f"
                      " FROM observation WHERE metric = %s GROUP BY source_id) s", (kind,))["t"]
    known = [p for p in points if first and p["period"] >= (first - timedelta(days=first.weekday()) if week else first)]
    half = len(known) // 2
    early, late = sum(p["value"] for p in known[:half]), sum(p["value"] for p in known[half:])
    peak = max(points, key=lambda p: p["value"])
    data = {"kind": kind, "label": _EVENT_LABEL[kind], "days": days, "per": "minggu" if week else "hari",
            "region": region, "total": total, "points": points,
            "ringkasan": {"rata_rata": round(total / len(known), 2) if known else None,
                          "tertinggi": {"nilai": peak["value"], "waktu": peak["period"]},
                          "tanpa_kejadian": sum(p["value"] == 0 for p in known)},
            # the second half of the window against the first: is it getting busier?
            "paruh": {"awal": early, "akhir": late,
                      "arah": "naik" if late > early else "turun" if late < early else "tetap"}}
    if first and first > start:
        data["data_sejak"] = first   # the chart and the answer must say the window starts before the data does
    if kind == "quake":
        data["min_mag"] = min_mag
        if strongest := max((p for p in points if "terkuat" in p), key=lambda p: p["terkuat"], default=None):
            data["ringkasan"]["terkuat"] = {"nilai": strongest["terkuat"], "waktu": strongest["period"]}
    return _env("event_trend", data, {"type": "event_trend", **data}, _EVENT_SOURCES[kind])


def alerts() -> dict:
    n = routes.notifications()
    data = {"count": n["count"],
            "weather_warnings": [{k: w[k] for k in ("event", "area", "severity", "expires")}
                                 for w in n["weather_warnings"][:10]],
            "total_weather_warnings": len(n["weather_warnings"]),
            "quake_alerts": n["quake_alerts"][:10],
            "region_alerts": n["region_alerts"][:10],
            "disaster_alerts": n["disaster_alerts"][:10], "total_disaster_alerts": len(n["disaster_alerts"]),
            "total_quake_alerts": len(n["quake_alerts"]), "total_region_alerts": len(n["region_alerts"]),
            "shown_limit": 10, "not_shown": max(0, len(n["region_alerts"]) - 10), "source_alerts": n["source_alerts"]}
    return _env("alerts", data, {"type": "alerts", **data})


def my_data() -> dict:
    """The signed-in user's own monitoring profile and IoT devices: status, data
    tables and the latest value of each field. Private: only for CURRENT_USER."""
    user = CURRENT_USER.get()
    if not user:
        raise ValueError("perlu masuk (login) untuk melihat data akun")
    from ..api import users   # late: the API module pulls in the whole IoT stack
    profile = users._active_profile(user["id"])
    now = datetime.now(timezone.utc)
    devices = []
    for d in query("SELECT d.id, d.name, d.last_seen_at, d.rejected_count, d.last_error, d.last_warning,"
                   " r.name AS region_name FROM device d LEFT JOIN region r ON r.id = d.region_id"
                   " WHERE d.user_id = %s AND d.revoked_at IS NULL AND d.test_expires_at IS NULL ORDER BY d.created_at LIMIT 10", (user["id"],)):
        latest = {r["key"]: r["sample"] for r in query("SELECT key, sample FROM device_field WHERE device_id = %s",
                                                       (d["id"],))}
        tables = [{"name": st["name"], "readings": st["reading_count"], "last_seen_at": st["last_seen_at"],
                   "versions": len(st["versions"]),
                   "latest": {f["label"]: latest.get(f"{st['slug']}/{f['key']}") for f in st["fields"][:12]}}
                  for st in users._streams(d["id"])[:20]]
        seen = d["last_seen_at"]
        devices.append({"name": d["name"], "region": d["region_name"], "last_seen_at": seen, "table_count": len(tables),
                        "online": bool(seen and now - seen < timedelta(minutes=15)),
                        "rejected": d["rejected_count"], "last_error": d["last_error"],
                        "last_warning": d["last_warning"], "tables": tables})
    data = {"user": {"name": user["name"]}, "device_count": len(devices), "devices": devices,
            "profile": profile and {k: profile.get(k) for k in ("role", "goals", "field_label", "mode_label",
                                                                 "mode_title", "region_id", "region_name")}}
    return _env("my_data", data, None, ["arkamap_iot"])


class TrendArgs(BaseModel):
    region_id: str = Field(description="id wilayah dari find_region")
    metric: str = Field(description="nama metrik persis dari katalog, mis. 'pm25_mean'")
    days: int = Field(30, ge=1, le=365, description="rentang hari ke belakang")


def trend(region_id: str, metric: str, days: int = 30) -> dict:
    """One region's values of one metric per period, oldest first, and the change
    between the first and last period: computed here, in the metric's unit and in
    percent, so the model never subtracts or mixes the two up."""
    region = query_one("SELECT id, name, level FROM region WHERE id = %s", (region_id,))
    if not region:
        raise ValueError(f"wilayah '{region_id}' tidak dikenal")
    rows = query("SELECT period, value, unit, is_modelled, source_id FROM indicator"
                 " WHERE region_id = %s AND metric = %s AND period >= current_date - %s ORDER BY period",
                 (region_id, metric, days))
    cov = catalog.coverage().get(metric)
    if not rows and not cov:
        raise ValueError(f"metrik '{metric}' tidak dikenal; pakai nama dari katalog")
    points = [{"period": r["period"], "value": r["value"], "is_modelled": r["is_modelled"]} for r in rows]
    data = {"region": region, "metric": metric, "label": cov["label"] if cov else metric,
            "unit": (cov["unit"] if cov else None) or (rows[0]["unit"] if rows else ""), "days": days,
            "periode_tersimpan": len(points), "points": points}
    if len(points) >= 2:
        data["perubahan"] = _change(points, data["unit"])
        data["ringkasan"] = _summary(points)
    if points and (std := standard(metric)):
        data["standar"] = std
        data["status_terakhir"] = assess(metric, points[-1]["value"])
        if "batas" in std:
            data["periode_melebihi_batas"] = sum(p["value"] is not None and p["value"] > std["batas"] for p in points)
    source = (cov or {}).get("source_id") or (rows[0]["source_id"] if rows else None)
    return _env("trend", data, {"type": "trend", **data}, [source] if source else [])


def _summary(points: list[dict]) -> dict:
    """What a reader looks for in a line before reading it: the average, and when
    the highest and lowest values happened (a bucket's own max/min when the
    points are averages per bucket). Computed here, never by the model."""
    vals = [p["value"] for p in points if p["value"] is not None]
    hi = max(points, key=lambda p: p.get("max", p["value"]) if p["value"] is not None else float("-inf"))
    lo = min(points, key=lambda p: p.get("min", p["value"]) if p["value"] is not None else float("inf"))
    return {"rata_rata": round(sum(vals) / len(vals), 2) if vals else None,
            "tertinggi": {"nilai": hi.get("max", hi["value"]), "waktu": hi["period"]},
            "terendah": {"nilai": lo.get("min", lo["value"]), "waktu": lo["period"]}}


def _change(points: list[dict], unit: str) -> dict:
    """First to last point: direction, difference in the unit and in percent."""
    a, b = points[0]["value"], points[-1]["value"]
    return {"arah": "naik" if b > a else "turun" if b < a else "tetap", "nilai": round(b - a, 2), "satuan": unit,
            "persen": round((b - a) / a * 100, 1) if a else None,
            "dari": points[0]["period"], "sampai": points[-1]["period"]}


def my_fields() -> list[dict]:
    """Every sensor field of the signed-in user's own devices: {device, table, key, label}. [] for guests."""
    user = CURRENT_USER.get()
    if not user:
        return []
    from ..api import users   # late: the API module pulls in the whole IoT stack
    return [{"device": d["name"], "device_id": d["id"], "table": st["name"], "stream_id": st["id"],
             "key": f["key"], "label": f["label"]}
            for d in query("SELECT id, name FROM device WHERE user_id = %s AND revoked_at IS NULL AND test_expires_at IS NULL ORDER BY created_at",
                           (user["id"],))
            for st in users._streams(d["id"]) for f in st["fields"]]


WIB = ZoneInfo("Asia/Jakarta")
# when a reading happened: the sensor's own "waktu" when it sent one, else arrival
_AT = "coalesce(measured_at, received_at)"


def _wib(t: datetime | None) -> datetime | None:
    """A time as WIB; a naive one (from a question or the model) is read as WIB."""
    return t and (t.replace(tzinfo=WIB) if t.tzinfo is None else t.astimezone(WIB))


def _window(since: datetime | None, until: datetime | None, hours: int | None) -> tuple[str, dict]:
    """SQL condition and params for a readings window: explicit since/until, else the last `hours`, else all."""
    if since or until:
        return (f" AND (%(since)s::timestamptz IS NULL OR {_AT} >= %(since)s)"
                f" AND (%(until)s::timestamptz IS NULL OR {_AT} < %(until)s)", {"since": _wib(since), "until": _wib(until)})
    if hours:
        return f" AND {_AT} > now() - make_interval(hours => %(hours)s)", {"hours": hours}
    return "", {}


def _pick(mine: list[dict], device: str | None, table: str | None) -> list[dict]:
    """The user's fields on the named device and table. An exact name wins over a
    longer one containing it ("Stasiun Udara Kaliurang" is not "... (Marsa)")."""
    def narrow(rows: list[dict], key: str, want: str | None) -> list[dict]:
        if not want:
            return rows
        return ([f for f in rows if f[key].lower() == want.lower()]
                or [f for f in rows if want.lower() in f[key].lower()])
    return narrow(narrow(mine, "device", device), "table", table)


# a chart line reads well up to a few hundred points; more readings than this are averaged per bucket
MAX_POINTS = 300
# (date_bin interval, how the answer names it, seconds): the smallest that keeps the line under MAX_POINTS
_BUCKETS = (("5 minutes", "rata-rata per 5 menit", 300), ("15 minutes", "rata-rata per 15 menit", 900),
            ("1 hour", "rata-rata per jam", 3600), ("3 hours", "rata-rata per 3 jam", 10800),
            ("6 hours", "rata-rata per 6 jam", 21600), ("1 day", "rata-rata per hari", 86400))


def _readings_series(base: str, params: dict, stats: dict) -> tuple[list[dict], str | None]:
    """One field's readings for a chart that covers the whole window, oldest first:
    every reading when there are few, else the mean (with the bucket's min and max)
    per bucket, computed in the database. (points, bucket name or None = raw)."""
    num = f"{base} AND jsonb_typeof(data->%(key)s) = 'number'"
    if stats["n"] <= MAX_POINTS:
        rows = query(f"SELECT (data->>%(key)s)::float AS v, {_AT} AS t {num} ORDER BY t", params)
        return [{"period": _wib(r["t"]), "value": r["v"], "is_modelled": False} for r in rows], None
    span = (stats["last"] - stats["first"]).total_seconds()
    step, name, _ = next((b for b in _BUCKETS if span / b[2] <= MAX_POINTS), _BUCKETS[-1])
    # buckets start on WIB clock boundaries: a day is a WIB day, not a UTC one
    rows = query(f"""SELECT date_bin(%(step)s::interval, {_AT}, timestamptz '2000-01-01 00:00+07') AS t,
                            avg((data->>%(key)s)::float) AS v, min((data->>%(key)s)::float) AS lo,
                            max((data->>%(key)s)::float) AS hi, count(*) AS n
                     {num} GROUP BY 1 ORDER BY 1""", params | {"step": step})
    return [{"period": _wib(r["t"]), "value": round(r["v"], 2), "min": r["lo"], "max": r["hi"], "n": r["n"],
             "is_modelled": False} for r in rows], name


class CompareArgs(BaseModel):
    region_ids: list[str] = Field(min_length=1, max_length=5, description=(
        "id wilayah dari find_region: 2-5 wilayah untuk membandingkan satu metrik, atau satu wilayah "
        "untuk membandingkan beberapa metrik"))
    metrics: list[str] = Field(min_length=1, max_length=5, description="nama metrik persis dari katalog")
    days: int = Field(30, ge=2, le=365, description="rentang hari ke belakang")


# lines in one comparison: one per color of the chart palette, past that a chart is no longer readable
MAX_SERIES = 5


def _series(d: dict, name: str) -> dict:
    """One line of a comparison from a trend/my_readings result: its points and what was computed about them."""
    pts = d["points"]
    return {"name": name, "metric": d.get("metric") or d.get("field"), "label": d["label"], "unit": d["unit"],
            "points": pts, "terakhir": {"nilai": pts[-1]["value"], "waktu": pts[-1]["period"]} if pts else None,
            **{k: d[k] for k in ("perubahan", "ringkasan", "stats", "per", "count", "standar", "status_terakhir",
                                 "periode_melebihi_batas") if d.get(k) is not None}}


def compare(region_ids: list[str], metrics: list[str], days: int = 30) -> dict:
    """Several regions' history of one metric (one chart, one line each), or one
    region's history of several metrics (charts on a shared time axis): each
    line's points with its change, average, highest and lowest, computed here."""
    series, sources, regions = [], set(), []
    for rid in region_ids:
        for m in metrics:
            t = trend(rid, m, days)
            sources |= set(t["sources"])
            reg = t["data"]["region"]
            # "Bandung" alone is the kabupaten; on a chart beside Kota Bandung it must say so
            regions.append(f"Kab. {reg['name']}" if reg["level"] == "kabkota" and not reg["name"].startswith("Kota ")
                           else reg["name"])
            series.append(_series(t["data"], regions[-1] if len(metrics) == 1 else t["data"]["label"]))
    series = series[:MAX_SERIES]
    data = {"days": days, "same_metric": len(metrics) == 1, "series": series,
            # one metric: its name heads the chart; several: the one region they belong to
            "label": series[0]["label"] if len(metrics) == 1 else None,
            "subject": None if len(metrics) == 1 else regions[0]}
    return _env("compare", data, {"type": "trend_compare", **data}, sorted(sources))


class ReadingsArgs(BaseModel):
    field: str = Field(description="nama field sensor persis seperti di my_data, mis. 'suhu' atau 'pm25'")
    device: str | None = Field(None, description="nama alat; kosong = alat pertama yang punya field itu")
    table: str | None = Field(None, description="nama tabel data; kosong = tabel pertama yang punya field itu")
    hours: int = Field(24 * 7, ge=1, le=24 * 90, description="rentang jam ke belakang (bila since/until kosong); bawaan 7 hari")
    since: datetime | None = Field(None, description="mulai, mis. '2026-10-07T00:00' (WIB bila tanpa zona)")
    until: datetime | None = Field(None, description="sampai (tidak termasuk), mis. '2026-10-08T00:00'")


def my_readings(field: str, device: str | None = None, table: str | None = None, hours: int = 24 * 7,
                since: datetime | None = None, until: datetime | None = None) -> dict:
    """One sensor field of the signed-in user's own device over the last `hours`,
    or between `since` and `until`: count, mean, min and max (computed in the
    database), the latest value, the change from first to last reading, and the
    readings for a chart. Private: only CURRENT_USER's devices are searched."""
    if not CURRENT_USER.get():
        raise ValueError("perlu masuk (login) untuk melihat data alat")
    mine = my_fields()
    if not mine:
        raise ValueError("kamu belum punya alat IoT yang mengirim data")
    low = str.lower
    hit = next((f for f in _pick(mine, device, table) if low(field) in (low(f["key"]), low(f["label"] or ""))), None)
    if not hit:
        have = sorted({f"{f['key']} ({f['device']})" for f in mine})
        raise ValueError(f"field '{field}' tidak ada di alatmu; yang ada: {', '.join(have[:12])}")
    key = hit["key"]
    cond, params = _window(since, until, hours)
    params |= {"dev": hit["device_id"], "st": hit["stream_id"], "key": key}
    base = "FROM sensor_reading WHERE device_id = %(dev)s AND stream_id = %(st)s AND data ? %(key)s" + cond
    stats = query(f"""SELECT count(*) AS n, min((data->>%(key)s)::float) AS min, max((data->>%(key)s)::float) AS max,
                             avg((data->>%(key)s)::float) AS mean, min({_AT}) AS first, max({_AT}) AS last
                      {base} AND jsonb_typeof(data->%(key)s) = 'number'""", params)[0]
    latest = query(f"SELECT data->%(key)s AS value, {_AT} AS t {base} ORDER BY t DESC LIMIT 1", params)
    points, bucket = _readings_series(base, params, stats)
    data = {"device": hit["device"], "table": hit["table"], "field": key, "label": hit["label"] or key,
            "unit": "", "count": stats["n"], "per": bucket,
            **({"since": _wib(since), "until": _wib(until)} if since or until else {"hours": hours}),
            "latest": {"value": latest[0]["value"], "time": _wib(latest[0]["t"])} if latest else None,
            "stats": {k: round(stats[k], 2) for k in ("min", "max", "mean")} if stats["n"] else None,
            "points": points}
    if len(points) >= 2:
        data["perubahan"] = _change(points, "")
        # the database's mean of every reading, not the mean of bucket averages
        data["ringkasan"] = _summary(points) | {"rata_rata": data["stats"]["mean"]}
    viz = {"type": "trend", **data, "subject": f"{hit['device']} · {hit['table']}"}
    return _env("my_readings", data, viz, ["arkamap_iot"])


class ReadingsCompareArgs(BaseModel):
    fields: list[str] = Field(min_length=2, max_length=4, description="2-4 nama field sensor dari tabel yang sama")
    device: str | None = Field(None, description="nama alat; kosong = alat pertama yang punya field itu")
    table: str | None = Field(None, description="nama tabel data; kosong = tabel pertama yang punya field itu")
    hours: int = Field(24 * 7, ge=1, le=24 * 90, description="rentang jam ke belakang (bila since/until kosong); bawaan 7 hari")
    since: datetime | None = Field(None, description="mulai, mis. '2026-10-07T00:00' (WIB bila tanpa zona)")
    until: datetime | None = Field(None, description="sampai (tidak termasuk)")


def my_compare(fields: list[str], device: str | None = None, table: str | None = None, hours: int = 24 * 7,
               since: datetime | None = None, until: datetime | None = None) -> dict:
    """Several sensor fields of one of the signed-in user's own tables over the
    same window, as charts on a shared time axis: each field's points (averaged
    per bucket when there are many), stats, change and extremes."""
    reads = [my_readings(f, device, table, hours, since, until)["data"] for f in fields]
    first = reads[0]
    data = {"device": first["device"], "table": first["table"], "subject": f"{first['device']} · {first['table']}",
            "same_metric": False, "series": [_series(d, d["label"]) for d in reads],
            **({"since": _wib(since), "until": _wib(until)} if since or until else {"hours": hours})}
    return _env("my_compare", data, {"type": "trend_compare", **data}, ["arkamap_iot"])


class TableArgs(BaseModel):
    table: str | None = Field(None, description="nama tabel data (lihat my_data); kosong = tabel yang punya field diminta")
    device: str | None = Field(None, description="nama alat; kosong = semua alat pengguna")
    fields: list[str] | None = Field(None, description="hanya kolom ini (nama field); kosong = semua kolom tabel")
    since: datetime | None = Field(None, description="mulai, mis. '2026-10-07T00:00' (WIB bila tanpa zona)")
    until: datetime | None = Field(None, description="sampai (tidak termasuk)")
    limit: int = Field(50, ge=1, le=200, description="jumlah baris terbaru yang ditampilkan")


def my_table(table: str | None = None, device: str | None = None, fields: list[str] | None = None,
             since: datetime | None = None, until: datetime | None = None, limit: int = 50) -> dict:
    """Rows of one of the signed-in user's own data tables, newest first: only the
    requested columns and time range. Also how many rows the range holds, the
    table's fields and versions, and the user's other tables. Private: only
    CURRENT_USER's devices."""
    if not CURRENT_USER.get():
        raise ValueError("perlu masuk (login) untuk melihat data alat")
    mine = my_fields()
    if not mine:
        raise ValueError("kamu belum punya alat IoT yang mengirim data")
    low = str.lower
    wanted = [low(f) for f in fields or []]
    pool = _pick(mine, device, table)
    # the table that has every requested column, else the first that has any, else the first named
    by_stream: dict[int, list[dict]] = {}
    for f in pool:
        by_stream.setdefault(f["stream_id"], []).append(f)
    names = lambda fs: {low(f["key"]) for f in fs} | {low(f["label"] or "") for f in fs}  # noqa: E731
    sid = (next((s for s, fs in by_stream.items() if wanted and set(wanted) <= names(fs)), None)
           or next((s for s, fs in by_stream.items() if set(wanted) & names(fs)), None)
           or next(iter(by_stream), None))
    if sid is None:
        tables = sorted({f"{f['table']} ({f['device']})" for f in mine})
        raise ValueError(f"tabel tidak ditemukan; tabelmu: {', '.join(tables)}")
    cols_all = by_stream[sid]
    cols = [f for f in cols_all if not wanted or low(f["key"]) in wanted or low(f["label"] or "") in wanted]
    missing = [w for w in wanted if w not in names(cols_all)]
    first = cols_all[0]
    cond, params = _window(since, until, None)
    params |= {"dev": first["device_id"], "st": sid, "limit": limit}
    base = "FROM sensor_reading WHERE device_id = %(dev)s AND stream_id = %(st)s" + cond
    span = query(f"SELECT count(*) AS n, min({_AT}) AS first, max({_AT}) AS last {base}", params)[0]
    # the whole table's time range, so an empty window can say where the data actually is
    whole = query(f"SELECT min({_AT}) AS first, max({_AT}) AS last FROM sensor_reading"
                  " WHERE device_id = %(dev)s AND stream_id = %(st)s", params)[0]
    rows = query(f"SELECT {_AT} AS t, data {base} ORDER BY t DESC LIMIT %(limit)s", params)
    from ..api import users   # late: the API module pulls in the whole IoT stack
    st = next((x for x in users._streams(first["device_id"]) if x["id"] == sid), {})
    data = {"device": first["device"], "table": first["table"],
            "columns": [{"key": f["key"], "label": f["label"] or f["key"]} for f in cols],
            "rows": [{"waktu": _wib(r["t"]), **{f["key"]: r["data"].get(f["key"]) for f in cols}} for r in rows],
            "total": span["n"], "shown": len(rows), "first": _wib(span["first"]), "last": _wib(span["last"]),
            **({"since": _wib(since), "until": _wib(until)} if since or until else {}),
            "table_first": _wib(whole["first"]), "table_last": _wib(whole["last"]),
            "reading_count": st.get("reading_count"),
            "versions": [{"version": v["version"], "fields": v["keys"], "added": v["added"],
                          "readings": v["reading_count"]} for v in st.get("versions", [])],
            "tidak_ada": missing, "filtered": len(cols) < len(cols_all),
            "other_tables": sorted({f"{f['table']} ({f['device']})" for f in mine if f["stream_id"] != sid})}
    return _env("my_table", data, {"type": "data_table", **data}, ["arkamap_iot"])


_FACILITY = {"power_plant": ("climate_trace", "pembangkit listrik"),
             "transit_stop": ("transjakarta_gtfs", "halte TransJakarta")}   # TransJakarta: Jakarta only


class FacilityArgs(BaseModel):
    kind: Literal["power_plant", "transit_stop"] = Field(
        description="power_plant = pembangkit listrik (nilai = kapasitas MW), transit_stop = halte TransJakarta")
    region_id: str | None = Field(None, description="batasi ke satu wilayah (id dari find_region); kosong = nasional")


def facilities(kind: str, region_id: str | None = None) -> dict:
    """Facility points (power plants, transit stops) nationally or inside one
    region: how many, the largest ten, and the whole set as GeoJSON for the map."""
    region = region_id and query_one("SELECT id, name, level FROM region WHERE id = %s", (region_id,))
    if region_id and not region:
        raise ValueError(f"wilayah '{region_id}' tidak dikenal")
    rows = query("SELECT o.value, o.attrs, ST_X(o.geom) AS lon, ST_Y(o.geom) AS lat FROM observation o"
                 + (", region rg" if region else "") + " WHERE o.metric = %(kind)s"
                 + (" AND rg.id = %(region)s AND ST_Intersects(rg.geom, o.geom)" if region else "")
                 + " ORDER BY o.value DESC NULLS LAST, o.attrs->>'name'", {"kind": kind, "region": region_id})
    top = rows[:10]
    places = _places([(r["lon"], r["lat"]) for r in top])
    data = {"kind": kind, "what": _FACILITY[kind][1], "region": region or None, "total_count": len(rows),
            "top": [{"name": (r["attrs"] or {}).get("name"), **({"capacity_mw": r["value"]} if r["value"] else {}),
                     **({"fuel": r["attrs"]["fuel"]} if (r["attrs"] or {}).get("fuel") else {}),
                     "lon": r["lon"], "lat": r["lat"], **p} for r, p in zip(top, places)]}
    if kind == "power_plant":
        data["total_capacity_mw"] = round(sum(r["value"] or 0 for r in rows), 1)
        data["by_fuel"] = dict(Counter((r["attrs"] or {}).get("fuel") or "tidak diketahui" for r in rows).most_common(6))
    fc = {"type": "FeatureCollection", "features": [
        {"type": "Feature", "geometry": {"type": "Point", "coordinates": [r["lon"], r["lat"]]},
         "properties": {**(r["attrs"] or {}), "value": r["value"]}} for r in rows[:2000]]}
    return _env("facilities", data, {"type": "event_map", **data, "geojson": fc}, [_FACILITY[kind][0]])


class GuideArgs(BaseModel):
    topic: Literal[tuple(guide_kb.TOPICS)] = Field(description="topik panduan")  # type: ignore[valid-type]


def guide(topic: str) -> dict:
    return guide_kb.guide(topic)


# name -> (fn, args schema, description). The single registry; the router,
# the LangChain binding and the fallback all read from here.
TOOLS = {
    "list_metrics": (list_metrics, Empty, "Daftar metrik yang tersedia."),
    "find_region": (find_region, FindRegionArgs, "Cari id wilayah dari nama."),
    "region_summary": (region_summary, RegionArgs, "Indikator satu wilayah (yang sesuai topik pertanyaan)."),
    "rank_regions": (rank_regions, RankArgs, "Peringkat wilayah menurut bobot metrik."),
    "event_trend": (event_trend, EventTrendArgs, "Jumlah kejadian (gempa, titik panas, bencana) per hari dari waktu ke waktu, nasional atau per wilayah: tren, puncak, hari tanpa kejadian, paruh awal vs akhir."),
    "events": (events, EventArgs, "Kejadian terbaru: gempa, titik panas, atau bencana (erupsi, banjir, kebakaran hutan besar), nasional atau per wilayah (region_id)."),
    "alerts": (alerts, Empty, "Peringatan yang perlu perhatian sekarang."),
    "guide": (guide, GuideArgs, "Panduan memakai Arkamap (alat IoT, kiriman data, dashboard, akun, arti skor)."),
    "my_data": (my_data, Empty, "Profil pantauan dan alat IoT milik pengguna yang login: status, tabel data, nilai terakhir."),
    "my_readings": (my_readings, ReadingsArgs, "Riwayat satu field sensor alat milik pengguna: rata-rata, min, maks, nilai terakhir, perubahan, grafik; untuk N jam terakhir atau rentang tanggal."),
    "my_compare": (my_compare, ReadingsCompareArgs, "Bandingkan 2-4 field sensor dari satu tabel alat milik pengguna dalam rentang waktu yang sama, sebagai grafik bersumbu waktu sama."),
    "my_table": (my_table, TableArgs, "Baris tabel data alat milik pengguna (terbaru dulu): kolom dan rentang waktu yang diminta, jumlah baris, field, versi tabel."),
    "trend": (trend, TrendArgs, "Riwayat nilai satu metrik di satu wilayah per periode, dan perubahannya."),
    "compare": (compare, CompareArgs, "Bandingkan riwayat dari waktu ke waktu: satu metrik di 2-5 wilayah (satu grafik), atau 2-5 metrik di satu wilayah; tiap garis dengan perubahan, rata-rata, tertinggi, terendah."),
    "facilities": (facilities, FacilityArgs, "Pembangkit listrik (kapasitas MW, bahan bakar) atau halte TransJakarta, nasional atau per wilayah."),
}

# Skill = named group of tools + guidance. More than one skill => the same
# agent loop serves different question types.
SKILLS = {
    "ranking": {"tools": ["list_metrics", "rank_regions"],
                "when": ("Peringkat/perbandingan wilayah menurut risiko atau metrik: kebakaran, air, "
                         "energi, polusi/lalu lintas, jalan, transportasi umum, fasilitas, kesejahteraan.")},
    "region": {"tools": ["find_region", "region_summary"],
               "when": "Kondisi lengkap satu wilayah tertentu."},
    "events": {"tools": ["find_region", "events", "event_trend"],
               "when": ("Kejadian terbaru: gempa, titik panas, erupsi gunung api, banjir, kebakaran hutan besar, bencana lain; "
                        "juga tren jumlah kejadian itu dari waktu ke waktu (\"tren gempa 30 hari terakhir\").")},
    "alerts": {"tools": ["alerts"], "when": "Apa yang perlu diwaspadai sekarang."},
    "trend": {"tools": ["find_region", "trend"],
              "when": ("Perubahan atau riwayat suatu data di satu wilayah dari waktu ke waktu: tren, naik/turun, "
                       "dibanding kemarin/minggu lalu, beberapa hari terakhir.")},
    "compare": {"tools": ["find_region", "compare"],
                "when": ("Perbandingan riwayat dari waktu ke waktu dalam grafik: satu data di dua wilayah atau lebih "
                         "(\"bandingkan tren PM2.5 Jakarta dan Bandung sebulan terakhir\"), atau beberapa data di "
                         "satu wilayah (\"grafik suhu dan hujan di Riau\").")},
    "facilities": {"tools": ["find_region", "facilities"],
                   "when": ("Lokasi atau daftar fasilitas: pembangkit listrik (PLTU, PLTG, kapasitas, bahan bakar) "
                            "atau halte TransJakarta, nasional atau di satu wilayah. Juga fasilitas yang datanya "
                            "belum ada (rumah sakit, puskesmas, sekolah, SPKLU, pasar): tetap pilih skill ini, "
                            "jangan off_topic, agar dijawab bahwa datanya belum tersedia.")},
    # the signed-in user's own data; tools read the user from the session, never from arguments
    "my_data": {"tools": ["my_data", "my_readings", "my_compare", "my_table"],
                "when": ("Data milik pengguna sendiri: alat IoT/sensor miliknya, bacaan atau nilai terakhir alatnya, "
                         "riwayat bacaan sensornya (rata-rata, tertinggi, grafik, beberapa jam/hari terakhir, "
                         "rentang tanggal), isi tabel datanya (baris, kolom tertentu saja, versi tabel), "
                         "status online alat, tabel datanya, profil atau wilayah pantauannya.")},
    # no data needed: answered from app/agent/guide.py in one model call
    "guide": {"tools": ["guide"],
              "when": ("Cara memakai Arkamap tanpa meminta angka: menambah/menghubungkan alat IoT, API key, "
                       "format kiriman sensor, MQTT, tabel/versi data alat, data alat tidak masuk, dashboard, "
                       "profil, akun/login, arti skor/metrik/sumber data, fitur Arkamap.")},
    # answered with a fixed reply, no model call
    "off_topic": {"tools": [],
                  "when": ("Di luar data lingkungan Indonesia dan di luar cara memakai Arkamap: obrolan bebas, "
                           "resep, politik, pemrograman umum, tugas sekolah, topik lain.")},
}


def call(name: str, args: dict) -> dict:
    """Validate args against the contract, run, never raise: a failing tool
    becomes {"error"} so the loop can report it instead of crashing."""
    fn, schema, _ = TOOLS[name]
    try:
        return fn(**schema(**args).model_dump())
    except (HTTPException, ValueError) as exc:  # expected: bad id, bad args -> safe to show
        msg = str(getattr(exc, "detail", exc))
    except Exception:  # noqa: BLE001 - internal: log it, never echo it to the client
        log.exception("tool %s gagal", name)
        msg = "kesalahan internal"
    return {"tool": name, "error": msg, "data": {}, "viz": None, "sources": []}
