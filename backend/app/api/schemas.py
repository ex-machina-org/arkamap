"""Response shapes. Kept explicit so the frontend can rely on them."""
from datetime import date, datetime
from typing import Any, Literal

from pydantic import BaseModel, ConfigDict, Field

from ..iot.categories import Category as SensorCategory


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


class MetricDef(BaseModel):
    metric: str
    aspect: str
    label: str
    unit: str
    description: str
    polarity: str
    scale_min: float
    scale_max: float
    source_id: str | None = None


class IndicatorValue(BaseModel):
    metric: str
    label: str
    unit: str
    value: float
    period: date
    normalised: float = Field(description="0-100, arah sudah disamakan (tinggi = lebih buruk)")
    confidence: int
    is_modelled: bool
    source_id: str


class RegionSummary(BaseModel):
    id: str
    name: str
    level: str
    population: int | None = None
    area_km2: float | None = None
    indicators: list[IndicatorValue] = []
    composite: float | None = None


class ScoreWeights(BaseModel):
    """Weights per metric. Any metric in metric_def may be used."""
    weights: dict[str, float]


class Geometry(BaseModel):
    type: str = Field(description="GeoJSON geometry type, mis. Point, MultiPolygon")
    coordinates: Any


class _Props(BaseModel):
    model_config = ConfigDict(extra="allow")


class LevelInfo(BaseModel):
    level: Literal["provinsi", "kabkota"]
    regions: int
    with_population: int


class RegionRef(BaseModel):
    id: str = Field(examples=["idn.riau"])
    name: str
    level: Literal["provinsi", "kabkota"]
    parent_id: str | None = None
    population: int | None = None


class MapMetric(BaseModel):
    metric: str
    label: str
    unit: str
    aspect: str
    description: str
    polarity: Literal["high_bad", "high_good"]
    scale_min: float
    scale_max: float
    normalised_meaning: str


class MapProps(_Props):
    region_id: str
    name: str
    parent_id: str | None = None
    population: int | None = None
    area_km2: float | None = None
    value: float | None = Field(None, description="null = belum ada data untuk wilayah ini")
    unit: str
    period: date | None = None
    confidence: int | None = Field(None, ge=1, le=5)
    is_modelled: bool | None = Field(None, description="true = estimasi model, tandai MODEL di UI")
    source_id: str | None = None
    normalised: float | None = Field(None, description="0-100, 100 = paling perlu perhatian")


class MapFeature(BaseModel):
    type: Literal["Feature"] = "Feature"
    id: str
    properties: MapProps
    geometry: Geometry


class MapLayer(BaseModel):
    type: Literal["FeatureCollection"] = "FeatureCollection"
    metric: MapMetric
    features: list[MapFeature]


class HotspotProps(_Props):
    frp: float = Field(description="Fire Radiative Power, MW")
    observed_at: datetime
    confidence: str | None = Field(None, description="VIIRS: l/n/h; MODIS: 0-100")
    daynight: str | None = None


class QuakeProps(_Props):
    mag: float
    observed_at: datetime
    depth_km: float | None = None
    place: str | None = None
    tsunami: bool = False
    urgency: Literal["informasi", "pantau", "siaga_tsunami", "darurat"] | None = None
    urgency_confidence: float | None = None
    felt: str | None = Field(None, description="BMKG: kota yang merasakan + skala MMI, mis. 'III-IV Calang'")
    potensi: str | None = Field(None, description="BMKG: pernyataan potensi tsunami")
    source_id: str | None = Field(None, description="bmkg_quake | usgs_quake | emsc_quake")


class DisasterProps(_Props):
    type: Literal["volcano", "earthquake", "flood", "wildfire", "cyclone", "drought",
                  "landslide", "other"]
    name: str | None = None
    source_id: Literal["gdacs", "nasa_eonet"]
    observed_at: datetime = Field(description="awal kejadian")
    value: float | None = Field(None, description="GDACS: 1 Green, 2 Orange, 3 Red; EONET: magnitudo (lihat magnitude_unit)")
    alertlevel: Literal["Green", "Orange", "Red"] | None = None
    magnitude_unit: str | None = None
    until: str | None = None
    current: bool | None = None
    url: str | None = None


