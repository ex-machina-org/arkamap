"""Official limits to read an air value against: is it within the safe limit, and how bad.

The values Arkamap stores are 7-day means of hourly model estimates (CAMS via Open-Meteo,
ingest/climate.py), so they are read against the 24-hour limits: a 7-day mean above a
daily limit means the air stayed above it on average over that week.

- Baku mutu udara ambien nasional, PP No. 22 Tahun 2021 Lampiran VII, 24 jam: PM2.5
  55 µg/m³, PM10 75 µg/m³, NO₂ 65 µg/m³, SO₂ 75 µg/m³.
- WHO Global Air Quality Guidelines 2021: 24 jam PM2.5 15, PM10 45, NO₂ 25, SO₂ 40 µg/m³,
  CO 4 mg/m³; O₃ 8 jam tertinggi 100 µg/m³.
- Kategori ISPU (Permen LHK No. P.14/2020), batas atas Baik/Sedang/Tidak sehat/Sangat
  tidak sehat dalam µg/m³ 24 jam: PM2.5 15,5/55,4/150,4/250,4; PM10 50/150/350/420;
  di atasnya Berbahaya.

Overall air quality follows ISPU: the worst category among the pollutants decides it,
and that pollutant is named as dominant.
- US AQI (US EPA): 0-50 Baik, 51-100 Sedang, 101-150 Tidak sehat bagi kelompok sensitif,
  151-200 Tidak sehat, 201-300 Sangat tidak sehat, 301-500 Berbahaya.
"""

# tingkat: 0 baik, 1 sedang, 2 sensitif, 3 tidak sehat, 4 sangat tidak sehat, 5 berbahaya
_ISPU_PM25 = ((15.5, "Baik", 0), (55.4, "Sedang", 1), (150.4, "Tidak sehat", 3),
              (250.4, "Sangat tidak sehat", 4), (float("inf"), "Berbahaya", 5))
_ISPU_PM10 = ((50, "Baik", 0), (150, "Sedang", 1), (350, "Tidak sehat", 3),
              (420, "Sangat tidak sehat", 4), (float("inf"), "Berbahaya", 5))
_US_AQI = ((50, "Baik", 0), (100, "Sedang", 1), (150, "Tidak sehat bagi kelompok sensitif", 2),
           (200, "Tidak sehat", 3), (300, "Sangat tidak sehat", 4), (float("inf"), "Berbahaya", 5))

STANDARDS = {
    "pm25_mean": {"batas": 55, "batas_nama": "baku mutu nasional PM2.5 24 jam (PP 22/2021)",
                  "pedoman": 15, "pedoman_nama": "pedoman WHO 2021 24 jam",
                  "kategori": _ISPU_PM25, "skala": "kategori ISPU PM2.5 (Permen LHK P.14/2020)"},
    "pm10_mean": {"batas": 75, "batas_nama": "baku mutu nasional PM10 24 jam (PP 22/2021)",
                  "pedoman": 45, "pedoman_nama": "pedoman WHO 2021 24 jam",
                  "kategori": _ISPU_PM10, "skala": "kategori ISPU PM10 (Permen LHK P.14/2020)"},
    "so2_mean": {"batas": 75, "batas_nama": "baku mutu nasional SO₂ 24 jam (PP 22/2021)",
                 "pedoman": 40, "pedoman_nama": "pedoman WHO 2021 24 jam"},
    "o3_max8h": {"pedoman": 100, "pedoman_nama": "pedoman WHO 2021 8 jam"},
    "no2_mean": {"batas": 65, "batas_nama": "baku mutu nasional NO₂ 24 jam (PP 22/2021)",
                 "pedoman": 25, "pedoman_nama": "pedoman WHO 2021 24 jam"},
    "co_mean": {"pedoman": 4000, "pedoman_nama": "pedoman WHO 2021 24 jam (4 mg/m³)"},
    "aqi_forecast_max": {"batas": 100, "batas_nama": "batas kategori Sedang US AQI",
                         "kategori": _US_AQI, "skala": "kategori US AQI (US EPA)"},
}


def standard(metric: str) -> dict | None:
    """The limits of a metric as the UI and the model read them; None = no official limit."""
    s = STANDARDS.get(metric)
    if not s:
        return None
    out = {k: v for k, v in s.items() if k != "kategori"}
    if "kategori" in s:
        # the last band has no upper bound
        out["kategori"] = [{"sampai": None if hi == float("inf") else hi, "nama": name, "tingkat": lvl}
                           for hi, name, lvl in s["kategori"]]
    return out


