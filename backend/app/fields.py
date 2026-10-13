"""Fields ("bidang"): view templates for the logged-in dashboard.

Users never pick from this list. They describe themselves in their own
words; the AI (iot/relevance.py) maps that to the closest field, or says
plainly when nothing here fits. One entry per field. The frontend builds the logged-in view from this:
which of our metrics to show, which map layers to switch on, which recent
events matter, which metric ranks the neighbouring regions, and which
alerts to surface. Adding a field = adding an entry here.

Layers are calls the frontend makes itself:
  {"type": "choropleth", "metric": m}         -> GET /api/map/{m}
  {"type": "points", "endpoint": e, "params"} -> GET /api{e}?params  (point GeoJSON)
  {"type": "areas", "endpoint": e, "params"}  -> GET /api{e}?params  (polygon GeoJSON)
"""

FIELDS = {
    "pemadam": {
        "label": "Pemadam kebakaran & karhutla",
        "description": "Titik panas, risiko kebakaran, cuaca kering dan angin untuk kesiapsiagaan pemadaman.",
        "metrics": ["fire_risk", "hotspot_count_7d", "hotspot_frp_max", "dry_days", "wind_speed", "temp_max_peak",
                    "wet_bulb_max"],
        "rank": {"metric": "fire_risk", "sort": "attention"},
        "events": ["hotspot", "disaster"],
        "disaster_types": ["wildfire"],
        "layers": [
            {"type": "choropleth", "metric": "fire_risk"},
            {"type": "points", "endpoint": "/hotspots", "params": {"days": 2}},
            {"type": "points", "endpoint": "/disasters", "params": {"type": "wildfire", "days": 30}},
        ],
    },
    "bencana": {
        "label": "Penanggulangan bencana (BPBD/SAR)",
        "description": "Gempa, banjir, erupsi dan kejadian bencana lain beserta kerawanannya.",
        "metrics": ["seismic_hazard", "quake_count_30y", "quake_max_mag_30y", "river_discharge", "rain_30d", "fire_risk"],
        "rank": {"metric": "seismic_hazard", "sort": "attention"},
        "events": ["quake", "disaster"],
        "disaster_types": None,          # all types
        "layers": [
            {"type": "choropleth", "metric": "seismic_hazard"},
            {"type": "points", "endpoint": "/quakes", "params": {"days": 30, "min_mag": 4.5}},
            {"type": "points", "endpoint": "/disasters", "params": {"days": 90}},
            {"type": "areas", "endpoint": "/warnings", "params": {}},
        ],
    },
    "pertanian": {
        "label": "Pertanian & perkebunan",
        "description": "Hujan (30 hari lalu dan prakiraan 30 hari ke depan), hari kering, suhu dan air untuk tanam dan panen.",
        "metrics": ["rain_30d", "rain_forecast_30d", "dry_days", "temp_max_mean", "water_stress",
                    "river_discharge", "fire_risk", "wet_bulb_max"],
        "rank": {"metric": "water_stress", "sort": "attention"},
        "events": ["hotspot", "disaster"],
        "disaster_types": ["flood", "drought", "wildfire"],
        "layers": [
            {"type": "choropleth", "metric": "rain_30d"},
            {"type": "choropleth", "metric": "water_stress"},
        ],
    },
    "kesehatan": {
        "label": "Kesehatan & kualitas udara",
        "description": "Polusi udara (kini dan prakiraan), panas ekstrem, UV dan akses fasilitas kesehatan.",
        "metrics": ["aqi_forecast_max", "pm25_mean", "pm25_forecast_max", "heat_index_max", "uv_index_max",
                    "no2_mean", "health_facilities_per_10k", "hotspot_count_7d"],
        "rank": {"metric": "pm25_mean", "sort": "attention"},
        "events": ["hotspot"],
        "disaster_types": None,
        "layers": [
            {"type": "choropleth", "metric": "pm25_mean"},
            {"type": "points", "endpoint": "/hotspots", "params": {"days": 2}},
        ],
    },
    "energi": {
        "label": "Energi & transisi listrik",
        "description": "Potensi surya, kapasitas pembangkit dan infrastruktur kendaraan listrik.",
        "metrics": ["solar_ghi_annual", "solar_rooftop_mwp", "solar_ghi", "power_capacity_mw", "grid_density", "ev_charging_count"],
        "rank": {"metric": "solar_rooftop_mwp", "sort": "value_desc"},
        "events": [],
        "disaster_types": None,
        "layers": [
            {"type": "choropleth", "metric": "solar_rooftop_mwp"},
            {"type": "choropleth", "metric": "power_capacity_mw"},
        ],
    },
    "tata_kota": {
        "label": "Tata kota & transportasi",
        "description": "Kepadatan, jaringan jalan, transportasi umum, fasilitas dan kesejahteraan.",
        "metrics": ["population_density", "road_density", "transit_stop_density", "transit_coverage_500m",
                    "health_facilities_per_10k", "schools_per_10k", "wealth_index", "no2_mean"],
        "rank": {"metric": "road_density", "sort": "attention"},
        "events": [],
        "disaster_types": None,
        "layers": [
            {"type": "choropleth", "metric": "population_density"},
            {"type": "choropleth", "metric": "road_density"},
        ],
    },
    "lingkungan": {
        "label": "Lingkungan hidup (DLH, peneliti)",
        "description": "Udara, air, kebakaran dan cuaca dalam satu pandangan.",
        "metrics": ["pm25_mean", "no2_mean", "water_stress", "fire_risk", "hotspot_count_7d", "rain_30d"],
        "rank": {"metric": "fire_risk", "sort": "attention"},
        "events": ["hotspot", "disaster"],
        "disaster_types": None,
        "layers": [
            {"type": "choropleth", "metric": "pm25_mean"},
            {"type": "points", "endpoint": "/hotspots", "params": {"days": 7}},
        ],
    },
    "nelayan": {
        "label": "Nelayan & pesisir",
        "description": "Gelombang, suhu laut, angin, peringatan cuaca dan panas untuk melaut dan wilayah pantai.",
        "metrics": ["wave_height_max", "wind_speed", "sea_surface_temp", "heat_index_max", "uv_index_max",
                    "rain_30d"],
        "rank": {"metric": "wave_height_max", "sort": "attention"},
        "events": ["quake", "disaster"],
        "disaster_types": ["cyclone", "flood", "earthquake"],
        "layers": [
            {"type": "choropleth", "metric": "wave_height_max"},
            {"type": "areas", "endpoint": "/warnings", "params": {}},
        ],
    },
    "umum": {
        "label": "Warga / umum",
        "description": "Ringkasan kondisi lingkungan di sekitar Anda.",
        "metrics": ["fire_risk", "aqi_forecast_max", "heat_index_max", "uv_index_max", "rain_30d", "seismic_hazard"],
        "rank": {"metric": "fire_risk", "sort": "attention"},
        "events": ["quake", "disaster"],
        "disaster_types": None,
        "layers": [{"type": "choropleth", "metric": "fire_risk"},
                   {"type": "areas", "endpoint": "/warnings", "params": {}}],
    },
}

DEFAULT = "umum"   # used when nothing fits: a general view, never an empty page


def catalogue() -> list[dict]:
    return [{"id": k, **v} for k, v in FIELDS.items()]


def get(field_id: str | None) -> dict:
    return {"id": field_id, **FIELDS[field_id]} if field_id in FIELDS else {"id": DEFAULT, **FIELDS[DEFAULT]}
