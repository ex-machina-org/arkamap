"""App keys: the backend issues them to API consumers (frontend, partners)
and checks one on every /api/* request.

    docker compose exec api python -m app.clients create "frontend web"

creates the first key before any admin account exists.
"""
import secrets
import sys
import time

from fastapi import HTTPException, Request, Security
from fastapi.security import APIKeyHeader

from .auth import hash_key
from .config import API_KEYS, REQUIRE_API_KEY
from .db import execute, query_one

# Own checks: health is for monitors; ingest takes a device key instead.
EXEMPT = {"/api/health", "/api/ingest"}
CACHE_S = 60          # a revoked key keeps working at most this long
TOUCH_S = 300         # last_used_at is written at most this often per key
_cache: dict[str, tuple[float, int | None]] = {}   # ponytail: per-process cache
_touched: dict[int, float] = {}

_header = APIKeyHeader(name="X-API-Key", auto_error=False,
                       description="Kunci aplikasi dari backend (bukan API key perangkat)")


def new_key() -> tuple[str, str, str]:
    """(key shown once, sha256 stored, prefix). 256 random bits, like
    `openssl rand -hex 32`."""
    key = "app_" + secrets.token_hex(32)
    return key, hash_key(key), key[:12]


def client_for(key: str | None) -> int | None | bool:
    """Client id for an issued key, None for an env bootstrap key, False if invalid."""
    if not key:
        return False
    if key in API_KEYS:
        return None
    h, now = hash_key(key), time.monotonic()
    hit = _cache.get(h)
    if hit and now - hit[0] < CACHE_S:
        return hit[1] if hit[1] is not None else False
    row = query_one("SELECT id FROM api_client WHERE key_hash = %s AND revoked_at IS NULL", (h,))
    _cache[h] = (now, row["id"] if row else None)
    if not row:
        return False
    if now - _touched.get(row["id"], -TOUCH_S) >= TOUCH_S:
        _touched[row["id"]] = now
        execute("UPDATE api_client SET last_used_at = now() WHERE id = %s", (row["id"],))
    return row["id"]


def require_app_key(request: Request, key: str | None = Security(_header)) -> None:
    """App-wide dependency. No-op unless REQUIRE_API_KEY is on."""
    if not REQUIRE_API_KEY or request.url.path in EXEMPT or not request.url.path.startswith("/api/"):
        return
    if client_for(key) is False:
        raise HTTPException(401, "X-API-Key tidak valid, dicabut, atau tidak dikirim")


def forget(key_hash: str) -> None:
    """Drop a key from this process's cache (after revoke/rotate)."""
    _cache.pop(key_hash, None)


def _cli() -> None:
    from .db import init_pool
    if len(sys.argv) < 3 or sys.argv[1] != "create":
        sys.exit('pakai: python -m app.clients create "nama klien" [catatan]')
    init_pool()
    key, h, prefix = new_key()
    execute("INSERT INTO api_client (name, note, key_hash, key_prefix) VALUES (%s, %s, %s, %s)",
            (sys.argv[2], sys.argv[3] if len(sys.argv) > 3 else None, h, prefix))
    print(f"kunci untuk '{sys.argv[2]}' (hanya ditampilkan sekali):\n{key}")


if __name__ == "__main__":
    _cli()
