"""Offline checks for the BMKG parsers (no network, no DB):
    python test_bmkg.py
"""
from app.ingest.bmkg import quake_row, warning_row

g = {"Coordinates": "-8.52,115.30", "Magnitude": "5.1", "DateTime": "2026-09-30T02:10:00+00:00",
     "Kedalaman": "12 km", "Wilayah": "Bali", "Potensi": "Tidak berpotensi tsunami"}
row = quake_row(g)
assert row[1] == 5.1 and row[2] == 12.0 and row[-2:] == (115.30, -8.52)   # lon, lat order
assert row[6] == 0                                                         # "Tidak berpotensi" is not a warning
assert quake_row({**g, "Potensi": "Berpotensi tsunami"})[6] == 1
assert quake_row({**g, "Magnitude": "?"}) is None and quake_row({}) is None

cap = """<alert xmlns="urn:oasis:names:tc:emergency:cap:1.2"><identifier>X1</identifier><info>
<event>Hujan Lebat</event><severity>Moderate</severity><area><areaDesc>Sleman</areaDesc>
<polygon>-7.7,110.3 -7.6,110.4 -7.8,110.5</polygon></area></info></alert>"""
w = warning_row(cap)
assert w["id"] == "X1" and w["area"] == "Sleman" and w["headline"] is None
assert w["wkt"] == "MULTIPOLYGON(((110.3 -7.7,110.4 -7.6,110.5 -7.8,110.3 -7.7)))"   # closed, lon lat
assert warning_row(cap.replace("<polygon>-7.7,110.3 -7.6,110.4 -7.8,110.5</polygon>", "")) is None
print("ok")