class PointGeometry(BaseModel):
    type: Literal["Point"] = "Point"
    coordinates: list[float] = Field(description="[lon, lat]")


class HotspotFeature(BaseModel):
    type: Literal["Feature"] = "Feature"
    properties: HotspotProps
    geometry: PointGeometry


class QuakeFeature(BaseModel):
    type: Literal["Feature"] = "Feature"
    properties: QuakeProps
    geometry: PointGeometry


class DisasterFeature(BaseModel):
    type: Literal["Feature"] = "Feature"
    properties: DisasterProps
    geometry: PointGeometry


class HotspotCollection(BaseModel):
    type: Literal["FeatureCollection"] = "FeatureCollection"
    count: int
    features: list[HotspotFeature]


class QuakeCollection(BaseModel):
    type: Literal["FeatureCollection"] = "FeatureCollection"
    count: int
    features: list[QuakeFeature]


class DisasterCollection(BaseModel):
    type: Literal["FeatureCollection"] = "FeatureCollection"
    count: int
    features: list[DisasterFeature]


class WindGrid(BaseModel):
    nx: int
    ny: int
    west: float
    east: float
    south: float
    north: float
    observed_at: datetime
    direction: list[float] = Field(description="derajat, baris demi baris dari sudut barat daya")
    speed: list[float] = Field(description="km/jam, urutan sama dengan direction")
    temperature: list[float | None]
    surface: list[float | None]


class ScorePart(BaseModel):
    value: float
    normalised: float
    weight: float


class ScoreResult(BaseModel):
    region_id: str
    name: str
    score: float = Field(description="0-100, 100 = paling perlu perhatian")
    coverage: float = Field(description="bagian bobot yang punya data, 0-1")
    modelled_share: float = Field(description="bagian bobot dari angka model, 0-1")
    min_confidence: int
    parts: dict[str, ScorePart]


class ScoreResponse(BaseModel):
    weights: dict[str, float]
    polarity: dict[str, str]
    score_meaning: str
    count: int
    results: list[ScoreResult]


class QuakeAlert(BaseModel):
    lon: float
    lat: float
    mag: float
    observed_at: datetime
    place: str | None = None
    urgency: str | None = None
    urgency_confidence: float | None = None


class RegionAlert(BaseModel):
    region_id: str
    name: str
    metric: str
    label: str
    value: float
    normalised: float


class DisasterAlert(BaseModel):
    lon: float
    lat: float
    observed_at: datetime
    type: str | None = None
    name: str | None = None
    alertlevel: str | None = None
    url: str | None = None


class SourceAlert(BaseModel):
    id: str
    title: str
    last_error: str | None = None
    last_ok_at: datetime | None = None


class WarningProps(BaseModel):
    id: str
    event: str | None = Field(None, description="mis. 'Hujan Lebat dan Petir'")
    headline: str | None = None
    description: str | None = None
    area: str | None = None
    severity: str | None = Field(None, description="CAP: Minor | Moderate | Severe | Extreme")
    urgency: str | None = None
    certainty: str | None = None
    effective: datetime | None = None
    expires: datetime | None = None
    url: str | None = Field(None, description="pesan CAP asli di BMKG")


class WarningFeature(BaseModel):
    type: Literal["Feature"] = "Feature"
    properties: WarningProps
    geometry: Geometry


class WarningCollection(BaseModel):
    type: Literal["FeatureCollection"] = "FeatureCollection"
    count: int
    features: list[WarningFeature]


