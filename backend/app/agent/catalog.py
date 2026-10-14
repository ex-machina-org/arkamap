"""Who the agent is (PERSONA.md) and how it answers and which data exists (AGENT.md).

PERSONA.md is Kodama's character and voice. In AGENT.md the rules and the
non-indicator data are hand-written; the
indicator catalog between the katalog markers is generated from the database
(metric_def + indicator_latest), so the agent never promises data the
database does not have:
    python -m app.agent.catalog
Rerun it after adding a metric or when an ingest starts or stops covering a
region level. Values are never read from here: tools fetch them from the
database when an answer shows data.
"""
from functools import lru_cache
from pathlib import Path

PATH = Path(__file__).with_name("AGENT.md")
PERSONA_PATH = Path(__file__).with_name("PERSONA.md")
_DEV_HEADING = "## Untuk pengembang"   # PERSONA.md below this is for the team, not the prompt
_START, _END = "<!-- katalog:mulai -->", "<!-- katalog:selesai -->"
_CATALOG_HEADING = "## Data yang tersedia"

# region topics: key -> (option label, question words, metrics). metric_def.aspect is too coarse
# (nearly everything is "lingkungan"), so the agent keeps its own grouping
TOPICS = {
    "udara": ("Kualitas udara", r"udara|polusi|pm ?2[.,]?5|pm ?10|aqi|ispu|asap|no2|no₂|so2|so₂|sulfur|ozon|o3|o₃|emisi",
              {"pm25_mean", "pm10_mean", "no2_mean", "so2_mean", "co_mean", "o3_max8h",
               "pm25_forecast_max", "aqi_forecast_max"}),
    "cuaca": ("Cuaca dan suhu", r"cuaca|suhu|gerah|(?<!titik )panas|hujan|angin|uv|kering",
              {"temp_max_mean", "temp_max_peak", "heat_index_max", "wet_bulb_max", "uv_index_max",
               "rain_30d", "rain_forecast_30d", "wind_speed", "dry_days"}),
    "kebakaran": ("Kebakaran dan titik panas", r"kebakaran|karhutla|titik panas|hotspot|api",
                  {"fire_risk", "hotspot_count_7d", "hotspot_frp_max", "dry_days"}),
    "gempa": ("Gempa", r"gempa|seismik", {"seismic_hazard", "quake_count_30y", "quake_max_mag_30y"}),
    "air": ("Air dan banjir", r"air bersih|kekeringan|banjir|sungai|debit|air",
            {"water_stress", "river_discharge", "rain_30d", "rain_forecast_30d", "dry_days"}),
    "laut": ("Laut dan gelombang", r"laut|gelombang|ombak|pantai",
             {"sea_surface_temp", "wave_height_max", "wind_speed"}),
    "energi": ("Energi", r"energi|listrik|pembangkit|surya|plts|spklu|matahari",
               {"ev_charging_count", "grid_density", "power_capacity_mw", "solar_ghi", "solar_ghi_annual",
                "solar_rooftop_mwp"}),
    "kota": ("Penduduk dan fasilitas", r"penduduk|jalan|sekolah|kesehatan|rumah sakit|halte|transportasi|"
                                       r"kepadatan|padat|sejahtera|miskin|bangunan",
             {"population_density", "built_density", "road_density", "schools_per_10k",
              "health_facilities_per_10k", "transit_stop_density", "transit_coverage_500m", "wealth_index"}),
}
METRICS = set().union(*(ms for *_, ms in TOPICS.values()))

_COVERAGE_SQL = """
    SELECT m.metric, m.label, m.unit, m.source_id,
           count(*) FILTER (WHERE r.level = 'provinsi') AS prov,
           count(*) FILTER (WHERE r.level = 'kabkota') AS kab,
           max(i.period) AS period
    FROM metric_def m
    LEFT JOIN indicator_latest i ON i.metric = m.metric
    LEFT JOIN region r ON r.id = i.region_id
    GROUP BY m.metric, m.label, m.unit, m.source_id ORDER BY m.metric"""


@lru_cache
def coverage() -> dict[str, dict]:
    """metric -> {label, unit, prov, kab, period}, straight from the database; once per process."""
    from ..db import query
    return {r["metric"]: r for r in query(_COVERAGE_SQL)}


def where(c: dict) -> str:
    """Which region levels have a metric, in words."""
    if c["prov"] and c["kab"]:
        return "provinsi dan kab/kota"
    return "hanya provinsi" if c["prov"] else "hanya kab/kota" if c["kab"] else "belum ada data"


def markdown(rows: list[dict], totals: dict[str, int]) -> str:
    """The catalog section of AGENT.md from coverage rows; a metric in no topic still gets listed."""
    by = {r["metric"]: r for r in rows}
    out, seen = [], set()
    for key, (label, _, metrics) in TOPICS.items():
        have = [by[m] for m in sorted(metrics) if m in by and (by[m]["prov"] or by[m]["kab"])]
        if not have:
            continue
        out += [f"### {label} (topik `{key}`)", "",
                "| metrik | nama | satuan | provinsi | kab/kota | data terbaru |", "|---|---|---|---|---|---|"]
        out += [f"| `{r['metric']}` | {r['label']} | {r['unit'] or '-'} | {r['prov']}/{totals['provinsi']} "
                f"| {r['kab']}/{totals['kabkota']} | {r['period'] or '-'} |" for r in have]
        out.append("")
        seen.update(r["metric"] for r in have)
    other = [r for r in rows if r["metric"] not in METRICS and (r["prov"] or r["kab"])]
    if other:
        out += ["### Lainnya (belum masuk topik mana pun)", ""]
        out += [f"- `{r['metric']}`: {r['label']} ({where(r)})" for r in other] + [""]
    empty = [r for r in rows if not (r["prov"] or r["kab"])]
    if empty:
        out += ["### Belum ada datanya", "",
                "Metrik ini terdaftar tetapi belum berisi data untuk wilayah mana pun. Bila ditanya, jawab "
                "bahwa datanya belum tersedia; jangan ganti dengan data lain.", ""]
        out += [f"- `{r['metric']}`: {r['label']}" for r in empty] + [""]
    return "\n".join(out)


@lru_cache
def text() -> str:
    return PATH.read_text(encoding="utf-8")


@lru_cache
def character() -> str:
    """Kodama's character and voice: PERSONA.md up to its notes for developers."""
    return PERSONA_PATH.read_text(encoding="utf-8").split(_DEV_HEADING)[0].strip()


def persona() -> str:
    """Who the agent is and how it answers: the character, then AGENT.md's rules (everything before its data section)."""
    return character() + "\n\n" + text().split(_CATALOG_HEADING)[0].strip()


def data() -> str:
    """What data exists: the data section, catalog included, without the markers."""
    return (_CATALOG_HEADING + text().split(_CATALOG_HEADING, 1)[1]).replace(_START, "").replace(_END, "").strip()


def write() -> None:
    from ..db import init_pool, query
    init_pool()
    totals = {r["level"]: r["n"] for r in query("SELECT level, count(*) AS n FROM region GROUP BY level")}
    head, rest = text().split(_START)
    PATH.write_text(f"{head}{_START}\n{markdown(query(_COVERAGE_SQL), totals)}{_END}{rest.split(_END, 1)[1]}",
                    encoding="utf-8")


if __name__ == "__main__":
    write()
    print(f"ditulis: {PATH}")
