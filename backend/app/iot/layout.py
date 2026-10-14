"""Decide how each field a device sends should be shown.

The AI only decides *presentation*: what a field means, its unit, which
widget fits, and which of our own metrics it can be compared with. Values
always come from the database, never from the model. Without a key, or if
the model fails, rule_layout() gives a usable default.
"""
import json
import logging
import re
import threading
from typing import Literal

from psycopg.types.json import Jsonb
from pydantic import BaseModel, Field

from ..config import GEMINI_API_KEY, LLM_MODEL
from ..db import conn, execute, query, query_one
from .categories import CATEGORIES as CATEGORY_LABEL, DESCRIPTION as CATEGORY_HELP, Category, rule_category

log = logging.getLogger(__name__)

Widget = Literal["line", "gauge", "stat", "bar", "status", "map", "table"]


class FieldSpec(BaseModel):
    field: str = Field(description="nama field persis seperti di data")
    label: str = Field(description="label singkat bahasa Indonesia untuk ditampilkan")
    unit: str | None = Field(None, description="satuan, mis. °C, %, µg/m³; null bila tidak jelas")
    semantic: str = Field(description="arti field, mis. suhu_udara, kelembapan_tanah, ph_air, lokasi, status")
    widget: Widget = Field(description=(
        "line = deret waktu angka; gauge = angka dengan rentang wajar; stat = angka tunggal; "
        "bar = hitungan/kategori; status = boolean/teks status; map = koordinat; table = lainnya"))
    group: str = Field(description="kelompok tampilan, mis. Udara, Tanah, Air, Energi, Perangkat")
    compare_metric: str | None = Field(None, description="id metrik kita yang sebanding, atau null")
    hidden: bool = Field(False, description="true untuk field teknis (id, rssi, versi firmware)")
    pair_field: str | None = Field(None, description="map: field longitude pasangan field latitude ini")
    category: Category = Field("lainnya", description="kategori tetap: " + CATEGORY_HELP)
    by: Literal["ai", "rule", "user"] = "ai"


class Layout(BaseModel):
    widgets: list[FieldSpec]


# field keys are "<nama>/<field>" (see ingest.py), so "/" separates words too
_LAT = re.compile(r"(^|[._/])(lat|latitude)$", re.I)
_LON = re.compile(r"(^|[._/])(lon|lng|long|longitude)$", re.I)
_TECH = re.compile(r"(^|[._/])(id|rssi|snr|firmware|fw|version|versi|uptime|mac|ip)$", re.I)


def rule_layout(fields: list[dict]) -> list[dict]:
    """Deterministic fallback from types alone."""
    out = []
    for f in fields:
        k, t = f["key"], f["type"]
        if _LAT.search(k) or _LON.search(k):
            w, sem = "map", "lokasi"
        elif t == "number":
            w, sem = "line", "angka"
        elif t == "boolean":
            w, sem = "status", "status"
        else:
            w, sem = "table", "teks"
        name = k.rsplit("/", 1)[-1]
        cat = rule_category(name)
        out.append(FieldSpec(field=k, label=name.replace("_", " ").replace(".", " › "), semantic=sem,
                             widget=w, group=CATEGORY_LABEL[cat], hidden=bool(_TECH.search(k)),
                             category=cat, by="rule").model_dump())
    return out


NOT_COMPARABLE = ["rain_30d", "dry_days", "hotspot_count_7d", "quake_count_30y", "quake_max_mag_30y",
                  "ev_charging_count", "power_capacity_mw", "solar_rooftop_mwp"]

_UNIT_ALIASES = {"km/h": "km/jam", "kmh": "km/jam", "kph": "km/jam", "ug/m3": "µg/m³",
                 "μg/m³": "µg/m³", "µg/m3": "µg/m³", "c": "°c", "degc": "°c", "celsius": "°c",
                 "m3/s": "m³/detik", "m³/s": "m³/detik"}


def same_unit(a: str | None, b: str | None) -> bool:
    norm = lambda u: _UNIT_ALIASES.get((u or "").strip().lower(), (u or "").strip().lower())
    return bool(a and b) and norm(a) == norm(b)


