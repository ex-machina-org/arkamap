"""Accounts, profiles and IoT devices."""
import logging
import time
from collections import defaultdict, deque

from typing import Literal

from fastapi import APIRouter, Depends, HTTPException, Request
from psycopg import errors
from psycopg.types.json import Jsonb
from pydantic import BaseModel, Field

from ..auth import current_user, hash_password, make_token, new_device_key, verify_password
from ..config import ADMIN_EMAILS, IDN_BBOX
from .. import fields, modes
from ..db import conn, execute, query, query_one
from ..iot import broker
from ..iot import layout as iot_layout
from ..iot import quickstart
from ..iot.categories import Category, majority
from ..iot import relevance
from .schemas import AuthOut, DeviceCreated, DeviceOut, ErrorResponse, KeyRotated, MeOut, Quickstart, WidgetSpec

log = logging.getLogger(__name__)
router = APIRouter()

# ── request bodies ──────────────────────────────────────────────────────


class Signup(BaseModel):
    email: str = Field(pattern=r"^[^@\s]+@[^@\s]+\.[^@\s]+$", max_length=254)
    password: str = Field(min_length=8, max_length=128)
    name: str = Field(min_length=1, max_length=100)


class Login(BaseModel):
    email: str = Field(max_length=254)
    password: str = Field(max_length=128)


class ProfileIn(BaseModel):
    """The user's own words; no fixed list. The AI maps it to a view."""
    role: str = Field(min_length=2, max_length=200,
                      description="siapa Anda / pekerjaan, mis. 'anggota damkar Kota Palangka Raya'")
    goals: str | None = Field(None, max_length=500,
                              description="apa yang ingin dipantau, mis. 'titik api dan arah angin'")
    region_id: str | None = Field(None, description="wilayah minat; dari GET /api/regions")
    mode: Literal["protected", "responden", "plan"] | None = Field(
        None, description="kosong = AI memilih dari penjelasan; lihat GET /api/modes")


class Location(BaseModel):
    """From the browser's geolocation ("lokasi saat ini") or a map pick; the
    backend doesn't care which, it only stores the point."""
    lat: float = Field(ge=-90, le=90)
    lon: float = Field(ge=-180, le=180)


class DeviceIn(BaseModel):
    """Everything optional: one click gives a key. Categories are decided
    per field from the data itself."""
    name: str | None = Field(None, min_length=1, max_length=100, description="kosong = 'Perangkat N'")
    category: str | None = Field(None, min_length=1, max_length=50, description="petunjuk opsional untuk AI")
    location: Location | None = None


class DeviceUpdate(BaseModel):
    name: str | None = Field(None, min_length=1, max_length=100)
    category: str | None = Field(None, min_length=1, max_length=50)
    location: Location | None = None


class ShareIn(BaseModel):
    share: bool = Field(description="true = ajukan ke komunitas (ditinjau admin); false = privat")


class WidgetEdit(BaseModel):
    field: str
    label: str | None = Field(None, max_length=100)
    unit: str | None = Field(None, max_length=30)
    widget: iot_layout.Widget | None = None
    group: str | None = Field(None, max_length=50)
    hidden: bool | None = None
    category: Category | None = Field(None, description="kategori tetap; pilihan user tidak ditimpa AI")


class PasswordChange(BaseModel):
    old_password: str = Field(max_length=128)
    new_password: str = Field(min_length=8, max_length=128)


# ── helpers ─────────────────────────────────────────────────────────────

_login_hits: dict[str, deque] = defaultdict(deque)  # ponytail: in-process; Redis if multi-worker


def client_ip(request: Request) -> str:
    """Real client IP. Behind the edge Caddy it arrives as X-Real-IP (set
    only from Cloudflare's CF-Connecting-IP); the API port is bound to
    127.0.0.1, so no one else can send that header."""
    return request.headers.get("x-real-ip") or (request.client.host if request.client else "?")