class FireAlert(BaseModel):
    """Possible fires in one kabkota: hotspots outside known static heat
    (industry, flares, volcanoes) seen on at least two satellite passes."""
    region_id: str
    name: str
    province: str | None = None
    clusters: int = Field(description="sel ~1 km yang terdeteksi panas berulang")
    detections: int = Field(description="jumlah deteksi satelit di sel-sel itu")
    satellites: list[str] = Field(description="satelit yang mendeteksi, mis. 'VIIRS NOAA-20'")
    frp_max: float = Field(description="Fire Radiative Power tertinggi (MW)")
    first_seen: datetime
    last_seen: datetime
    lon: float = Field(description="titik terkuat")
    lat: float
    confirmed: bool = Field(description="true = GDACS melaporkan kebakaran hutan dalam radius 0,5°")


class Notifications(BaseModel):
    weather_warnings: list[WarningProps] = Field(description="peringatan dini cuaca BMKG yang masih berlaku")
    quake_alerts: list[QuakeAlert]
    region_alerts: list[RegionAlert]
    disaster_alerts: list[DisasterAlert]
    fire_alerts: list[FireAlert] = Field([], description="kemungkinan kebakaran per kab/kota, 48 jam terakhir")
    source_alerts: list[SourceAlert]
    count: int


class FieldBrief(BaseModel):
    id: str
    label: str
    description: str


class OverviewCounts(BaseModel):
    hotspots_24h: int
    hotspots_7d: int
    quakes_7d_m45: int
    disasters_30d: int
    community_devices: int


class RiskTop(BaseModel):
    region_id: str
    name: str
    score: float


class StaleSource(BaseModel):
    id: str
    title: str
    last_ok_at: datetime | None = None


class PublicOverview(BaseModel):
    generated_at: datetime
    counts: OverviewCounts
    fire_risk_top: list[RiskTop]
    disaster_alerts: list[DisasterAlert]
    quake_alerts: list[QuakeAlert]
    stale_sources: list[StaleSource]
    fields: list[FieldBrief]


class MarineDay(BaseModel):
    date: str
    wave_height_max: float | None = Field(None, description="m")
    wave_period_max: float | None = Field(None, description="detik")
    wave_direction: float | None = Field(None, description="derajat, arah datang gelombang")
    wind_wave_height_max: float | None = Field(None, description="m")


class MarineForecast(BaseModel):
    lat: float = Field(description="sel laut yang dipakai (bisa bergeser dari titik yang diminta)")
    lon: float
    sea_surface_temp: float | None = Field(None, description="°C, rata-rata 24 jam ke depan")
    days: list[MarineDay]


class SolarHour(BaseModel):
    time: str = Field(description="waktu lokal WIB")
    kw: float


class SolarDay(BaseModel):
    date: str
    kwh: float


class SolarForecast(BaseModel):
    kwp: float
    tilt: float
    azimuth: float
    performance_ratio: float = Field(description="faktor rugi-rugi sistem yang diasumsikan")
    daily: list[SolarDay]
    hourly: list[SolarHour]


class IndicatorInfo(BaseModel):
    metric: str
    label: str = Field(description="nama tampilan; sama dengan `metric` untuk metrik internal")
    unit: str
    aspect: str | None = None
    polarity: str | None = None
    description: str | None = None
    source_id: str | None = None
    internal: bool = Field(description="tersimpan tetapi bukan layer peta (tanpa baris metric_def)")
    provinsi: int = Field(description="jumlah provinsi yang punya datanya")
    kabkota: int = Field(description="jumlah kab/kota yang punya datanya")
    modelled: bool = Field(description="ada nilai estimasi model di data terbaru")
    periods: int = Field(description="jumlah periode tersimpan (riwayat: /indicators/history)")
    first_period: date | None = None
    last_period: date | None = None


class ObservationLayer(BaseModel):
    metric: str = Field(examples=["power_plant"])
    sources: list[str]
    count: int
    first: datetime
    last: datetime
    endpoint: str


class DatasetLink(BaseModel):
    id: str
    label: str
    endpoint: str


class Catalog(BaseModel):
    indicators: list[IndicatorInfo]
    observations: list[ObservationLayer]
    datasets: list[DatasetLink] = Field(description="dataset lain dan endpoint yang menyajikannya")