def assess(metric: str, value: float | None) -> dict | None:
    """One value against its limits: category, level 0-5, and whether it is over the
    official limit and over the WHO guideline. None when the metric has no limit."""
    s = STANDARDS.get(metric)
    if not s or value is None:
        return None
    over_limit = value > s["batas"] if "batas" in s else None
    over_who = value > s["pedoman"] if "pedoman" in s else None
    if "kategori" in s:
        name, level = next((n, lvl) for hi, n, lvl in s["kategori"] if value <= hi)
    elif over_limit:
        name, level = "Melebihi baku mutu", 3
    elif over_who:
        name, level = "Di atas pedoman WHO", 1
    else:
        name, level = "Di bawah pedoman WHO", 0
    out = {"kategori": name, "tingkat": level}
    if over_limit is not None:
        out["melebihi_batas"] = over_limit
    if over_who is not None:
        out["melebihi_pedoman_who"] = over_who
    return out


_LEVELS = ("Baik", "Sedang", "Tidak sehat bagi kelompok sensitif", "Tidak sehat", "Sangat tidak sehat", "Berbahaya")
# the measured pollutants an overall verdict weighs; forecasts and the AQI index are not measurements
POLLUTANTS = ("pm25_mean", "pm10_mean", "no2_mean", "so2_mean", "o3_max8h", "co_mean")
_SHORT = {"pm25_mean": "PM2.5", "pm10_mean": "PM10", "no2_mean": "NO₂", "so2_mean": "SO₂",
          "o3_max8h": "O₃", "co_mean": "CO"}


def overall(values: dict[str, float | None]) -> dict | None:
    """Air quality from every pollutant there is a value for, as ISPU reads it: the worst
    category decides, and the pollutant(s) behind it are dominant. Also which pollutants
    were weighed, which are over their official limit, and which have no data."""
    rated = {m: assess(m, values.get(m)) for m in POLLUTANTS if values.get(m) is not None}
    if not rated:
        return None
    worst = max(r["tingkat"] for r in rated.values())
    # the ISPU word when a particle sets the level, else the plain word for that level
    particle = [r["kategori"] for m, r in rated.items() if m in ("pm25_mean", "pm10_mean") and r["tingkat"] == worst]
    return {"tingkat": worst, "kategori": particle[0] if particle else _LEVELS[worst],
            "dominan": [_SHORT[m] for m, r in rated.items() if r["tingkat"] == worst] if worst else [],
            "melebihi_batas": [_SHORT[m] for m, r in rated.items() if r.get("melebihi_batas")],
            "melebihi_pedoman_who": [_SHORT[m] for m, r in rated.items() if r.get("melebihi_pedoman_who")],
            "dinilai": [_SHORT[m] for m in rated], "belum_ada": [_SHORT[m] for m in POLLUTANTS if m not in rated]}


if __name__ == "__main__":
    assert assess("pm25_mean", 12) == {"kategori": "Baik", "tingkat": 0, "melebihi_batas": False, "melebihi_pedoman_who": False}
    assert assess("pm25_mean", 33.4)["kategori"] == "Sedang" and assess("pm25_mean", 33.4)["melebihi_pedoman_who"]
    assert assess("pm25_mean", 170.85) == {"kategori": "Sangat tidak sehat", "tingkat": 4, "melebihi_batas": True,
                                           "melebihi_pedoman_who": True}
    assert assess("pm25_mean", 300)["kategori"] == "Berbahaya"
    assert assess("no2_mean", 70)["kategori"] == "Melebihi baku mutu" and assess("no2_mean", 6)["tingkat"] == 0
    assert assess("co_mean", 535)["kategori"] == "Di bawah pedoman WHO" and "melebihi_batas" not in assess("co_mean", 535)
    assert assess("aqi_forecast_max", 142)["kategori"] == "Tidak sehat bagi kelompok sensitif"
    assert assess("rain_30d", 200) is None and standard("rain_30d") is None
    assert standard("pm25_mean")["kategori"][-1] == {"sampai": None, "nama": "Berbahaya", "tingkat": 5}
    assert assess("pm10_mean", 60)["kategori"] == "Sedang" and assess("so2_mean", 80)["kategori"] == "Melebihi baku mutu"
    assert assess("o3_max8h", 120)["kategori"] == "Di atas pedoman WHO"
    ov = overall({"pm25_mean": 33.4, "no2_mean": 6.2, "co_mean": 534.7, "pm10_mean": None})
    assert ov == {"tingkat": 1, "kategori": "Sedang", "dominan": ["PM2.5"], "melebihi_batas": [],
                  "melebihi_pedoman_who": ["PM2.5"], "dinilai": ["PM2.5", "NO₂", "CO"], "belum_ada": ["PM10", "SO₂", "O₃"]}
    ov = overall({"pm25_mean": 10, "so2_mean": 90})          # a gas over its limit decides, even with clean particles
    assert ov["tingkat"] == 3 and ov["kategori"] == "Tidak sehat" and ov["dominan"] == ["SO₂"] and ov["melebihi_batas"] == ["SO₂"]
    assert overall({"pm25_mean": 5, "no2_mean": 3})["dominan"] == [] and overall({}) is None
    from app.ingest.climate import ozone_max8h
    assert ozone_max8h([10] * 8 + [50] * 8) == 50 and ozone_max8h([None] * 10) is None
    print("ok")
