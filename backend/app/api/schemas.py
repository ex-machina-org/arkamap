"""Response shapes. Kept explicit so the frontend can rely on them."""
from datetime import datetime

from pydantic import BaseModel


class SourceInfo(BaseModel):
    id: str
    aspect: str
    title: str
    publisher: str
    url: str
    license: str
    cadence: str
    is_modelled: bool
    notes: str | None = None
    last_run_at: datetime | None = None
    last_ok_at: datetime | None = None
    last_error: str | None = None


class HealthReport(BaseModel):
    status: str
    database: str
    regions: int
    indicators: int
    observations: int
    sources: list[SourceInfo] = []


class ErrorResponse(BaseModel):
    detail: str