def _login_limit(ip: str) -> None:
    """10 attempts per 5 minutes per client IP: slows password guessing."""
    now, q = time.monotonic(), _login_hits[ip]
    while q and now - q[0] > 300:
        q.popleft()
    if len(q) >= 10:
        raise HTTPException(429, "terlalu banyak percobaan masuk; coba lagi 5 menit lagi")
    q.append(now)


def _point_region(loc: Location) -> str:
    """kabkota under the point (nearest within ~5 km for coastal points)."""
    w, s, e, n = IDN_BBOX
    row = None
    if w <= loc.lon <= e and s <= loc.lat <= n:
        row = query_one(
            """
            SELECT id FROM region
            WHERE level = 'kabkota' AND population IS NOT NULL
              AND ST_DWithin(geom, ST_SetSRID(ST_MakePoint(%(lon)s, %(lat)s), 4326), 0.05)
            ORDER BY geom <-> ST_SetSRID(ST_MakePoint(%(lon)s, %(lat)s), 4326) LIMIT 1
            """, {"lon": loc.lon, "lat": loc.lat})
    if not row:
        raise HTTPException(400, "lokasi di luar Indonesia")
    return row["id"]


_DEVICE_COLS = """d.id, d.name, d.category, d.key_prefix,
    'dev' || d.id AS mqtt_username, 'ingest/dev' || d.id AS mqtt_topic, d.region_id, r.name AS region_name,
    ST_Y(d.geom) AS lat, ST_X(d.geom) AS lon, d.visibility, d.community_status,
    d.community_note, d.layout, d.layout_by, d.layout_stale, d.last_seen_at, d.created_at,
    d.dup_count, d.rejected_count, d.last_error, d.last_error_at,
    d.warning_count, d.last_warning, d.last_warning_at, d.test_expires_at"""


def _own_device(user: dict, device_id: int) -> dict:
    d = query_one(f"SELECT {_DEVICE_COLS}, d.user_id FROM device d"
                  " LEFT JOIN region r ON r.id = d.region_id"
                  " WHERE d.id = %s AND d.user_id = %s", (device_id, user["id"]))
    if not d:
        raise HTTPException(404, "perangkat tidak ditemukan")
    return d


def _public(d: dict) -> dict:
    return {k: v for k, v in d.items() if k not in ("user_id", "layout_stale")}


# ── auth ────────────────────────────────────────────────────────────────


@router.post("/auth/signup", status_code=201, response_model=AuthOut, responses={409: {"model": ErrorResponse}, 429: {"model": ErrorResponse}})
def signup(body: Signup, request: Request) -> dict:
    _login_limit(client_ip(request))
    email = body.email.lower()
    try:
        u = query_one("INSERT INTO app_user (email, password_hash, name, is_admin)"
                      " VALUES (%s, %s, %s, %s) RETURNING id, email, name, is_admin",
                      (email, hash_password(body.password), body.name, email in ADMIN_EMAILS))
    except errors.UniqueViolation:
        raise HTTPException(409, "email sudah terdaftar") from None
    return {"token": make_token(u["id"]), "user": u}


@router.post("/auth/login", response_model=AuthOut, responses={401: {"model": ErrorResponse}, 429: {"model": ErrorResponse}})
def login(body: Login, request: Request) -> dict:
    _login_limit(client_ip(request))
    u = query_one("SELECT id, email, name, is_admin, password_hash, token_version FROM app_user"
                  " WHERE email = %s", (body.email.lower(),))
    # same message either way: don't reveal which emails exist
    if not u or not verify_password(body.password, u.pop("password_hash")):
        raise HTTPException(401, "email atau password salah")
    return {"token": make_token(u["id"], u.pop("token_version")), "user": u}


def _set_password(user_id: int, new: str) -> int:
    """Store a new password and bump token_version, which logs out every
    session issued before. Returns the new version."""
    return query_one("UPDATE app_user SET password_hash = %s, token_version = token_version + 1"
                     " WHERE id = %s RETURNING token_version",
                     (hash_password(new), user_id))["token_version"]


@router.post("/me/password", response_model=AuthOut,
             responses={400: {"model": ErrorResponse}, 401: {"model": ErrorResponse}})
