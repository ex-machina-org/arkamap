"""Admin: issue, list, rotate and revoke app keys for API consumers."""
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field

from .. import clients
from ..auth import admin_user
from ..db import execute, query, query_one
from .schemas import ClientCreated, ClientOut, ErrorResponse

router = APIRouter(responses={401: {"model": ErrorResponse}, 403: {"model": ErrorResponse}})

_COLS = "id, name, note, key_prefix, created_at, last_used_at, revoked_at"


class ClientIn(BaseModel):
    name: str = Field(min_length=1, max_length=100, description="mis. 'frontend web', 'mitra BPBD'")
    note: str | None = Field(None, max_length=500)


def _get(client_id: int) -> dict:
    row = query_one(f"SELECT {_COLS}, key_hash FROM api_client WHERE id = %s", (client_id,))
    if not row:
        raise HTTPException(404, "klien tidak ditemukan")
    return row


@router.post("/clients", status_code=201, response_model=ClientCreated)
def create_client(body: ClientIn, admin: dict = Depends(admin_user)) -> dict:
    """The key is returned ONCE; hand it to the frontend/partner team."""
    key, h, prefix = clients.new_key()
    row = query_one(f"INSERT INTO api_client (name, note, key_hash, key_prefix, created_by)"
                    f" VALUES (%s, %s, %s, %s, %s) RETURNING {_COLS}",
                    (body.name, body.note, h, prefix, admin["id"]))
    return {"client": row, "api_key": key}


@router.get("/clients", response_model=list[ClientOut])
def list_clients(_: dict = Depends(admin_user)) -> list[dict]:
    return query(f"SELECT {_COLS} FROM api_client ORDER BY created_at")


@router.post("/clients/{client_id}/rotate", response_model=ClientCreated)
def rotate_client(client_id: int, _: dict = Depends(admin_user)) -> dict:
    """New key; the old one stops working within a minute (cache)."""
    old = _get(client_id)
    key, h, prefix = clients.new_key()
    execute("UPDATE api_client SET key_hash = %s, key_prefix = %s, revoked_at = NULL WHERE id = %s",
            (h, prefix, client_id))
    clients.forget(old["key_hash"])
    return {"client": {k: v for k, v in _get(client_id).items() if k != "key_hash"}, "api_key": key}


@router.post("/clients/{client_id}/revoke", response_model=ClientOut)
def revoke_client(client_id: int, _: dict = Depends(admin_user)) -> dict:
    old = _get(client_id)
    execute("UPDATE api_client SET revoked_at = now() WHERE id = %s AND revoked_at IS NULL", (client_id,))
    clients.forget(old["key_hash"])
    return {k: v for k, v in _get(client_id).items() if k != "key_hash"}
