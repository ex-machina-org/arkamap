"""Accounts and profiles."""
import time
from collections import defaultdict, deque

from typing import Literal

from fastapi import APIRouter, Depends, HTTPException, Request
from psycopg import errors
from psycopg.types.json import Jsonb
from pydantic import BaseModel, Field

from ..auth import current_user, hash_password, make_token, verify_password
from ..config import ADMIN_EMAILS
from .. import fields, modes
from ..db import conn, execute, query, query_one
from ..iot import relevance
from .schemas import AuthOut, ErrorResponse, MeOut

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