def change_password(body: PasswordChange, request: Request, user: dict = Depends(current_user)) -> dict:
    """Change your own password. Every other session is logged out; the
    token in this response is the new one to keep using."""
    _login_limit(client_ip(request))   # guessing the old password counts as a login attempt
    row = query_one("SELECT password_hash FROM app_user WHERE id = %s", (user["id"],))
    if not verify_password(body.old_password, row["password_hash"]):
        raise HTTPException(400, "password lama salah")
    if body.new_password == body.old_password:
        raise HTTPException(400, "password baru harus berbeda")
    return {"token": make_token(user["id"], _set_password(user["id"], body.new_password)), "user": user}


MAX_PROFILES = 3
_PROFILE_COLS = """p.id, p.mode, p.mode_by, p.role, p.goals, p.region_id, r.name AS region_name, p.metrics,
    p.metrics_by, p.field, p.fit, p.unsupported, p.ai_message, p.created_at, p.updated_at"""


def _profiles(user_id: int) -> list[dict]:
    active = query_one("SELECT active_profile_id FROM app_user WHERE id = %s", (user_id,))["active_profile_id"]
    rows = query(f"SELECT {_PROFILE_COLS} FROM profile p LEFT JOIN region r ON r.id = p.region_id"
                 " WHERE p.user_id = %s ORDER BY p.id", (user_id,))
    for p in rows:
        p.update(field_label=fields.get(p["field"])["label"], mode_label=modes.get(p["mode"])["label"],
                 mode_title=modes.get(p["mode"])["title"], active=p["id"] == active)
    return rows


def _active_profile(user_id: int) -> dict | None:
    return next((p for p in _profiles(user_id) if p["active"]), None)


@router.get("/me", response_model=MeOut, responses={401: {"model": ErrorResponse}})
def me(user: dict = Depends(current_user)) -> dict:
    ps = _profiles(user["id"])
    return {"user": user, "profile": next((p for p in ps if p["active"]), None), "profiles": ps,
            "max_profiles": MAX_PROFILES}


def _read(body: ProfileIn) -> dict:
    """The AI reading, done before any lock (it can take seconds)."""
    if body.region_id and not query_one("SELECT 1 FROM region WHERE id = %s", (body.region_id,)):
        raise HTTPException(400, "region_id tidak dikenal")
    return relevance.read_profile(body.role, body.goals, body.mode)


def _values(body: ProfileIn, r: dict) -> tuple:
    return (r["mode"], r["mode_by"], body.role, body.goals, body.region_id, Jsonb(r["metrics"]), r["by"],
            r["field"], r["fit"], Jsonb(r["unsupported"]), r["message"])


def _create_profile(user_id: int, body: ProfileIn) -> int:
    r = _read(body)
    with conn() as c, c.cursor() as cur:
        cur.execute("SELECT 1 FROM app_user WHERE id = %s FOR UPDATE", (user_id,))   # no race past the limit
        if cur.execute("SELECT COUNT(*) AS n FROM profile WHERE user_id = %s", (user_id,)).fetchone()["n"] \
                >= MAX_PROFILES:
            raise HTTPException(409, f"maksimal {MAX_PROFILES} profil; hapus satu dulu")
        pid = cur.execute(
            "INSERT INTO profile (user_id, mode, mode_by, role, goals, region_id, metrics, metrics_by,"
            " field, fit, unsupported, ai_message) VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s)"
            " RETURNING id", (user_id, *_values(body, r))).fetchone()["id"]
        cur.execute("UPDATE app_user SET active_profile_id = %s WHERE id = %s", (pid, user_id))
    return pid


def _update_profile(pid: int, body: ProfileIn) -> None:
    r = _read(body)
    execute("UPDATE profile SET mode = %s, mode_by = %s, role = %s, goals = %s, region_id = %s, metrics = %s,"
            " metrics_by = %s, field = %s, fit = %s, unsupported = %s, ai_message = %s, updated_at = now()"
            " WHERE id = %s", (*_values(body, r), pid))


