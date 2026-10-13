"""Modes: the time lens of a logged-in profile, across every field.

  protected  teams that go to the field when something happens (Basarnas,
             BPBD, damkar): what just happened, where, who is affected.
  responden  people who prevent it happening: risk levels, the next 1-3
             days, which areas need attention first.
  plan       planning ahead: 30-day outlook, seasonal patterns, long-term
             hazard, the past year's history.

The field (fields.py) says WHAT a user watches; the mode says WHEN. A
profile has one of each. Changing a mode here changes every dashboard
built in that mode.
"""

MODES = {
    "protected": {
        "label": "Protected",
        "title": "Tanggap darurat",
        "description": ("Untuk tim yang turun ke lapangan saat kejadian (Basarnas, BPBD, damkar): kejadian "
                        "terbaru, lokasi dan penduduk terdampak, peringatan yang sedang berlaku."),
        # how far back each event kind reaches in this mode
        "windows": {"quake": 3, "hotspot": 2, "disaster": 14},
        # order the frontend shows the panels in
        "panels": ["impact", "alerts", "events", "ranking"],
        # metrics this mode puts first when the field has them
        "metrics": ["hotspot_count_7d", "hotspot_frp_max", "river_discharge", "wind_speed", "wave_height_max",
                    "aqi_forecast_max", "heat_index_max", "fire_risk", "health_facilities_per_10k"],
        # added even if the field lacks them: how many people are exposed
        "core": ["population_density"],
    },
    "responden": {
        "label": "Responden",
        "title": "Pencegahan",
        "description": ("Untuk yang mencegah sebelum terjadi: tingkat risiko sekarang, prakiraan 1-3 hari, "
                        "dan wilayah yang perlu perhatian lebih dulu."),
        "windows": {"quake": 30, "hotspot": 7, "disaster": 90},
        "panels": ["alerts", "ranking", "events"],
        "metrics": ["fire_risk", "dry_days", "aqi_forecast_max", "pm25_forecast_max", "heat_index_max",
                    "wet_bulb_max", "uv_index_max", "wave_height_max", "water_stress", "seismic_hazard",
                    "river_discharge"],
        "core": [],
    },
    "plan": {
        "label": "Plan",
        "title": "Perencanaan",
        "description": ("Untuk perencanaan ke depan: prakiraan hujan 30 hari, pola musiman, kerawanan jangka "
                        "panjang, dan riwayat kejadian setahun terakhir."),
        "windows": {"quake": 365, "hotspot": 30, "disaster": 365},
        "panels": ["history", "ranking", "events", "alerts"],
        "metrics": ["rain_forecast_30d", "rain_30d", "solar_ghi_annual", "solar_rooftop_mwp", "quake_count_30y",
                    "quake_max_mag_30y", "seismic_hazard", "water_stress", "temp_max_mean",
                    "population_density", "built_density", "power_capacity_mw", "schools_per_10k"],
        "core": ["rain_forecast_30d"],
    },
}
DEFAULT = "responden"
MAX_METRICS = 8

# Fallback when the AI can't say which mode a self-description fits.
_RULES = [
    (("basarnas", "sar ", "tim sar", "rescue", "evakuasi", "tanggap darurat", "reaksi cepat", "trc",
      "lapangan", "damkar", "pemadam", "relawan"), "protected"),
    (("rencana", "perencana", "planner", "bappeda", "investasi", "jangka panjang", "musim tanam",
      "tahun depan", "proyek", "pembangunan"), "plan"),
]

_KIND = {"/quakes": "quake", "/hotspots": "hotspot", "/disasters": "disaster"}


def get(mode: str | None) -> dict:
    return {"id": mode if mode in MODES else DEFAULT, **MODES.get(mode, MODES[DEFAULT])}


def catalogue() -> list[dict]:
    return [{"id": k, "label": m["label"], "title": m["title"], "description": m["description"],
             "panels": m["panels"]} for k, m in MODES.items()]


def rule_mode(text: str) -> str:
    t = f" {text.lower()} "
    return next((m for words, m in _RULES if any(w in t for w in words)), DEFAULT)


def order_metrics(mode: str, field_metrics: list[str], known: set[str]) -> list[str]:
    """Field's metrics, the mode's own first, plus the mode's core ones."""
    m = get(mode)
    first = [x for x in field_metrics if x in m["metrics"]]
    rest = [x for x in field_metrics if x not in first]
    core = [x for x in m["core"] if x in known and x not in field_metrics]
    return (first + core + rest)[:MAX_METRICS]


def layers(mode: str, field_layers: list[dict]) -> list[dict]:
    """The field's layers with point layers reaching back as far as the
    mode looks (protected: days; plan: a year)."""
    w = get(mode)["windows"]
    out = []
    for layer in field_layers:
        kind = _KIND.get(layer.get("endpoint"))
        if kind and layer["type"] == "points":
            days = min(w[kind], 30) if kind == "hotspot" else w[kind]   # /hotspots keeps 30 days
            layer = {**layer, "params": {**(layer.get("params") or {}), "days": days}}
        out.append(layer)
    if mode == "protected" and not any(x.get("endpoint") == "/warnings" for x in out):
        out.append({"type": "areas", "endpoint": "/warnings", "params": {}})
    return out
