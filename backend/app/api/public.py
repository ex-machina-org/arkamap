"""Public catalogues: no login needed."""
from fastapi import APIRouter

from .. import fields, modes
from .schemas import FieldInfo, ModeInfo

router = APIRouter()


@router.get("/fields", response_model=list[FieldInfo])
def list_fields() -> list[dict]:
    """Fields a user can pick after login; also shown on the public page."""
    return fields.catalogue()


@router.get("/modes", response_model=list[ModeInfo])
def list_modes() -> list[dict]:
    """Profile modes (protected / responden / plan) for the profile screen."""
    return modes.catalogue()
