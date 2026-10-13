"""Accounts and profiles."""
import time
from collections import defaultdict, deque

from fastapi import APIRouter, HTTPException, Request
from psycopg import errors
from pydantic import BaseModel, Field

from ..auth import hash_password, make_token, verify_password
from ..config import ADMIN_EMAILS
from ..db import query_one
from .schemas import AuthOut, ErrorResponse

router = APIRouter()

# ── request bodies ──────────────────────────────────────────────────────


class Signup(BaseModel):
    email: str = Field(pattern=r"^[^@\s]+@[^@\s]+\.[^@\s]+$", max_length=254)
    password: str = Field(min_length=8, max_length=128)
    name: str = Field(min_length=1, max_length=100)


class Login(BaseModel):
    email: str = Field(max_length=254)
    password: str = Field(max_length=128)


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
