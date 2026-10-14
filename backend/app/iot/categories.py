"""The fixed list of sensor-data categories. Every field gets exactly one,
so data from different users can be analysed together (e.g. all `air`
readings, whatever each sensor calls its fields). The AI picks from this
list; rules below are the fallback; anything unclear is `lainnya`.

Adding a category: one entry here, plus the CHECK in sql/012.
"""
import re
from typing import Literal

CATEGORIES = {
    "cuaca": "Cuaca",
    "kualitas_udara": "Kualitas Udara",
    "air": "Air",
    "tanah": "Tanah",
    "energi": "Energi",
    "laut": "Laut",
    "kebencanaan": "Kebencanaan",
    "kesehatan": "Kesehatan",
    "lokasi": "Lokasi",
    "perangkat": "Perangkat",
    "lainnya": "Lainnya",
}
Category = Literal["cuaca", "kualitas_udara", "air", "tanah", "energi", "laut", "kebencanaan",
                   "kesehatan", "lokasi", "perangkat", "lainnya"]
assert set(Category.__args__) == set(CATEGORIES)

DESCRIPTION = ("cuaca = suhu/kelembapan udara, hujan, angin, tekanan; kualitas_udara = PM, CO2, NO2, AQI; "
               "air = pH/kekeruhan/TDS/DO air, tinggi muka air, debit; tanah = kelembapan/NPK/pH/suhu tanah; "
               "energi = tegangan, arus, daya, kWh, PLTS; laut = gelombang, suhu laut, pasang, salinitas; "
               "kebencanaan = getaran, sensor banjir, asap/api; kesehatan = suhu tubuh, detak jantung, SpO2; "
               "lokasi = lat/lon, ketinggian GPS; perangkat = baterai, sinyal, uptime, status alat; "
               "lainnya = tidak jelas atau tidak cocok")

# Checked in order; the first match wins. A key's words are split on . _ -
# so "tanah.suhu" is soil, not weather. Only clear names: when unsure the
# answer is `lainnya`, never a guess (a wrong label is worse for ML).
_RULES: list[tuple[str, set[str]]] = [
    ("lokasi", {"lat", "latitude", "lon", "lng", "long", "longitude", "gps", "altitude", "alt", "ketinggian",
                "heading", "satellites", "hdop"}),
    ("perangkat", {"baterai", "battery", "batt", "bat", "vbat", "rssi", "snr", "wifi", "sinyal", "signal",
                   "uptime", "firmware", "fw", "version", "versi", "mac", "ip", "heap", "reset", "boot"}),
    ("tanah", {"tanah", "soil", "npk", "nitrogen", "fosfor", "phosphorus", "kalium", "potassium"}),
    ("laut", {"gelombang", "wave", "salinitas", "salinity", "pasang", "tide", "laut", "sea", "sst"}),
    ("air", {"ph", "tds", "turbidity", "kekeruhan", "do", "orp", "ec", "conductivity", "debit", "flow",
             "water", "tma", "muka", "sungai", "river", "tangki", "tank"}),
    ("kualitas_udara", {"pm25", "pm2", "pm10", "pm1", "co2", "no2", "so2", "o3", "co", "voc", "tvoc", "aqi",
                        "ispu", "ch4", "nh3", "ozone"}),
    ("energi", {"volt", "voltage", "tegangan", "arus", "current", "ampere", "amp", "daya", "power", "watt",
                "kwh", "wh", "energi", "energy", "pv", "solar", "inverter", "pf"}),
    ("kebencanaan", {"getaran", "vibration", "seismic", "accel", "banjir", "flood", "asap", "smoke", "api",
                     "fire", "flame", "gempa", "longsor"}),
    ("kesehatan", {"bpm", "heart", "detak", "spo2", "oksigen", "tubuh", "body", "nadi", "pulse"}),
    ("cuaca", {"suhu", "temp", "temperature", "temperatur", "kelembapan", "kelembaban", "lembap", "lembab",
               "humidity", "hum", "rh", "hujan", "rain", "curah", "angin", "wind", "tekanan", "pressure",
               "hpa", "lux", "cahaya", "light", "uv", "dew", "cuaca", "weather"}),
]
_SPLIT = re.compile(r"[._\-\s]+")
_NUM = re.compile(r"\d+$")


def _words(key: str) -> set[str]:
    parts = [p for p in _SPLIT.split(key.lower()) if p]
    return set(parts) | {_NUM.sub("", p) for p in parts} | {p.replace("_", "") for p in parts}


def rule_category(key: str, hint: str | None = None) -> str:
    """Category from the field name alone; `hint` is the payload's own
    "kategori" (used only when the name says nothing)."""
    words = _words(key)
    # "pm2_5"/"pm2.5" split into pm2 + 5; "tanah.suhu" must beat the generic "suhu"
    for cat, names in _RULES:
        if words & names:
            return cat
    h = (hint or "").strip().lower().replace(" ", "_")
    return h if h in CATEGORIES else "lainnya"


def majority(categories: list[str]) -> str:
    """A stream's category: the most common among its fields, ignoring
    device housekeeping (battery, signal) and position unless that is all."""
    counts: dict[str, int] = {}
    for c in categories:
        counts[c] = counts.get(c, 0) + 1
    core = {c: n for c, n in counts.items() if c not in ("perangkat", "lokasi", "lainnya")}
    pool = core or {c: n for c, n in counts.items() if c != "lainnya"} or counts or {"lainnya": 1}
    return max(pool, key=lambda c: (pool[c], c))
