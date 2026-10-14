"""Response shapes. Kept explicit so the frontend can rely on them."""
from datetime import datetime
from typing import Any, Literal

from pydantic import BaseModel, Field


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


# ── accounts ─────────────────────────────────────────────────────────────
class UserOut(BaseModel):
    id: int
    email: str
    name: str
    is_admin: bool


class AuthOut(BaseModel):
    token: str = Field(description="JWT; kirim sebagai header Authorization: Bearer <token>")
    user: UserOut


class MetricPick(BaseModel):
    metric: str
    reason: str


ModeId = Literal["protected", "responden", "plan"]


class ModeInfo(BaseModel):
    id: ModeId
    label: str
    title: str
    description: str
    panels: list[Literal["impact", "alerts", "events", "ranking", "history"]] = Field(
        description="urutan panel dashboard untuk mode ini")


class ProfileOut(BaseModel):
    id: int
    active: bool = Field(description="profil yang sedang dipakai dashboard")
    mode: ModeId
    mode_label: str
    mode_title: str
    mode_by: Literal["user", "ai", "rule"] = Field(description="user = dipilih sendiri; ai/rule = ditebak dari penjelasan")
    role: str
    goals: str | None = None
    region_id: str | None = None
    region_name: str | None = None
    metrics: list[MetricPick] = Field(description="metrik kita yang relevan, dipilih AI dari profil")
    metrics_by: Literal["ai", "rule"] | None = None
    field: str | None = Field(None, description="template tampilan terdekat, dipilih AI dari penjelasan user")
    field_label: str | None = None
    fit: Literal["cocok", "sebagian", "tidak_cocok"] | None = Field(
        None, description="seberapa cocok data kami dengan kebutuhan user; null = dinilai tanpa AI")
    unsupported: list[str] = Field([], description="kebutuhan user yang belum ada datanya")
    ai_message: str | None = Field(None, description="pesan untuk user: apa yang bisa/tidak bisa kami tampilkan")
    created_at: datetime
    updated_at: datetime


class MeOut(BaseModel):
    user: UserOut
    profile: ProfileOut | None = Field(None, description="profil aktif; null = belum punya profil")
    profiles: list[ProfileOut] = Field([], description="semua profil user (maks. max_profiles)")
    max_profiles: int = 3


# ── fields ───────────────────────────────────────────────────────────────
class Layer(BaseModel):
    type: Literal["choropleth", "points", "areas"] = Field(
        description="choropleth: GET /api/map/{metric}; points/areas: GET /api{endpoint}?params (titik/poligon)")
    metric: str | None = Field(None, description="choropleth: GET /api/map/{metric}")
    endpoint: str | None = Field(None, description="points: GET /api{endpoint}")
    params: dict[str, Any] | None = None
    added_for_sensor: bool = Field(False, description="layer ditambahkan karena sensor user")


class FieldInfo(BaseModel):
    id: str
    label: str
    description: str
    metrics: list[str]
    rank: dict[str, str]
    events: list[str]
    disaster_types: list[str] | None = None
    layers: list[Layer]


class ClientOut(BaseModel):
    id: int
    name: str
    note: str | None = None
    key_prefix: str
    created_at: datetime
    last_used_at: datetime | None = None
    revoked_at: datetime | None = None


class ClientCreated(BaseModel):
    client: ClientOut
    api_key: str = Field(description="HANYA ditampilkan sekali; berikan ke tim frontend/mitra")