class ObservationCollection(BaseModel):
    type: Literal["FeatureCollection"] = "FeatureCollection"
    metric: str
    count: int
    limit: int = Field(description="count == limit berarti masih ada titik lain: persempit waktu, wilayah, atau bbox")
    features: list[dict[str, Any]]


class BuildingProps(_Props):
    kind: Literal["hunian", "niaga", "industri", "fasilitas", "lainnya"]
    building: str
    levels: int | None = None
    name: str | None = None
    amenity: str | None = None
    area_m2: float | None = None


class BuildingFeature(BaseModel):
    type: Literal["Feature"] = "Feature"
    id: int = Field(description="OSM way id")
    properties: BuildingProps
    geometry: Geometry


class BuildingCollection(BaseModel):
    type: Literal["FeatureCollection"] = "FeatureCollection"
    count: int
    by_kind: dict[str, int]
    features: list[BuildingFeature]


class ClassificationStats(BaseModel):
    building: dict[str, int]
    quake_urgency: dict[str, int]
    total_buildings: int
    total_quakes_classified: int


class HistoryBucket(BaseModel):
    bucket: datetime
    urgency: str | None = None
    count: int


class EventHistory(BaseModel):
    metric: Literal["quake", "hotspot", "disaster"]
    bucket: Literal["day", "week"]
    buckets: list[HistoryBucket]


class SourceFreshness(BaseModel):
    id: str
    title: str
    cadence: str
    is_modelled: bool
    last_ok_at: datetime | None = None
    stale: bool = Field(description="true = lebih lama dari jadwal pembaruannya")


class EventSummary(BaseModel):
    count: int
    max_value: float | None = Field(None, description="quake: magnitudo terbesar; hotspot: FRP tertinggi (MW)")


class RegionReport(BaseModel):
    generated_at: datetime
    days: int = Field(description="rentang kejadian yang dirangkum")
    region: RegionSummary
    events: dict[Literal["quake", "hotspot", "disaster"], EventSummary]
    disasters: list[DisasterProps] = Field(description="bencana GDACS/EONET di wilayah ini")
    alerts: list[RegionAlert] = Field(description="indikator wilayah ini di atas ambang perhatian")
    sources: list[SourceFreshness]


# /agent
class ToolCallInfo(BaseModel):
    tool: str
    error: str | None = None


class TokenUsage(BaseModel):
    input: int
    output: int
    budget: int


class ClarifyOption(BaseModel):
    label: str = Field(description="teks tombol")
    question: str = Field(description="pertanyaan lengkap yang dikirim bila tombol dipilih")
    description: str | None = Field(None, description="isi pilihan ini, mis. data apa saja yang ada di dalamnya")


class Clarify(BaseModel):
    """The Agent asks back instead of guessing, or offers next steps after an answer.
    The UI shows few `options` as buttons and many as a list, each with its
    `description`, plus its own "Lainnya" (free text). A reply with an option's
    number or label picks it; another short reply continues the asked question."""
    question: str
    options: list[ClarifyOption]


class ChatResponse(BaseModel):
    session_id: str
    answer: str
    skill: Literal["ranking", "region", "events", "alerts", "trend", "facilities", "my_data", "guide", "off_topic",
                   "clarify"] = Field(
        description="my_data = data akun yang login (alat IoT, profil); guide = cara memakai Arkamap (dari panduan, tanpa data); off_topic = di luar cakupan, jawaban tetap; "
                    "clarify = bertanya balik, lihat `clarify`")
    clarify: Clarify | None = Field(None, description="diisi bila Agent bertanya balik; `answer` berisi pertanyaannya")
    route_source: Literal["llm:gemini", "llm:openrouter", "llm:deepseek", "jev", "keyword"] = Field(
        description="siapa yang membaca pertanyaan: LLM pertama yang berhasil; bila semua gagal, Jev memilih skill; "
                    "terakhir aturan kata kunci")
    topic: str | None = Field(None, description="skill guide: topik panduan yang dipakai")
    fallback: str | None = Field(None, description="null = jawaban normal (LLM, atau jawaban tetap untuk off_topic); "
                                                   "teks = alasan ringkasan template ditambahkan di akhir jawaban")
    models: list[str] = Field(default_factory=list, description="penulis jawaban berurutan: gemini, openrouter, deepseek; "
                                                                  "lebih dari satu = cadangan melanjutkan jawaban yang sudah tampil")
    context: dict[str, Any] = Field(description="mis. {'region': {id, name, level}}")
    tokens: TokenUsage
    tool_calls: list[ToolCallInfo]
    sources: list[str]
    viz: list[dict[str, Any]] = Field(description="komponen untuk dirender; bentuk per `type` di docs/VIZ.md")