def _own_profile(user: dict, pid: int) -> None:
    if not query_one("SELECT 1 FROM profile WHERE id = %s AND user_id = %s", (pid, user["id"])):
        raise HTTPException(404, "profil tidak ditemukan")


@router.put("/me/profile", response_model=MeOut, responses={401: {"model": ErrorResponse}})
def set_profile(body: ProfileIn, user: dict = Depends(current_user)) -> dict:
    """Describe yourself for the ACTIVE profile (creates the first one).
    Re-reads it: mode, closest view, metrics, and an honest note on what
    we can't cover (AI, keyword fallback)."""
    active = _active_profile(user["id"])
    if active:
        _update_profile(active["id"], body)
    else:
        _create_profile(user["id"], body)
    return me(user)


@router.get("/me/profiles", response_model=MeOut, responses={401: {"model": ErrorResponse}})
def list_profiles(user: dict = Depends(current_user)) -> dict:
    return me(user)


@router.post("/me/profiles", status_code=201, response_model=MeOut,
             responses={401: {"model": ErrorResponse}, 409: {"model": ErrorResponse}})
def create_profile(body: ProfileIn, user: dict = Depends(current_user)) -> dict:
    """A new profile (max 3; same or different modes) from a fresh
    self-description. Becomes the active one."""
    _create_profile(user["id"], body)
    return me(user)


@router.put("/me/profiles/{profile_id}", response_model=MeOut, responses={401: {"model": ErrorResponse}})
def update_profile(profile_id: int, body: ProfileIn, user: dict = Depends(current_user)) -> dict:
    """Describe yourself again for this profile (the AI reads it again)."""
    _own_profile(user, profile_id)
    _update_profile(profile_id, body)
    return me(user)


@router.post("/me/profiles/{profile_id}/activate", response_model=MeOut, responses={401: {"model": ErrorResponse}})
def activate_profile(profile_id: int, user: dict = Depends(current_user)) -> dict:
    """Switch profile. Uses what was stored for it; no questions, no AI call."""
    _own_profile(user, profile_id)
    execute("UPDATE app_user SET active_profile_id = %s WHERE id = %s", (profile_id, user["id"]))
    return me(user)


@router.delete("/me/profiles/{profile_id}", response_model=MeOut, responses={401: {"model": ErrorResponse}})
def delete_profile(profile_id: int, user: dict = Depends(current_user)) -> dict:
    """Frees a slot. If it was active, the oldest remaining one becomes active."""
    _own_profile(user, profile_id)
    execute("DELETE FROM profile WHERE id = %s", (profile_id,))
    execute("UPDATE app_user SET active_profile_id = (SELECT MIN(id) FROM profile WHERE user_id = %s)"
            " WHERE id = %s AND active_profile_id IS NULL", (user["id"], user["id"]))
    return me(user)


# ── devices ─────────────────────────────────────────────────────────────


@router.post("/me/devices", status_code=201, response_model=DeviceCreated, responses={401: {"model": ErrorResponse}})
def create_device(body: DeviceIn, user: dict = Depends(current_user)) -> dict:
    """Returns the API key ONCE. Store it on the sensor; we keep only a hash."""
    key, key_hash, prefix = new_device_key()
    region = _point_region(body.location) if body.location else None
    name = body.name or "Perangkat %d" % (query_one(
        "SELECT COUNT(*) AS n FROM device WHERE user_id = %s AND test_expires_at IS NULL", (user["id"],))["n"] + 1)
    d = query_one(
        """
        INSERT INTO device (user_id, name, category, key_hash, key_prefix, geom, region_id)
        VALUES (%s, %s, %s, %s, %s,
                CASE WHEN %s::float8 IS NULL THEN NULL
                     ELSE ST_SetSRID(ST_MakePoint(%s, %s), 4326) END, %s)
        RETURNING id
        """,
        (user["id"], name, body.category, key_hash, prefix,
         body.location and body.location.lon, body.location and body.location.lon,
         body.location and body.location.lat, region))
    try:
        broker.add_device(d["id"], key)
    except broker.BrokerError as exc:
        # no half-made device: without broker credentials MQTT would never work
        execute("DELETE FROM device WHERE id = %s", (d["id"],))
        log.warning("buat kredensial MQTT gagal: %s", exc)
        raise HTTPException(503, "broker MQTT sedang tidak tersedia; coba lagi") from None
    dev = _own_device(user, d["id"])
    return {"device": _public(dev), "api_key": key, "quickstart": quickstart.build(dev, key)}