def finalize(layout: list[dict], fields: list[dict]) -> list[dict]:
    """Fixes the model (or rules) can't be trusted with: lists are shown as
    tables, and a latitude/longitude pair becomes one map widget."""
    types = {f["key"]: f["type"] for f in fields}
    for w in layout:
        if types.get(w["field"]) in ("array", "object") and w["widget"] != "table":
            w["widget"], w["compare_metric"] = "table", None
    lats = [w for w in layout if _LAT.search(w["field"])]
    for lat in lats:
        prefix = lat["field"][: -len(_LAT.search(lat["field"]).group(2))]
        lon = next((w for w in layout if _LON.search(w["field"])
                    and w["field"].startswith(prefix) and w is not lat), None)
        if lon:
            lat.update(widget="map", pair_field=lon["field"], compare_metric=None)
            if not prefix.rsplit("/", 1)[-1]:   # bare lat/lon in a table: the device's position
                lat["label"] = "Lokasi"
            lon["hidden"] = True
    return layout


def _ai_layout(device: dict, fields: list[dict], metrics: list[dict]) -> list[dict]:
    from langchain_google_genai import ChatGoogleGenerativeAI

    llm = ChatGoogleGenerativeAI(model=LLM_MODEL, google_api_key=GEMINI_API_KEY, temperature=0,
                                 # Only plan_in_background() calls this, outside any request, so the 30 s
                                 # proxy limit does not apply; free-tier Gemini often needs > 15 s.
                                 timeout=60, max_retries=0, max_output_tokens=4096)
    prompt = (
        "Kamu menata dashboard sensor IoT. Untuk SETIAP field di bawah, tentukan label, satuan, "
        "arti, widget, kelompok, kategori, dan metrik pembanding. Jangan menebak nilai; kamu hanya "
        "menata tampilan.\n"
        "Key berbentuk <nama tabel>/<field>; nama tabel diberi pengirim. Label cukup nama field, "
        "tanpa nama tabel; nama tabel juga petunjuk arti field.\n"
        "Kategori WAJIB salah satu dari daftar tetap; pilih 'lainnya' bila ragu, jangan memaksakan. "
        "Baterai, sinyal, uptime alat = perangkat. Koordinat = lokasi.\n"
        "Aturan metrik pembanding: isi HANYA bila field mengukur besaran fisik yang SAMA dengan "
        "satuan yang sama, mis. PM2.5 sensor (µg/m³) vs pm25_mean, suhu udara (°C) vs "
        "temp_max_mean. Selain itu null. Contoh yang SALAH: kecepatan kendaraan vs kecepatan "
        "angin, isi tangki vs tekanan air bersih, daya listrik vs kerapatan jaringan, suhu air/tanah "
        "vs suhu udara, tinggi muka air vs debit sungai.\n"
        f"Perangkat: {device['name']} (petunjuk kategori dari pemilik: {device.get('category') or '-'})\n"
        "Field (key, tipe, contoh nilai):\n"
        + "\n".join(f"- {f['key']} ({f['type']}): {json.dumps(f['sample'])[:60]}" for f in fields)
        + "\nMetrik pembanding yang tersedia:\n"
        + "\n".join(f"- {m['metric']}: {m['label']} ({m['unit']})" for m in metrics)
    )
    res = llm.with_structured_output(Layout).invoke(prompt)
    units = {m["metric"]: m["unit"] for m in metrics}
    keys = {f["key"] for f in fields}
    by_field = {}
    for w in res.widgets:
        if w.field in keys:                     # ignore invented fields
            # a comparison only stands when the units agree; the model is
            # told this, and this catches it when it forgets
            if w.compare_metric not in units or not same_unit(w.unit, units[w.compare_metric]):
                w.compare_metric = None
            by_field[w.field] = {**w.model_dump(), "by": "ai"}
    # a field the model skipped still gets shown
    return [by_field.get(f["key"]) or rule_layout([f])[0] for f in fields]