class SessionState(BaseModel):
    history: list[dict[str, str]]
    context: dict[str, Any]
    turns: int
    tokens_in: int
    tokens_out: int
    budget: int


class IsochroneFeature(BaseModel):
    type: Literal["Feature"] = "Feature"
    properties: dict[str, Any]
    geometry: Geometry


class Isochrone(BaseModel):
    type: Literal["FeatureCollection"] = "FeatureCollection"
    features: list[IsochroneFeature]
    area_km2: float | None = Field(None, description="luas area terjangkau")
    minutes: int
    mode: Literal["auto", "pedestrian", "bicycle"]
    cached: bool
    created_at: datetime | None = Field(None, description="waktu hasil cache dibuat")


class IndicatorTable(BaseModel):
    level: Literal["provinsi", "kabkota"]
    parent: str | None = None
    columns: list[IndicatorInfo]
    rows: list[dict[str, Any]] = Field(description="satu baris per wilayah: region_id, name, level, parent_id, "
                                                   "population, lalu nilai terbaru tiap metrik di `columns`")
    total: int = Field(description="jumlah wilayah yang cocok sebelum limit/offset")
    limit: int
    offset: int


class HistoryPoint(BaseModel):
    period: date
    value: float
    is_modelled: bool


class HistorySeries(BaseModel):
    region_id: str
    name: str
    metric: str
    label: str
    unit: str
    internal: bool
    source_id: str | None = None
    points: list[HistoryPoint]


class IndicatorHistory(BaseModel):
    series: list[HistorySeries]


class WidgetSpec(BaseModel):
    field: str = Field(description="key di data sensor (bersarang diratakan: 'cuaca.suhu')")
    label: str
    unit: str | None = None
    semantic: str
    widget: Literal["line", "gauge", "stat", "bar", "status", "map", "table"]
    group: str
    compare_metric: str | None = Field(None, description="metrik wilayah kita yang sebanding (satuan sama)")
    hidden: bool = False
    pair_field: str | None = Field(None, description="widget map: field longitude pasangan; field ini latitude")
    category: SensorCategory = Field("lainnya", description="kategori tetap field ini")
    category_by: Literal["rule", "ai", "user"] | None = Field(
        None, description="rule = sementara (AI akan menilai ulang); ai/user = terkonfirmasi")
    by: Literal["rule", "ai", "user"] | None = Field(None, description="siapa yang menata widget ini")


