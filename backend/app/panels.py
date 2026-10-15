"""Dashboard panels: every card and chart our region data can fill, as a fixed catalogue.

A panel's shape never changes; only its region does. The AI picks panels for a profile
from this list (relevance.read_profile), the dashboard keeps the ones the profile's
region has data for, and the frontend draws each id (panel-catalog.tsx). Adding a panel
means one entry here and one renderer there.

`metrics`: what the panel reads; it is shown when the region has at least one of them.
"""

PANELS = [
    # ── kualitas udara
    {"id": "aq_index", "theme": "udara", "title": "Indeks Kualitas Udara",
     "metrics": ["aqi_forecast_max"],
     "description": "Gauge US AQI dengan kategori (Baik s.d. Berbahaya) dan batas normalnya: sekarang di mana dibanding standar."},
    {"id": "aq_pollutants", "theme": "udara", "title": "Polutan terhadap Baku Mutu",
     "metrics": ["pm25_mean", "pm10_mean", "no2_mean", "so2_mean", "o3_max8h", "co_mean"],
     "description": "Batang tiap polutan sebagai persen baku mutu nasional/pedoman WHO; mana yang melewati batas."},
    {"id": "aq_pm25_week", "theme": "udara", "title": "PM2.5, 7 Hari",
     "metrics": ["pm25_mean"],
     "description": "Garis PM2.5 tujuh hari terakhir dengan garis pedoman WHO dan baku mutu nasional."},
    {"id": "aq_pollutants_week", "theme": "udara", "title": "Polutan Udara, 7 Hari",
     "metrics": ["pm25_mean", "pm10_mean", "no2_mean", "so2_mean"],
     "description": "Beberapa garis polutan sekaligus selama tujuh hari: mana yang naik bersamaan."},
    {"id": "aq_outlook", "theme": "udara", "title": "Udara Sekarang vs 48 Jam ke Depan",
     "metrics": ["pm25_mean", "pm25_forecast_max"],
     "description": "Batang PM2.5 sekarang dibanding prakiraan tertinggi 48 jam ke depan."},
    {"id": "aq_ranking", "theme": "udara", "title": "PM2.5 Wilayah Sekitar",
     "metrics": ["pm25_mean"],
     "description": "Peringkat PM2.5 wilayah tetangga dengan garis baku mutu."},
    # ── kebakaran
    {"id": "fire_smoke_week", "theme": "kebakaran", "title": "Kebakaran dan Asap, 7 Hari",
     "metrics": ["hotspot_count_7d", "pm25_mean"],
     "description": "Titik panas (batang) dan PM2.5 (garis) tujuh hari pada sumbu waktu yang sama: apakah asap mengikuti api."},
    {"id": "fire_risk", "theme": "kebakaran", "title": "Rawan Kebakaran",
     "metrics": ["fire_risk", "dry_days", "hotspot_count_7d"],
     "description": "Gauge indeks rawan kebakaran 0-100 dengan hari kering berturut dan titik panas."},
    {"id": "fire_week", "theme": "kebakaran", "title": "Titik Panas, 7 Hari",
     "metrics": ["hotspot_count_7d"],
     "description": "Batang jumlah titik panas per hari selama tujuh hari."},
    # ── panas dan cuaca
    {"id": "heat_week", "theme": "cuaca", "title": "Suhu Maksimum, 7 Hari",
     "metrics": ["temp_max_mean"],
     "description": "Garis suhu maksimum harian tujuh hari terakhir."},
    {"id": "heat_now", "theme": "cuaca", "title": "Panas dan UV",
     "metrics": ["heat_index_max", "uv_index_max", "wet_bulb_max"],
     "description": "Suhu terasa, indeks UV, dan wet-bulb tertinggi 3 hari ke depan dengan kategorinya."},
    {"id": "rain_outlook", "theme": "cuaca", "title": "Hujan 30 Hari: Lalu vs Prakiraan",
     "metrics": ["rain_30d", "rain_forecast_30d"],
     "description": "Batang hujan 30 hari terakhir dibanding prakiraan 30 hari ke depan."},
    # ── air
    {"id": "water_now", "theme": "air", "title": "Air: Debit dan Tekanan",
     "metrics": ["river_discharge", "water_stress"],
     "description": "Garis debit sungai tujuh hari dan gauge tekanan air bersih."},
    # ── laut
    {"id": "marine_week", "theme": "laut", "title": "Gelombang dan Suhu Laut, 7 Hari",
     "metrics": ["wave_height_max", "sea_surface_temp"],
     "description": "Garis gelombang tertinggi dan suhu permukaan laut tujuh hari."},
    # ── gempa
    {"id": "quake_hazard", "theme": "gempa", "title": "Kerawanan Gempa",
     "metrics": ["seismic_hazard", "quake_count_30y", "quake_max_mag_30y"],
     "description": "Gauge kerawanan gempa 0-100 dengan jumlah dan magnitudo gempa terkuat 30 tahun."},
    # ── energi
    {"id": "solar_week", "theme": "energi", "title": "Iradiasi Matahari",
     "metrics": ["solar_ghi", "solar_rooftop_mwp", "solar_ghi_annual"],
     "description": "Garis iradiasi tujuh hari dan potensi PLTS atap wilayah."},
    # ── kota
    {"id": "city_services", "theme": "kota", "title": "Layanan Kota",
     "metrics": ["health_facilities_per_10k", "schools_per_10k", "transit_stop_density", "road_density"],
     "description": "Batang tingkat layanan (fasilitas kesehatan, sekolah, halte, jalan) dibanding wilayah lain."},
    # ── lintas tema
    {"id": "profile_attention", "theme": "ringkasan", "title": "Tingkat Perhatian Indikator",
     "metrics": [],   # reads the profile's own metrics
     "description": "Batang 0-100 tiap indikator pilihan profil: mana yang paling perlu perhatian dibanding wilayah lain."},
]

