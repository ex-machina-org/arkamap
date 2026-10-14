"""One ingest path for every protocol (HTTP, MQTT, ...).

Payload, whatever the transport:
    {"nama", "waktu", "data": {<anything>}}            ("kategori"? optional hint)
`data` is free-form. Nested objects are flattened to dot keys
({"cuaca": {"suhu": 29}} -> {"cuaca.suhu": 29}) so every field is one
column-like key the dashboard and AI can reason about. The device is
identified by its API key, never by `nama`.

`nama` names the data table the reading belongs to: one API key, as many
tables as the sender names (see assign_stream). Within a table, a reading
that brings fields the table never had starts a new *version*. Fields are
registered per table as "<slug>/<field>". A resend of the same reading
(same nama and data within DUP_WINDOW_S, or the same "waktu") is counted,
not stored twice.

An optional top-level "alert" ("aman" | "bahaya", or {"status", "pesan",
"kategori"}) is the device's own verdict on the reading; only its latest
state per "nama" is kept (device_alert), and only "bahaya" notifies the
owner. "kategori" (ALERT_CATEGORIES) files it under that hazard on the
alerts page; without it the alert is a general device alert.

Until IOT_STRICT_PAYLOAD is on, a reading without "nama" goes to the
"default" table and one without "waktu" is timed on arrival; both are
stored with a warning for the owner.
"""
import hashlib
import json
import logging
import re
import time
from datetime import datetime, timedelta, timezone

from psycopg.types.json import Jsonb

from ..auth import hash_key
from ..config import IOT_STRICT_PAYLOAD
from ..db import conn, execute, query, query_one
from .categories import rule_category

log = logging.getLogger(__name__)

MAX_BYTES = 16_384        # one reading; sensors send numbers, not files
MAX_FIELDS = 100
MAX_DEPTH = 4
MAX_NAMES = 10            # data tables per device: a typo in "nama" must not make dozens
DEFAULT_NAME = "default"  # transition: readings sent without "nama"
MIN_INTERVAL_S = 1.0      # per device; kept in-process, per worker/bridge
# Without the sensor's own "waktu", a resend and a genuinely unchanged
# reading look identical, so any window longer than the sensor's own
# interval drops real data (60 s kept one reading a minute from a sensor
# sending every second). Only same-data arrivals faster than a device may
# send at all count as resends; "waktu" gives exact dedup at any age.
DUP_WINDOW_S = MIN_INTERVAL_S
WIB = timezone(timedelta(hours=7))
_last: dict[int, float] = {}
_KEY_OK = re.compile(r"[^\w.\-]")
_SLUG_BAD = re.compile(r"[^a-z0-9_.\-]+")   # same rule as sql/014_named_streams.sql


ALERT_STATUSES = ("aman", "bahaya")
ALERT_CATEGORIES = ("kebakaran", "cuaca", "gempa", "bencana", "panas")  # same list as frontend use-alerts.ts


class Rejected(ValueError):
    """Payload refused; the message is safe to show to the sender."""


def slugify(nama: str) -> str:
    """ "Cuaca Luar " -> "cuaca_luar": what decides which table a reading joins."""
    return _SLUG_BAD.sub("_", nama.strip().lower()).strip("_")[:64]


def flatten(obj: dict, prefix: str = "", depth: int = 0) -> dict:
    out = {}
    for k, v in obj.items():
        key = _KEY_OK.sub("_", str(k))[:64] or "_"
        full = f"{prefix}.{key}" if prefix else key
        if isinstance(v, dict) and depth < MAX_DEPTH:
            out.update(flatten(v, full, depth + 1))
        else:
            out[full] = v
    return out


def type_of(v) -> str:
    if isinstance(v, bool):
        return "boolean"
    if isinstance(v, (int, float)):
        return "number"
    if v is None:
        return "null"
    if isinstance(v, (list, dict)):
        return "array" if isinstance(v, list) else "object"
    return "string"


def parse_time(v) -> datetime:
    """The sensor's own "waktu": ISO 8601 (no zone = WIB) or Unix seconds/ms."""
    try:
        if isinstance(v, bool):
            raise ValueError
        if isinstance(v, (int, float)):
            t = datetime.fromtimestamp(v / 1000 if v > 1e11 else v, timezone.utc)
        else:
            t = datetime.fromisoformat(str(v).replace("Z", "+00:00"))
            t = t if t.tzinfo else t.replace(tzinfo=WIB)
    except (ValueError, OverflowError, OSError):
        raise Rejected('"waktu" harus ISO 8601 (mis. 2026-10-01T08:00:00+07:00) atau detik Unix') from None
    if t > datetime.now(timezone.utc) + timedelta(minutes=10):
        raise Rejected('"waktu" ada di masa depan; cek jam perangkat')
    return t