@router.get("/me/devices", response_model=list[DeviceOut], responses={401: {"model": ErrorResponse}})
def list_devices(user: dict = Depends(current_user)) -> list[dict]:
    return [_public(d) for d in query(
        f"SELECT {_DEVICE_COLS} FROM device d LEFT JOIN region r ON r.id = d.region_id"
        " WHERE d.user_id = %s AND d.test_expires_at IS NULL ORDER BY d.created_at", (user["id"],))]


@router.patch("/me/devices/{device_id}", response_model=DeviceOut, responses={401: {"model": ErrorResponse}})
def update_device(device_id: int, body: DeviceUpdate, user: dict = Depends(current_user)) -> dict:
    _own_device(user, device_id)
    if body.name or body.category:
        execute("UPDATE device SET name = COALESCE(%s, name), category = COALESCE(%s, category)"
                " WHERE id = %s", (body.name, body.category, device_id))
    if body.location:
        execute("UPDATE device SET geom = ST_SetSRID(ST_MakePoint(%s, %s), 4326), region_id = %s"
                " WHERE id = %s", (body.location.lon, body.location.lat,
                                   _point_region(body.location), device_id))
    return _public(_own_device(user, device_id))


@router.delete("/me/devices/{device_id}", status_code=204)
def delete_device(device_id: int, user: dict = Depends(current_user)) -> None:
    """Deletes the device and all its readings."""
    _own_device(user, device_id)
    try:
        _remove_device(device_id)
    except broker.BrokerError as exc:
        log.warning("hapus kredensial MQTT gagal: %s", exc)
        raise HTTPException(503, "broker MQTT sedang tidak tersedia; coba lagi") from None


def _remove_device(device_id: int) -> None:
    broker.remove_device(device_id)   # broker first: never leave a login for a deleted device
    execute("DELETE FROM device WHERE id = %s", (device_id,))


@router.post("/me/devices/{device_id}/key", response_model=KeyRotated, responses={401: {"model": ErrorResponse}})
def rotate_key(device_id: int, user: dict = Depends(current_user)) -> dict:
    """New key; the old one stops working immediately."""
    dev = _own_device(user, device_id)
    key, key_hash, prefix = new_device_key()
    try:
        broker.set_key(device_id, key)   # broker first: never leave MQTT on the old key
    except broker.BrokerError as exc:
        log.warning("ganti kredensial MQTT gagal: %s", exc)
        raise HTTPException(503, "broker MQTT sedang tidak tersedia; coba lagi") from None
    execute("UPDATE device SET key_hash = %s, key_prefix = %s WHERE id = %s",
            (key_hash, prefix, device_id))
    return {"api_key": key, "key_prefix": prefix, "quickstart": quickstart.build(dev, key)}


@router.get("/me/devices/{device_id}/quickstart", response_model=Quickstart, responses={401: {"model": ErrorResponse}})
def device_quickstart(device_id: int, user: dict = Depends(current_user)) -> dict:
    """Examples with <API_KEY> in place of the key (we only keep its hash)."""
    return quickstart.build(_own_device(user, device_id))


