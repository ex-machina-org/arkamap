"""Passwords, JWT sessions and device API keys."""
import hashlib
import hmac
import secrets
from datetime import datetime, timedelta, timezone

import jwt
from fastapi import Depends, HTTPException
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer

from .config import JWT_DAYS, JWT_SECRET
from .db import query_one

# scrypt cost: ~50 ms per hash, 16 MB memory. Slow on purpose.
_N, _R, _P = 2**14, 8, 1


def hash_password(pw: str) -> str:
    salt = secrets.token_bytes(16)
    h = hashlib.scrypt(pw.encode(), salt=salt, n=_N, r=_R, p=_P)
    return f"scrypt${_N}${_R}${_P}${salt.hex()}${h.hex()}"


def verify_password(pw: str, stored: str) -> bool:
    try:
        _, n, r, p, salt, h = stored.split("$")
        got = hashlib.scrypt(pw.encode(), salt=bytes.fromhex(salt), n=int(n), r=int(r), p=int(p))
    except ValueError:
        return False
    return hmac.compare_digest(got.hex(), h)


def make_token(user_id: int, version: int = 0) -> str:
    """`ver` = the user's token_version; a password change bumps it and
    every token issued before stops working."""
    now = datetime.now(timezone.utc)
    return jwt.encode({"sub": str(user_id), "ver": version, "iat": now,
                       "exp": now + timedelta(days=JWT_DAYS)}, JWT_SECRET, algorithm="HS256")


def temp_password() -> str:
    """For admin resets: 16 url-safe chars, shown once, meant to be changed."""
    return secrets.token_urlsafe(12)


def new_device_key() -> tuple[str, str, str]:
    """(key shown once to the user, sha256 stored, short prefix for display).
    256 bits of randomness, so a plain sha256 is enough; no need for scrypt."""
    key = "dev_" + secrets.token_urlsafe(32)
    return key, hash_key(key), key[:10]


def hash_key(key: str) -> str:
    return hashlib.sha256(key.encode()).hexdigest()


_bearer = HTTPBearer(auto_error=False)


def current_user(cred: HTTPAuthorizationCredentials | None = Depends(_bearer)) -> dict:
    if cred is None:
        raise HTTPException(401, "butuh header Authorization: Bearer <token>")
    try:
        claims = jwt.decode(cred.credentials, JWT_SECRET, algorithms=["HS256"])
        uid, ver = int(claims["sub"]), int(claims.get("ver", 0))
    except (jwt.PyJWTError, KeyError, ValueError):
        raise HTTPException(401, "token tidak valid atau kedaluwarsa") from None
    user = query_one("SELECT id, email, name, is_admin, token_version FROM app_user WHERE id = %s",
                     (uid,))
    if not user:
        raise HTTPException(401, "akun tidak ditemukan")
    if ver != user.pop("token_version"):
        raise HTTPException(401, "sesi berakhir karena password diganti; silakan masuk lagi")
    return user


def optional_user(cred: HTTPAuthorizationCredentials | None = Depends(_bearer)) -> dict | None:
    """The signed-in user, or None for a guest (no token): public endpoints that
    personalise (the Agent) stay open. A dead token is a 401, not a guest: the
    frontend still shows the user as signed in, and only a 401 tells it the
    session ended (silently answering as a guest said "masuk dulu" to them)."""
    return current_user(cred) if cred is not None else None


def admin_user(user: dict = Depends(current_user)) -> dict:
    if not user["is_admin"]:
        raise HTTPException(403, "khusus admin")
    return user