class DeviceOut(BaseModel):
    id: int
    name: str
    category: str | None = Field(None, description="petunjuk opsional dari pemilik; kategori sebenarnya per field")
    key_prefix: str = Field(description="awal API key, untuk mengenali key; key penuh hanya diberikan sekali")
    mqtt_username: str = Field(description="username MQTT; password = API key")
    mqtt_topic: str = Field(description="satu-satunya topik yang boleh dipakai perangkat ini untuk publish")
    region_id: str | None = None
    region_name: str | None = None
    lat: float | None = None
    lon: float | None = None
    visibility: Literal["private", "community"]
    community_status: Literal["none", "pending", "approved", "rejected"]
    community_note: str | None = None
    layout: list[WidgetSpec] | None = None
    layout_by: Literal["ai", "rule", "user"] | None = None
    last_seen_at: datetime | None = None
    created_at: datetime
    dup_count: int = Field(0, description="kiriman ulang yang diabaikan (data sama dalam 1 detik, atau data dan waktu sama)")
    rejected_count: int = Field(0, description="kiriman yang ditolak (format salah, terlalu cepat, dst.)")
    last_error: str | None = Field(None, description="alasan penolakan terakhir, untuk ditampilkan ke pemilik")
    last_error_at: datetime | None = None
    warning_count: int = Field(0, description='kiriman yang diterima tanpa "nama" atau "waktu" (masa transisi)')
    last_warning: str | None = Field(None, description="peringatan terakhir untuk pemilik; data tetap disimpan")
    last_warning_at: datetime | None = None
    test_expires_at: datetime | None = Field(None, description="diisi = alat uji; terhapus otomatis setelah waktu ini")


class QuickstartMqtt(BaseModel):
    url: str
    username: str
    password: str
    topic: str
    qos: int


class Quickstart(BaseModel):
    """Contoh siap tempel untuk satu perangkat. Saat dibuat/rotasi berisi key
    asli; lewat GET /me/devices/{id}/quickstart berisi <API_KEY>."""
    url: str
    headers: dict[str, str]
    mqtt: QuickstartMqtt
    payload: dict = Field(description="contoh JSON yang valid")
    rules: list[str]
    snippets: dict[str, str] = Field(description="curl, python, python_mqtt, esp32_arduino")


class DeviceCreated(BaseModel):
    device: DeviceOut
    api_key: str = Field(description="HANYA ditampilkan sekali; simpan di sensor")
    quickstart: Quickstart


class KeyRotated(BaseModel):
    api_key: str
    key_prefix: str
    quickstart: Quickstart


# ── sensor ingest ─────────────────────────────────────────────────────
class IngestOut(BaseModel):
    device_id: int
    fields: int
    new_fields: int = Field(description="field yang baru pertama kali dikirim; memicu penataan ulang AI")
    stream_id: int | None = Field(None, description="tabel data (per \"nama\") tempat kiriman ini masuk")
    nama: str | None = Field(None, description='nama tabel setelah dinormalkan; "default" bila "nama" kosong')
    version: int | None = Field(None, description="versi tabel; naik saat kiriman membawa field baru. null = kiriman ulang")
    warnings: list[str] = Field(default_factory=list, description='data disimpan, tetapi "nama"/"waktu" kurang')
    duplicate: bool = Field(False, description="true: kiriman ulang, tidak disimpan lagi (tetap 202)")
    dry_run: bool = Field(False, description="true: hanya dicek, tidak disimpan")
    keys: list[str] | None = Field(None, description="dry_run: nama field setelah diratakan")
    alert: Literal["aman", "bahaya"] | None = Field(None, description='status "alert" dari payload, bila dikirim')


class DeviceAlert(BaseModel):
    """The latest alert a device reported for one "nama"; "bahaya" notifies the owner."""
    device_id: int
    device_name: str
    region_name: str | None = None
    nama: str = Field(description="tabel data (\"nama\") yang membawa alert ini")
    status: Literal["aman", "bahaya"]
    message: str | None = Field(None, description='"pesan" dari perangkat, bila ada')
    category: Literal["kebakaran", "cuaca", "gempa", "bencana", "panas"] | None = Field(
        None, description='"kategori" dari perangkat; kosong = alert alat umum')
    changed_at: datetime = Field(description="saat status terakhir berubah")
    updated_at: datetime = Field(description="laporan terakhir dari perangkat")


# ── data tables and readings ──────────────────────────────────────────
class Reading(BaseModel):
    id: int | None = None
    stream_id: int | None = None
    version_id: int | None = None
    received_at: datetime
    measured_at: datetime | None = Field(None, description="waktu dari sensor sendiri, bila dikirim")
    protocol: str | None = None
    data: dict[str, Any] | None = None
    value: Any = None