@router.put("/me/devices/{device_id}/layout", response_model=list[WidgetSpec], responses={401: {"model": ErrorResponse}})
def edit_layout(device_id: int, edits: list[WidgetEdit], user: dict = Depends(current_user)) -> list[dict]:
    """User corrections to the AI layout. Kept when new fields are added later."""
    d = _own_device(user, device_id)
    layout = d["layout"] or []
    by_field = {w["field"]: w for w in layout}
    for e in edits:
        if e.field not in by_field:
            raise HTTPException(400, f"field '{e.field}' tidak ada di layout")
        by_field[e.field].update(e.model_dump(exclude_none=True, exclude={"field"}), by="user")
        if e.category:
            execute("UPDATE device_field SET category = %s, category_by = 'user' WHERE device_id = %s AND key = %s",
                    (e.category, device_id, e.field))
    execute("UPDATE device SET layout = %s, layout_by = 'user' WHERE id = %s", (Jsonb(layout), device_id))
    return _with_categories(device_id, layout)


def _with_categories(device_id: int, layout: list[dict]) -> list[dict]:
    """The widget's category comes from device_field (the one place ML reads);
    its group is the data table ("nama") the field belongs to."""
    cats = {r["key"]: r for r in query("SELECT key, category, category_by FROM device_field WHERE device_id = %s",
                                       (device_id,))}
    names = {st["slug"]: st["name"] for st in _streams(device_id)}
    return [{**w, "category": cats.get(w["field"], {}).get("category", w.get("category", "lainnya")),
             "category_by": cats.get(w["field"], {}).get("category_by"),
             "group": names.get(w["field"].rpartition("/")[0], w.get("group"))} for w in layout]


@router.post("/me/devices/{device_id}/share", response_model=DeviceOut, responses={401: {"model": ErrorResponse}})
def share_device(device_id: int, body: ShareIn, user: dict = Depends(current_user)) -> dict:
    d = _own_device(user, device_id)
    if body.share and d["test_expires_at"]:
        raise HTTPException(400, "alat uji tidak bisa dibagikan ke komunitas")
    if body.share and d["lat"] is None:
        raise HTTPException(400, "set lokasi perangkat dulu sebelum berbagi ke komunitas")
    execute("UPDATE device SET visibility = %s, community_status = %s, community_note = NULL"
            " WHERE id = %s", ("community" if body.share else "private",
                               "pending" if body.share else "none", device_id))
    return _public(_own_device(user, device_id))


def _streams(device_id: int) -> list[dict]:
    fields = {r["key"]: r for r in query(
        "SELECT key, type, category, category_by, first_seen, last_seen FROM device_field WHERE device_id = %s",
        (device_id,))}
    labels = {w["field"]: w.get("label") for w in (query_one(
        "SELECT layout FROM device WHERE id = %s", (device_id,))["layout"] or [])}
    versions: dict[int, list[dict]] = {}
    for v in query("SELECT v.id, v.stream_id, v.version, v.keys, v.added, v.reading_count, v.first_seen, v.last_seen"
                   " FROM stream_version v JOIN device_stream s ON s.id = v.stream_id"
                   " WHERE s.device_id = %s ORDER BY v.version", (device_id,)):
        versions.setdefault(v.pop("stream_id"), []).append(v)
    out = []
    for st in query("SELECT * FROM device_stream WHERE device_id = %s ORDER BY id", (device_id,)):
        # fields are registered per table: "<slug>/<key>"; the column is the bare key
        fs = [{"key": k, "label": labels.get(f"{st['slug']}/{k}") or k, **{c: fields[f"{st['slug']}/{k}"][c] for c in
               ("type", "category", "category_by", "first_seen", "last_seen")}}
              for k in st["keys"] if f"{st['slug']}/{k}" in fields]
        cat = st["category"] or majority([f["category"] for f in fs])
        out.append({"id": st["id"], "slug": st["slug"], "aliases": st["aliases"],
                    "versions": versions.get(st["id"], []), "name": st["name"] or "Tanpa Nama",   # the "default" table: readings sent without "nama"
                    "name_by": st["name_by"] or "auto", "category": cat,
                    "category_by": "user" if st["category"] else "fields",
                    "confirmed": all(f["category_by"] != "rule" for f in fs),
                    "fields": fs, "reading_count": st["reading_count"],
                    "created_at": st["created_at"], "last_seen_at": st["last_seen_at"]})
    return out