_BY_ID = {p["id"]: p for p in PANELS}
# Without the AI: words in the user's own description that name a theme.
THEME_WORDS = {
    "udara": ("udara", "polusi", "asap", "ispa", "aqi", "pm2", "pm10", "emisi"),
    "kebakaran": ("kebakaran", "karhutla", "titik panas", "hotspot", "damkar", "pemadam"),
    "cuaca": ("cuaca", "panas", "suhu", "hujan", "uv", "kekeringan"),
    "air": ("air bersih", "sungai", "banjir", "debit"),
    "laut": ("laut", "nelayan", "gelombang", "pesisir"),
    "gempa": ("gempa", "seismik"),
    "energi": ("surya", "plts", "energi", "listrik"),
    "kota": ("kota", "transport", "fasilitas", "sekolah", "puskesmas"),
}
MAX_PANELS = 8


def catalogue() -> list[dict]:
    return PANELS


def valid(ids: list[str]) -> list[str]:
    """Known ids, first occurrence only, at most MAX_PANELS."""
    out: list[str] = []
    for i in ids:
        if i in _BY_ID and i not in out:
            out.append(i)
    return out[:MAX_PANELS]


def rule_panels(metrics: list[str], text: str = "") -> list[str]:
    """Without the AI: the themes the description names, in the order it names them (first
    mention first), then the panels that read the profile's metrics, in the metrics' order."""
    t = text.lower()
    named = sorted((min(t.find(w) for w in words if w in t), theme)
                   for theme, words in THEME_WORDS.items() if any(w in t for w in words))
    by_theme = [p["id"] for _, theme in named for p in PANELS if p["theme"] == theme]
    by_metric = [p["id"] for m in metrics for p in PANELS if m in p["metrics"]]
    return valid(by_theme + by_metric + ["profile_attention"])


def rule_picks(metrics: list[str], text: str = "") -> list[dict]:
    return [{"id": i, "reason": "berkaitan dengan kebutuhan dan indikator profil"} for i in rule_panels(metrics, text)]


def with_data(ids: list[str], have: set[str]) -> list[str]:
    """The panels the region can fill. profile_attention needs any indicator at all."""
    return [i for i in ids if (have if i == "profile_attention" else have & set(_BY_ID[i]["metrics"]))]


if __name__ == "__main__":
    assert valid(["aq_index", "nope", "aq_index"]) == ["aq_index"]
    assert rule_panels(["pm25_mean"])[0] == "aq_pollutants" and "profile_attention" in rule_panels([])
    both = rule_panels(["fire_risk"], "memantau kualitas udara dan penyebabnya seperti kebakaran")
    assert both[0] == "aq_index" and both.index("aq_pm25_week") < both.index("fire_smoke_week")
    assert with_data(["aq_index", "fire_week", "profile_attention"], {"hotspot_count_7d"}) == ["fire_week", "profile_attention"]
    print("panels ok")