def parse(raw: bytes | str | dict) -> dict:
    """Validate and flatten `data`. Accepts bytes (MQTT), str or a parsed dict."""
    return parse_message(raw)[0]


def parse_message(raw: bytes | str | dict) -> tuple[dict, dict]:
    """(flattened data, meta {nama, slug, kategori, waktu, warnings})."""
    if isinstance(raw, (bytes, str)):
        if len(raw) > MAX_BYTES:
            raise Rejected(f"payload lebih dari {MAX_BYTES} byte")
        try:
            raw = json.loads(raw)
        except (ValueError, UnicodeDecodeError):
            raise Rejected("payload bukan JSON") from None
    if not isinstance(raw, dict) or not isinstance(raw.get("data"), dict):
        raise Rejected('isi sensor harus dibungkus "data", contoh: '
                       '{"nama": "cuaca", "waktu": "2026-10-01T08:00:00+07:00", "data": {"suhu": 29.4}}')
    data = flatten(raw["data"])
    if not data:
        raise Rejected("data kosong")
    if len(data) > MAX_FIELDS:
        raise Rejected(f"lebih dari {MAX_FIELDS} field")
    if any(isinstance(v, float) and v != v for v in data.values()):
        raise Rejected("nilai NaN tidak didukung")
    text = lambda k: str(raw[k]).strip()[:100] if isinstance(raw.get(k), (str, int, float)) else None  # noqa: E731
    nama, warnings = text("nama"), []
    slug = slugify(nama) if nama else ""
    if not slug:
        if IOT_STRICT_PAYLOAD:
            raise Rejected('"nama" wajib diisi: nama tabel data, mis. "cuaca"')
        nama, slug = None, DEFAULT_NAME
        warnings.append('"nama" kosong; data masuk ke tabel "default". Tambahkan "nama" agar data terpisah rapi.')
    if raw.get("waktu") is None:
        if IOT_STRICT_PAYLOAD:
            raise Rejected('"waktu" wajib diisi: waktu ukur sensor, ISO 8601 atau detik Unix')
        warnings.append('"waktu" kosong; dipakai waktu diterima server. Kirim "waktu" dari sensor.')
    meta = {"nama": nama, "slug": slug, "kategori": text("kategori"), "warnings": warnings,
            "alert": parse_alert(raw.get("alert")),
            "waktu": parse_time(raw["waktu"]) if raw.get("waktu") is not None else None}
    return data, meta


def parse_alert(value) -> tuple[str, str | None, str | None] | None:
    """The optional "alert": "bahaya" or {"status": "bahaya", "pesan": "Asap terdeteksi", "kategori": "kebakaran"}."""
    if value is None:
        return None
    status, message, category = ((value.get("status"), value.get("pesan"), value.get("kategori"))
                                 if isinstance(value, dict) else (value, None, None))
    status = status.strip().lower() if isinstance(status, str) else None
    if status not in ALERT_STATUSES:
        raise Rejected('"alert" harus "aman" atau "bahaya", atau {"status": "bahaya", "pesan": "..."}')
    message = str(message).strip()[:200] if isinstance(message, (str, int, float)) else ""
    category = category.strip().lower() if isinstance(category, str) else None
    if category in ("", "none", "umum"):
        category = None
    if category is not None and category not in ALERT_CATEGORIES:
        raise Rejected(f'"alert.kategori" harus salah satu dari {", ".join(ALERT_CATEGORIES)}, atau dikosongkan')
    return status, message or None, category


def digest(data: dict) -> str:
    return hashlib.md5(json.dumps(data, sort_keys=True, separators=(",", ":")).encode()).hexdigest()


def assign_stream(cur, device_id: int, keys: list[str], slug: str, nama: str | None) -> tuple[int, str, int, int]:
    """(stream_id, its slug, version_id, version) for a reading named `slug` with these
    (sorted) keys:
    - the table is the one with this slug (or that took it in a merge),
      else a new one, at most MAX_NAMES per device
    - within it, the latest version holding all these keys (a field missing,
      e.g. GPS without a fix, is not an upgrade), else a new version: the
      sensor gained a field.
    The caller holds the device row lock, so two senders can't race."""
    st = cur.execute("SELECT id, slug, keys FROM device_stream WHERE device_id = %s AND (slug = %s OR %s = ANY(aliases))"
                     " ORDER BY slug = %s DESC LIMIT 1", (device_id, slug, slug, slug)).fetchone()
    if not st:
        n = cur.execute("SELECT COUNT(*) AS n FROM device_stream WHERE device_id = %s", (device_id,)).fetchone()["n"]
        if n >= MAX_NAMES:
            raise Rejected(f'maksimal {MAX_NAMES} "nama" per perangkat; pakai nama yang sudah ada'
                           " atau hapus/gabungkan tabel di halaman perangkat")
        st = cur.execute("INSERT INTO device_stream (device_id, keys, slug, name, name_by) VALUES (%s, %s, %s, %s, %s)"
                         " RETURNING id, slug, keys", (device_id, keys, slug, nama, "payload" if nama else None)).fetchone()
    ks = set(keys)
    versions = cur.execute("SELECT id, version, keys FROM stream_version WHERE stream_id = %s ORDER BY version DESC",
                           (st["id"],)).fetchall()
    for v in versions:
        if ks <= set(v["keys"]):
            return st["id"], st["slug"], v["id"], v["version"]
    seen = set().union(*(v["keys"] for v in versions))
    number = (versions[0]["version"] if versions else 0) + 1
    vid = cur.execute("INSERT INTO stream_version (stream_id, version, keys, added) VALUES (%s, %s, %s, %s)"
                      " RETURNING id", (st["id"], number, keys, sorted(ks - seen))).fetchone()["id"]
    # the table's columns: every field any version had
    cur.execute("UPDATE device_stream SET keys = %s WHERE id = %s", (sorted(seen | ks), st["id"]))
    return st["id"], st["slug"], vid, number


