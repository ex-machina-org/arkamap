"""Evacuation-site picking (ingest/evac_sites.py): which OSM objects are kept, and the tiling.
No database or network:
    python test_evac_sites.py
"""
import sys
sys.path.insert(0, ".")
from app.ingest.evac_sites import bbox_area, classify, sites_from, tiles


def box(side_m, lat=-7.8):
    """Overpass `bounds` for a square of `side_m` metres."""
    import math
    dlat, dlon = side_m / 110_540, side_m / (111_320 * math.cos(math.radians(lat)))
    return {"minlat": lat, "maxlat": lat + dlat, "minlon": 110.0, "maxlon": 110.0 + dlon}


assert bbox_area(None) is None
assert abs(bbox_area(box(100)) - 7000) < 50                       # 100 m square, bbox x 0.7

mosque = {"amenity": "place_of_worship", "religion": "muslim"}
assert classify(mosque, bbox_area(box(60))) == ("worship", "Masjid")      # ~2,500 m²
assert classify(mosque, bbox_area(box(30))) is None                       # ~630 m², a neighbourhood mosque
assert classify(mosque, None) is None                                     # mapped as a point: size unknown
assert classify({"amenity": "place_of_worship", "religion": "christian"}, bbox_area(box(40))) == ("worship", "Gereja")
assert classify({"amenity": "hospital"}, None) == ("hospital", "Rumah sakit")   # every hospital, even a point
assert classify({"emergency": "assembly_point"}, None) == ("assembly", "Titik kumpul")
assert classify({"leisure": "pitch"}, bbox_area(box(100))) == ("field", "Lapangan")
assert classify({"leisure": "pitch"}, bbox_area(box(30))) is None         # a basketball court
assert classify({"amenity": "school"}, bbox_area(box(50))) is None
assert classify({"amenity": "university"}, bbox_area(box(200))) == ("school", "Kampus")
assert classify({"amenity": "cafe"}, bbox_area(box(200))) is None

elements = [
    {"type": "way", "id": 1, "center": {"lat": -7.8, "lon": 110.4}, "bounds": box(60), "tags": {**mosque, "name": "Masjid Agung"}},
    {"type": "way", "id": 2, "center": {"lat": -7.8, "lon": 110.4}, "bounds": box(20), "tags": mosque},
    {"type": "node", "id": 3, "lat": -7.7, "lon": 110.3, "tags": {"amenity": "hospital", "name": "RS"}},
    {"type": "relation", "id": 4, "tags": {"amenity": "hospital"}},        # no centre: skipped
]
assert [(s["osm_id"], s["kind"], s["area_m2"] is None) for s in sites_from(elements)] == [
    ("way/1", "worship", False), ("node/3", "hospital", True)]

assert tiles(110.0, -8.2, 110.85, -7.5) == [(110.0, -8.2, 110.85, -7.5)]  # DIY fits one tile
assert len(tiles(105.0, -8.0, 108.5, -6.0)) == 4 * 2                     # West Java: 4 x 2
print("ok")