def plan(device: dict) -> tuple[list[dict], str]:
    """Build and store the layout for a device. Keeps the user's own edits;
    widgets the rules made (AI was down) are offered to the AI again."""
    fields = query("SELECT key, type, sample, category_by FROM device_field WHERE device_id = %s ORDER BY key",
                   (device["id"],))
    old = {w["field"]: w for w in (device.get("layout") or [])}
    # widgets stored before per-widget "by" existed inherit the device's layout_by
    todo = [f for f in fields if f["key"] not in old
            or old[f["key"]].get("by", device.get("layout_by")) == "rule"]
    by = "rule"
    new: list[dict] = []
    if todo and GEMINI_API_KEY:
        try:
            # Only metrics a single sensor reading can sit next to: not period
            # totals/counts (a day's rain vs 30-day rain, both "mm") nor our
            # 0-100 indices.
            metrics = query("SELECT metric, label, unit FROM metric_def"
                            " WHERE metric <> ALL(%s) AND unit NOT ILIKE 'indeks%%' ORDER BY metric",
                            (NOT_COMPARABLE,))
            new, by = _ai_layout(device, todo, metrics), "ai"
        except Exception as exc:  # noqa: BLE001 - layout must always exist
            log.warning("layout AI gagal, pakai aturan: %s", exc)
    if todo and not new:
        new = [old.get(f["key"]) or rule_layout([f])[0] for f in todo]   # no AI: keep what was there
    fresh = {w["field"]: w for w in new}
    layout = finalize([fresh.get(f["key"]) or old[f["key"]] for f in fields], fields)
    layout_by = device.get("layout_by") if not todo else by
    with conn() as c, c.cursor() as cur:
        # still stale if a field arrived while the AI was working (setting a
        # plain FALSE here used to swallow it, and that field never got a widget)
        cur.execute("UPDATE device SET layout = %s, layout_by = %s, layout_stale = EXISTS ("
                    " SELECT 1 FROM device_field WHERE device_id = %s AND key <> ALL(%s)) WHERE id = %s",
                    (Jsonb(layout), layout_by, device["id"], [w["field"] for w in layout], device["id"]))
        # the AI's category replaces the rule's (set at ingest, with the
        # payload's own hint), never the user's
        cur.executemany("UPDATE device_field SET category = %s, category_by = 'ai'"
                        " WHERE device_id = %s AND key = %s AND category_by = 'rule'",
                        [(w["category"], device["id"], k) for k, w in fresh.items() if w.get("by") == "ai"])
    return layout, layout_by or by


def retry_rule_layouts() -> int:
    """Scheduled: devices with rule-made widgets (the AI was down when their
    fields arrived) get another AI pass. Returns how many were queued.
    Also gives rule categories to fields stored before categories existed."""
    todo = [(rule_category(r["key"].rsplit("/", 1)[-1], r["key"].split("/")[0]), r["device_id"], r["key"]) for r in query(
        "SELECT device_id, key FROM device_field WHERE category_by = 'rule' AND category = 'lainnya'")]
    if todo := [t for t in todo if t[0] != "lainnya"]:
        with conn() as c, c.cursor() as cur:
            cur.executemany("UPDATE device_field SET category = %s WHERE device_id = %s AND key = %s"
                            " AND category_by = 'rule'", todo)
    if not GEMINI_API_KEY:
        return 0
    ids = [r["id"] for r in query("SELECT id FROM device WHERE revoked_at IS NULL"
                                  " AND (layout @> %s OR layout_by = 'rule')", (Jsonb([{"by": "rule"}]),))]
    for i in ids:
        execute("UPDATE device SET layout_stale = TRUE WHERE id = %s", (i,))
        plan_in_background(i)
    return len(ids)


def provisional(device: dict) -> list[dict]:
    """What to show while the AI layout is being made: the stored layout plus
    rule-based widgets for fields it doesn't cover yet. No AI, no writes."""
    fields = query("SELECT key, type, sample FROM device_field WHERE device_id = %s ORDER BY key",
                   (device["id"],))
    old = {w["field"]: w for w in (device.get("layout") or [])}
    return finalize([old.get(f["key"]) or rule_layout([f])[0] for f in fields], fields)


# ponytail: per-process guard; the API and the MQTT bridge may each plan
# the same device once, which only costs one extra AI call
_planning: set[int] = set()
_lock = threading.Lock()


def plan_in_background(device_id: int) -> None:
    """Called when new fields arrive (and by the dashboard if a layout is
    still stale), so no request ever waits for the model. The AI runs once
    per batch of new fields; the result is stored and reused."""
    with _lock:
        if device_id in _planning:
            return
        _planning.add(device_id)

    def run() -> None:
        try:
            for _ in range(3):   # fields that arrived while planning get a follow-up pass
                dev = query_one("SELECT id, name, category, layout, layout_by, layout_stale"
                                " FROM device WHERE id = %s", (device_id,))
                if not dev or not (dev["layout_stale"] or not dev["layout"]):
                    break
                plan(dev)
        except Exception:  # noqa: BLE001 - background; the dashboard shows the provisional layout
            log.exception("penataan widget perangkat %s gagal", device_id)
        finally:
            with _lock:
                _planning.discard(device_id)

    threading.Thread(target=run, daemon=True).start()