def device_for_key(key: str | None) -> dict | None:
    if not key:
        return None
    return query_one("SELECT id, user_id, name, category FROM device"
                     " WHERE key_hash = %s AND revoked_at IS NULL", (hash_key(key),))


def store(device_id: int, data: dict, protocol: str, meta: dict | None = None) -> dict:
    """Save one reading (or count it as a resend). Returns
    {new_fields, stream_id, version, duplicate}."""
    meta = meta or {}
    slug = meta.get("slug") or DEFAULT_NAME
    # same data under another nama is another reading
    h, when = digest({"nama": slug, "data": data}), meta.get("waktu")
    with conn() as c, c.cursor() as cur:
        # the row lock serialises this device's senders (API workers, MQTT bridge)
        cur.execute("SELECT 1 FROM device WHERE id = %s FOR UPDATE", (device_id,))
        dup = cur.execute(
            "SELECT stream_id FROM sensor_reading WHERE device_id = %s AND hash = %s AND "
            + ("measured_at = %s" if when else "received_at > now() - make_interval(secs => %s)")
            + " ORDER BY received_at DESC LIMIT 1", (device_id, h, when or DUP_WINDOW_S)).fetchone()
        if dup:
            cur.execute("UPDATE device SET dup_count = dup_count + 1, last_seen_at = now() WHERE id = %s",
                        (device_id,))
            return {"new_fields": 0, "stream_id": dup["stream_id"], "version": None, "duplicate": True}
        now = time.monotonic()
        if now - _last.get(device_id, -MIN_INTERVAL_S) < MIN_INTERVAL_S:
            raise Rejected(f"terlalu cepat; maksimal 1 kiriman per {MIN_INTERVAL_S:g} detik per perangkat")
        _last[device_id] = now
        # a merged table's old nama leads to it: register fields under its own slug
        sid, slug, vid, version = assign_stream(cur, device_id, sorted(data), slug, meta.get("nama"))
        cur.execute("INSERT INTO sensor_reading (device_id, protocol, data, stream_id, version_id, hash, measured_at)"
                    " VALUES (%s, %s, %s, %s, %s, %s, %s)", (device_id, protocol, Jsonb(data), sid, vid, h, when))
        cur.execute("UPDATE device_stream SET reading_count = reading_count + 1, last_seen_at = now()"
                    " WHERE id = %s", (sid,))
        cur.execute("UPDATE stream_version SET reading_count = reading_count + 1, last_seen = now()"
                    " WHERE id = %s", (vid,))
        new = 0
        for k, v in data.items():
            cur.execute(
                """
                INSERT INTO device_field (device_id, key, type, sample, category) VALUES (%s, %s, %s, %s, %s)
                ON CONFLICT (device_id, key) DO UPDATE
                  SET last_seen = now(), sample = EXCLUDED.sample, type = EXCLUDED.type
                RETURNING (xmax = 0) AS inserted
                """,
                # the nama is the category hint when the field name says nothing
                (device_id, f"{slug}/{k}", type_of(v), Jsonb(v),
                 rule_category(k, meta.get("kategori") or (meta.get("nama") and slug))),
            )
            new += cur.fetchone()["inserted"]
        # a new field (or a field changing type is rare enough to ignore) means
        # the layout no longer covers everything
        cur.execute("UPDATE device SET last_seen_at = now(),"
                    " layout_stale = layout_stale OR %s WHERE id = %s", (new > 0, device_id))
    if new:
        # the AI lays out (and categorises) the new fields now, once, off the request path
        from .layout import plan_in_background
        plan_in_background(device_id)
    return {"new_fields": new, "stream_id": sid, "nama": slug, "version": version, "duplicate": False}