class Readings(BaseModel):
    device_id: int
    field: str | None = None
    count: int
    readings: list[Reading]
    next_before: int | None = Field(None, description="isi ke ?before= untuk halaman berikutnya; null = habis")


class ReadingsDeleted(BaseModel):
    deleted: int


class StreamField(BaseModel):
    key: str
    label: str
    type: str
    category: SensorCategory
    category_by: Literal["rule", "ai", "user"]
    first_seen: datetime
    last_seen: datetime


class StreamVersion(BaseModel):
    """A table's field set since a reading first brought new fields (a sensor upgrade)."""
    id: int
    version: int
    keys: list[str] = Field(description="field versi ini")
    added: list[str] = Field(description="field yang belum ada di versi sebelumnya")
    reading_count: int
    first_seen: datetime
    last_seen: datetime


class Stream(BaseModel):
    """One data table per \"nama\" the device sends; columns = every field it has had."""
    id: int
    slug: str = Field(description='"nama" yang dinormalkan; kiriman dengan nama ini masuk ke tabel ini')
    aliases: list[str] = Field(default_factory=list, description="nama tabel lain yang sudah digabung ke sini")
    versions: list[StreamVersion] = Field(description="urut dari versi 1")
    name: str
    name_by: Literal["auto", "payload", "user"]
    category: SensorCategory
    category_by: Literal["fields", "user"] = Field(description="fields = mayoritas kategori field-nya")
    confirmed: bool = Field(description="false = ada field yang kategorinya masih sementara (aturan, bukan AI/user)")
    fields: list[StreamField] = Field(description="kolom tabel")
    reading_count: int
    created_at: datetime
    last_seen_at: datetime


# ── test devices ──────────────────────────────────────────────────────
class DeviceEvent(BaseModel):
    """One line in a test device's log."""
    id: int
    at: datetime
    kind: Literal["diterima", "ulang", "tabel_baru", "versi_baru", "peringatan", "bahaya", "ditolak", "nama_diganti", "digabung", "dihapus"]
    message: str


# ── dashboard ─────────────────────────────────────────────────────────
class Compare(BaseModel):
    metric: str
    label: str
    value: float
    unit: str
    period: date
    is_modelled: bool
    source_id: str
    region_id: str
    region_name: str | None = None


class SeriesPoint(BaseModel):
    t: datetime
    v: float


class Widget(WidgetSpec):
    latest: Any = Field(None, description="nilai terakhir field ini (tipe bebas)")
    latest_at: datetime | None = None
    pair_latest: Any = Field(None, description="widget map: nilai terakhir field pasangan (longitude)")
    series: list[SeriesPoint] | None = Field(None, description="untuk line/bar/gauge, maks ±200 titik")
    compare: Compare | None = None


class DeviceDashboard(BaseModel):
    widgets: list[Widget]
    device: DeviceOut


class OurIndicator(IndicatorValue):
    reason: str
    added_for_sensor: bool = Field(False, description="ditambahkan karena sensor user mengukur hal yang sebanding")


class OurRegion(BaseModel):
    id: str
    name: str
    level: str
    indicators: list[OurIndicator]
    missing: list[str] = Field(description="metrik terpilih yang belum ada datanya di wilayah ini")


class OurData(BaseModel):
    role: str
    metrics_by: str | None = None
    region: OurRegion | None = None
    metrics: list[MetricPick] | None = Field(None, description="bila profil belum punya wilayah")


class Focus(BaseModel):
    id: str
    name: str
    level: str
    parent_id: str | None = None
    bbox: list[float] = Field(description="[barat, selatan, timur, utara] untuk membuka peta")


class EventPanel(BaseModel):
    kind: Literal["quake", "hotspot", "disaster"]
    days: int
    count: int
    max_value: float | None = Field(None, description="quake: magnitudo terbesar; hotspot: FRP tertinggi (MW)")
    top: list[dict[str, Any]]


class RankRow(BaseModel):
    region_id: str
    name: str
    score: float
    value: float
    is_you: bool


class RankPanel(BaseModel):
    metric: str
    sort: Literal["attention", "value_desc"]
    scope: str = Field(description="provinsi user, atau Indonesia bila tanpa wilayah")
    polarity: str
    your_rank: int | None = None
    of: int
    results: list[RankRow]
    score_meaning: str


class AlertPanel(BaseModel):
    weather_warnings: list[WarningProps] = Field([], description="peringatan dini cuaca BMKG di wilayah user")
    region_alerts: list[RegionAlert]
    disaster_alerts: list[DisasterAlert]
    quake_alerts: list[QuakeAlert]


class ImpactRegion(BaseModel):
    id: str
    name: str
    population: int | None = None
    distance_km: float | None = Field(None, description="gempa: jarak dari episenter")


class ImpactQuake(BaseModel):
    mag: float
    observed_at: datetime
    lat: float
    lon: float
    depth_km: float | None = None
    place: str | None = None
    urgency: str | None = None
    tsunami: bool
    felt: str | None = Field(None, description="laporan dirasakan BMKG (MMI per tempat), bila ada")
    potensi: str | None = None
    source_id: str
    radius_km: int = Field(description="perkiraan radius terasa dari magnitudo")
    regions: list[ImpactRegion] = Field(description="kabupaten/kota dalam radius, terdekat dulu (maks. 30)")
    population: int = Field(description="jumlah penduduk kabupaten/kota tersebut")


class ImpactWarning(WarningProps):
    regions: list[ImpactRegion] = Field(description="kabupaten/kota yang tercakup peringatan")
    population: int


class ImpactPanel(BaseModel):
    """Mode protected: apa yang terjadi, di mana, siapa terdampak."""
    quakes: list[ImpactQuake]
    warnings: list[ImpactWarning]
    radius_note: str


class HistoryMonth(BaseModel):
    month: date
    count: int


class HistoryPanel(BaseModel):
    """Mode plan: jumlah kejadian per bulan setahun terakhir."""
    kind: Literal["quake", "hotspot", "disaster"]
    days: int
    months: list[HistoryMonth]


class DashboardView(BaseModel):
    profile_id: int
    mode: ModeInfo
    impact: ImpactPanel | None = Field(None, description="hanya mode protected")
    history: list[HistoryPanel] | None = Field(None, description="hanya mode plan")
    field: FieldBrief
    fit: Literal["cocok", "sebagian", "tidak_cocok"] | None = None
    unsupported: list[str]
    message: str | None = None
    focus: Focus | None = None
    layers: list[Layer]
    events: list[EventPanel]
    ranking: RankPanel
    alerts: AlertPanel


class Dashboard(BaseModel):
    profile_needed: bool = Field(description="true = arahkan user mengisi profil dulu")
    ours: OurData | None
    view: DashboardView | None = Field(None, description="tampilan sesuai bidang user: layer peta, kejadian, peringkat, peringatan")
    devices: list[DeviceDashboard]


# ── community and moderation ──────────────────────────────────────────
class CommunityDevice(BaseModel):
    id: int
    name: str
    category: str | None = Field(None, description="petunjuk opsional dari pemilik; kategori sebenarnya per field")
    region_id: str | None = None
    region_name: str | None = None
    lat: float | None = None
    lon: float | None = None
    layout: list[WidgetSpec] | None = None
    last_seen_at: datetime | None = None
    latest_at: datetime | None = None
    latest: dict[str, Any] = Field(description="nilai terakhir per field (field tersembunyi tidak disertakan)")


class ModerationItem(DeviceOut):
    owner_email: str
    owner_name: str
    readings: int
    latest: dict[str, Any] | None = None


class ModerationResult(BaseModel):
    device_id: int
    community_status: Literal["approved", "rejected"]


class PasswordReset(BaseModel):
    user_id: int
    temporary_password: str = Field(description="HANYA ditampilkan sekali; berikan ke user lewat jalur pribadi")