def record_event(device_id: int, kind: str, message: str) -> None:
    """Log line for the test page; a no-op for ordinary devices."""
    execute("INSERT INTO device_event (device_id, kind, message) SELECT id, %s, %s FROM device"
            " WHERE id = %s AND test_expires_at IS NOT NULL", (kind, message[:300], device_id))


def _record_send(device_id: int, res: dict, protocol: str, warnings: list[str]) -> None:
    nama = res.get("nama") or DEFAULT_NAME
    if res["duplicate"]:
        record_event(device_id, "ulang", f'Kiriman ulang ke tabel "{nama}"; tidak disimpan dua kali')
        return
    record_event(device_id, "diterima", f'Data diterima di tabel "{nama}" lewat {protocol.upper()}')
    if res["new_fields"] and res["version"] == 1:
        record_event(device_id, "tabel_baru", f'Nama baru "{nama}": tabel baru dibuat dengan {res["new_fields"]} field')
    elif res["new_fields"]:
        record_event(device_id, "versi_baru", f'{res["new_fields"]} field baru di tabel "{nama}": versi {res["version"]}')
    for warning in warnings:
        record_event(device_id, "peringatan", warning)


def record_alert(device_id: int, slug: str, alert: tuple[str, str | None, str | None]) -> None:
    """Latest alert state for this device and nama; changed_at moves only when the status flips."""
    status, message, category = alert
    execute(
        """
        INSERT INTO device_alert (device_id, slug, status, message, category) VALUES (%s, %s, %s, %s, %s)
        ON CONFLICT (device_id, slug) DO UPDATE
          SET changed_at = CASE WHEN device_alert.status = EXCLUDED.status THEN device_alert.changed_at ELSE now() END,
              status = EXCLUDED.status, message = EXCLUDED.message, category = EXCLUDED.category, updated_at = now()
        """, (device_id, slug, status, message, category))
    if status == "bahaya":
        record_event(device_id, "bahaya", f'Alert bahaya di tabel "{slug}"' + (f": {message}" if message else ""))


def _rejected(device_id: int, reason: str) -> None:
    """Shown to the owner on the device page: why data isn't arriving."""
    execute("UPDATE device SET rejected_count = rejected_count + 1, last_error = %s, last_error_at = now()"
            " WHERE id = %s", (reason[:300], device_id))


def ingest(key: str | None, raw, protocol: str, dry_run: bool = False) -> dict:
    """HTTP path: the key is checked here. Raises Rejected on bad input.
    dry_run: validate key and payload, store nothing (for trying a sensor)."""
    dev = device_for_key(key)
    if not dev:
        raise Rejected("API key perangkat tidak valid atau sudah dicabut")
    if dry_run:
        data, meta = parse_message(raw)
        known = {r["key"] for r in query("SELECT key FROM device_field WHERE device_id = %s", (dev["id"],))}
        # a merged nama files under the table it was merged into, as assign_stream does
        slug = (query_one("SELECT slug FROM device_stream WHERE device_id = %s AND (slug = %s OR %s = ANY(aliases))"
                          " ORDER BY slug = %s DESC LIMIT 1", (dev["id"], meta["slug"], meta["slug"], meta["slug"]))
                or {"slug": meta["slug"]})["slug"]
        return {"device_id": dev["id"], "fields": len(data), "nama": slug,
                "new_fields": len({f"{slug}/{k}" for k in data} - known),
                "dry_run": True, "keys": list(data), "warnings": meta["warnings"],
                "alert": meta["alert"] and meta["alert"][0]}
    return ingest_device(dev["id"], raw, protocol)


def ingest_device(device_id: int, raw, protocol: str) -> dict:
    """For a device already authenticated elsewhere (the MQTT broker)."""
    if not query_one("SELECT 1 FROM device WHERE id = %s AND revoked_at IS NULL", (device_id,)):
        raise Rejected("perangkat tidak ada atau dicabut")
    try:
        data, meta = parse_message(raw)
        res = store(device_id, data, protocol, meta)
    except Rejected as exc:
        _rejected(device_id, str(exc))
        record_event(device_id, "ditolak", str(exc))
        raise
    _record_send(device_id, res, protocol, meta["warnings"])
    if meta["alert"]:
        # a duplicate carries no nama of its own; its alert still counts as a fresh report
        record_alert(device_id, res.get("nama") or meta["slug"], meta["alert"])
    if meta["warnings"]:
        execute("UPDATE device SET warning_count = warning_count + 1, last_warning = %s, last_warning_at = now()"
                " WHERE id = %s", (" ".join(meta["warnings"])[:300], device_id))
    return {"device_id": device_id, "fields": len(data), "nama": meta["slug"], "warnings": meta["warnings"],
            "alert": meta["alert"] and meta["alert"][0], **res}  # res: the table's slug
