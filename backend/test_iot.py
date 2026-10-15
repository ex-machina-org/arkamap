"""Offline checks for accounts and IoT ingest logic (no DB, no keys):
    python test_iot.py
"""
from app.auth import hash_password, hash_key, make_token, new_device_key, verify_password
from app.iot.ingest import Rejected, flatten, parse, parse_alert, type_of
from app.iot.layout import rule_layout
from app.iot.relevance import rule_pick

# passwords
h = hash_password("rahasia123")
assert verify_password("rahasia123", h) and not verify_password("salah", h)
assert hash_password("rahasia123") != h                      # salted
assert not verify_password("x", "rusak")                      # malformed hash is just "no"

# JWT
import jwt
from app.config import JWT_SECRET
assert jwt.decode(make_token(42), JWT_SECRET, algorithms=["HS256"])["sub"] == "42"

# device keys: shown once, stored hashed
key, kh, prefix = new_device_key()
assert key.startswith("dev_") and kh == hash_key(key) and key.startswith(prefix) and kh != key

# flexible payloads
assert flatten({"a": 1, "b": {"c": 2, "d": {"e": 3}}}) == {"a": 1, "b.c": 2, "b.d.e": 3}
assert flatten({"suhu udara!": 1}) == {"suhu_udara_": 1}      # unsafe characters replaced
assert parse('{"nama":"x","kategori":"y","data":{"t":1,"s":{"v":2}}}') == {"t": 1, "s.v": 2}
assert parse({"data": {"t": [1, 2]}}) == {"t": [1, 2]}         # nama/kategori optional, lists kept
for bad in ("nope", '{"nama":"x"}', '{"data":{}}', '{"data":[1]}', "x" * 20000,
            '{"data":{%s}}' % ",".join(f'"f{i}":1' for i in range(101))):
    try:
        parse(bad)
        raise AssertionError(f"should reject {bad[:30]}")
    except Rejected:
        pass
# device alert: two states only, short or with a message
assert parse_alert(None) is None
assert parse_alert(" Bahaya ") == ("bahaya", None, None)
assert parse_alert({"status": "aman", "pesan": "  "}) == ("aman", None, None)
assert parse_alert({"status": "bahaya", "pesan": "Asap terdeteksi"}) == ("bahaya", "Asap terdeteksi", None)
# optional kategori files it under a hazard; empty/"none" is a general device alert
assert parse_alert({"status": "bahaya", "kategori": " Kebakaran "}) == ("bahaya", None, "kebakaran")
assert parse_alert({"status": "aman", "kategori": "none"}) == ("aman", None, None)
for bad in ("waspada", 1, True, {"pesan": "x"}, {"status": None}, {"status": "bahaya", "kategori": "banjir"}):
    try:
        parse_alert(bad)
        raise AssertionError(f"should reject alert {bad!r}")
    except Rejected:
        pass
assert [type_of(v) for v in (1, 2.5, True, "x", None, [1], {})] == \
    ["number", "number", "boolean", "string", "null", "array", "object"]

# rule layout: numbers -> line, lat/lon -> map, technical fields hidden
lay = {w["field"]: w for w in rule_layout([
    {"key": "suhu", "type": "number"}, {"key": "gps.lat", "type": "number"},
    {"key": "pompa", "type": "boolean"}, {"key": "rssi", "type": "number"}])}
assert lay["suhu"]["widget"] == "line" and lay["gps.lat"]["widget"] == "map"
assert lay["pompa"]["widget"] == "status" and lay["rssi"]["hidden"] and not lay["suhu"]["hidden"]

# profile fallback
assert rule_pick("Petani padi")[0]["metric"] == "dry_days"            # responden (default) puts risk first
assert rule_pick("operator PLTS atap")[0]["metric"] == "solar_ghi_annual"
assert rule_pick("mahasiswa")[0]["metric"] == "fire_risk"      # default set
# panels: without the AI an air-quality profile still gets air panels, and only known ids
from app import panels
from app.iot.relevance import rule_reading
air = rule_reading("dinas kesehatan, memantau polusi udara")
assert air["panels"][0]["id"].startswith("aq_") and all(p["id"] in {q["id"] for q in panels.PANELS} for p in air["panels"])
# MQTT naming: the bridge trusts ingest/dev<id>, broker ACL allows only that topic
from app.iot import broker
from app.iot.mqtt_bridge import _TOPIC
assert broker.username(42) == "dev42" and broker.topic(42) == "ingest/dev42"
assert _TOPIC.match("ingest/dev42").group(1) == "42"
assert not _TOPIC.match("ingest/dev42/x") and not _TOPIC.match("ingest/dev_abc")
# fields: every template only uses metrics that exist, and unknown ids fall back
from app import fields
from app.iot.relevance import rule_reading
for f in fields.catalogue():
    assert f["rank"]["sort"] in ("attention", "value_desc") and f["events"] is not None, f["id"]
assert fields.get("tidak-ada")["id"] == "umum"
assert rule_reading("anggota damkar Palangka Raya")["field"] == "pemadam"
assert rule_reading("pemusik jalanan")["field"] == "umum"
# app keys: format like `openssl rand -hex 32`, stored hashed, never equal to device keys
from app import clients
k, kh, kp = clients.new_key()
assert k.startswith("app_") and len(k) == 4 + 64 and kh == hash_key(k) and k.startswith(kp)
assert clients.client_for(None) is False and clients.client_for("") is False
# climate fetch: always one result per location, retries 429, never shifts regions
import httpx
from app.ingest import climate
climate.time.sleep = lambda s: None
calls = []
def handler(req):
    calls.append(1)
    return httpx.Response(429, json={"error": True}) if len(calls) == 1 else httpx.Response(200, json=[{"a": 1}, {"a": 2}])
with httpx.Client(transport=httpx.MockTransport(handler)) as cl:
    assert climate._fetch(cl, "https://x.test/v1", {}, 2) == [{"a": 1}, {"a": 2}] and len(calls) == 2
with httpx.Client(transport=httpx.MockTransport(lambda r: httpx.Response(429, json={"error": True}))) as cl:
    assert climate._fetch(cl, "https://x.test/v1", {}, 3) == [{}, {}, {}]      # gave up: 3 blanks, not 1
with httpx.Client(transport=httpx.MockTransport(lambda r: httpx.Response(200, json=[{"a": 1}]))) as cl:
    assert climate._fetch(cl, "https://x.test/v1", {}, 2) == [{}, {}]          # wrong count: never misalign
with httpx.Client(transport=httpx.MockTransport(lambda r: httpx.Response(200, json={"a": 1}))) as cl:
    assert climate._fetch(cl, "https://x.test/v1", {}, 1) == [{"a": 1}]        # single location unwrapped
# a failed fetch ({}) stores nothing and is reported, never written as 0
got, failed = [], {"wx": [], "aq": [], "fl": []}
climate._air_and_water("r1", {}, {}, lambda *a, **k: got.append(a), failed)
assert got == [] and failed["aq"] == ["r1"] and failed["fl"] == ["r1"]
climate._air_and_water("r2", {"hourly": {"pm2_5": [10, 20, None]}}, {"daily": {"river_discharge": [4.0]}},
                       lambda *a, **k: got.append(a[:2]), failed)
assert ("pm25_mean", 15.0) in got and ("river_discharge", 4.0) in got and "r2" not in failed["aq"]
# layout finalize: lat/lon become one map, arrays become tables; units gate comparisons
from app.iot.layout import finalize, same_unit
lay = finalize([{"field": "lat", "label": "Latitude", "widget": "stat", "compare_metric": None},
                {"field": "lon", "label": "Longitude", "widget": "stat", "compare_metric": None},
                {"field": "samples", "label": "Sampel", "widget": "line", "compare_metric": "x"}],
               [{"key": "lat", "type": "number"}, {"key": "lon", "type": "number"}, {"key": "samples", "type": "array"}])
by = {w["field"]: w for w in lay}
assert by["lat"]["widget"] == "map" and by["lat"]["pair_field"] == "lon" and by["lat"]["label"] == "Lokasi"
assert by["lon"]["hidden"] and by["samples"]["widget"] == "table" and by["samples"]["compare_metric"] is None
assert same_unit("km/h", "km/jam") and same_unit("ug/m3", "µg/m³") and not same_unit("W", "kWh/m²/hari")
assert not same_unit(None, "mm")
print("ok")

# quickstart: examples carry the device's own topic/key and valid code
import ast
import json
from urllib.parse import urlsplit
from app.iot import quickstart
qs = quickstart.build({"id": 7, "name": "Uji", "category": "cuaca"}, "dev_abc")
assert qs["mqtt"]["topic"] == "ingest/dev7" and qs["mqtt"]["username"] == "dev7"
assert parse(qs["payload"]) and all("dev_abc" in v for v in qs["snippets"].values())
for k in ("python", "python_mqtt"):
    ast.parse(qs["snippets"][k])
assert "<API_KEY>" in quickstart.build({"id": 7, "name": "Uji", "category": "cuaca"})["snippets"]["curl"]
# Through the frontend proxy, devices get the frontend's domain, never the backend's.
front = "https://arkamap.example"
quickstart.CORS_ORIGINS.append(front)
assert quickstart.base_for(front + "/") == front
assert quickstart.base_for("https://evil.example") == quickstart.PUBLIC_URL     # not allowed
assert quickstart.base_for("http://arkamap.example") == quickstart.PUBLIC_URL   # not https
assert quickstart.base_for(None) == quickstart.PUBLIC_URL
via = quickstart.build({"id": 7, "name": "Uji", "category": "cuaca"}, "dev_abc", front)
backend_host = urlsplit(quickstart.PUBLIC_URL).hostname
assert via["url"] == front + "/api/ingest" and via["mqtt"]["url"] == "wss://arkamap.example/api/mqtt"
assert backend_host not in json.dumps(via)
quickstart.CORS_ORIGINS.remove(front)
print("quickstart ok")

# fixed categories: rules only where the name is clear, else "lainnya"
from app.iot.categories import CATEGORIES, majority, rule_category
cases = {"suhu": "cuaca", "temp_c": "cuaca", "RH": "cuaca", "tanah.suhu": "tanah", "pm2_5": "kualitas_udara",
         "pm2.5": "kualitas_udara", "co2": "kualitas_udara", "ph": "air", "baterai.volt": "perangkat",
         "gps.lat": "lokasi", "lon": "lokasi", "daya_w": "energi", "gelombang": "laut", "bpm": "kesehatan",
         "val_a": "lainnya", "sensor3": "lainnya", "t1": "lainnya"}
for k, want in cases.items():
    assert rule_category(k) == want, (k, rule_category(k), want)
assert rule_category("val_a", "air") == "air" and rule_category("val_a", "ngawur") == "lainnya"   # payload hint
assert set(CATEGORIES) >= set(cases.values())
assert majority(["cuaca", "cuaca", "perangkat", "lokasi"]) == "cuaca"      # housekeeping doesn't win
assert majority(["perangkat", "lainnya"]) == "perangkat" and majority([]) == "lainnya"

# "waktu": ISO (no zone = WIB) or Unix s/ms; future is refused
from app.iot.ingest import parse_message, digest
_, meta = parse_message({"waktu": "2026-01-01T07:00:00", "data": {"a": 1}})
assert meta["waktu"].isoformat() == "2026-01-01T07:00:00+07:00"
assert parse_message({"waktu": 1767225600, "data": {"a": 1}})[1]["waktu"] == \
       parse_message({"waktu": 1767225600000, "data": {"a": 1}})[1]["waktu"]
for bad in ("kemarin", True, "2999-01-01T00:00:00Z"):
    try:
        parse_message({"waktu": bad, "data": {"a": 1}})
        raise AssertionError(bad)
    except Rejected:
        pass
assert digest({"a": 1, "b": 2}) == digest({"b": 2, "a": 1})             # key order doesn't matter
print("categories/waktu ok")

# "nama" names the data table; during the transition nama/waktu may be missing, with a warning
from app.iot import ingest as iot_ingest
assert iot_ingest.slugify(" Cuaca Luar ") == "cuaca_luar" == iot_ingest.slugify("cuaca luar")
assert iot_ingest.slugify("PM2.5/Udara!") == "pm2.5_udara" and iot_ingest.slugify("!!!") == ""
_, meta = parse_message({"nama": "Cuaca Luar", "waktu": "2026-01-01T07:00:00", "data": {"a": 1}})
assert meta["slug"] == "cuaca_luar" and meta["nama"] == "Cuaca Luar" and meta["warnings"] == []
_, meta = parse_message({"nama": "  ", "data": {"a": 1}})
assert meta["slug"] == "default" and meta["nama"] is None and len(meta["warnings"]) == 2
iot_ingest.IOT_STRICT_PAYLOAD = True
for bad in ({"data": {"a": 1}, "waktu": 1767225600}, {"nama": "x", "data": {"a": 1}}):
    try:
        parse_message(bad)
        raise AssertionError(bad)
    except Rejected:
        pass
iot_ingest.IOT_STRICT_PAYLOAD = False
# per-table field keys "<nama>/<field>": labels drop the table, lat/lon still pair up
lay = {w["field"]: w for w in rule_layout([{"key": "cuaca/suhu", "type": "number"},
                                          {"key": "cuaca/rssi", "type": "number"}])}
assert lay["cuaca/suhu"]["label"] == "suhu" and lay["cuaca/suhu"]["category"] == "cuaca" and lay["cuaca/rssi"]["hidden"]
by = {w["field"]: w for w in finalize(
    [{"field": "lokasi/lat", "label": "lat", "widget": "stat", "compare_metric": None},
     {"field": "lokasi/lon", "label": "lon", "widget": "stat", "compare_metric": None}],
    [{"key": "lokasi/lat", "type": "number"}, {"key": "lokasi/lon", "type": "number"}])}
assert by["lokasi/lat"]["pair_field"] == "lokasi/lon" and by["lokasi/lat"]["label"] == "Lokasi" and by["lokasi/lon"]["hidden"]
assert qs["payload"]["nama"] and qs["payload"]["waktu"] and parse_message(qs["payload"])[1]["warnings"] == []
print("named tables ok")

# modes: the time lens of a profile
from app import modes
from app.api.fieldview import felt_radius_km
assert modes.rule_mode("anggota Basarnas Palu") == "protected"
assert modes.rule_mode("staf Bappeda, perencana tata ruang") == "plan"
assert modes.rule_mode("guru") == "responden" and modes.get("ngawur")["id"] == "responden"
farm = ["rain_30d", "rain_forecast_30d", "dry_days", "water_stress"]
assert modes.order_metrics("plan", farm, set(farm))[:2] == ["rain_30d", "rain_forecast_30d"]
assert modes.order_metrics("protected", ["fire_risk"], {"fire_risk", "population_density"}) == \
       ["fire_risk", "population_density"]                                  # core metric added
lay = modes.layers("protected", [{"type": "points", "endpoint": "/quakes", "params": {"days": 30, "min_mag": 4.5}}])
assert lay[0]["params"] == {"days": 3, "min_mag": 4.5} and lay[-1]["endpoint"] == "/warnings"
assert modes.layers("plan", [{"type": "points", "endpoint": "/hotspots", "params": {"days": 2}}])[0]["params"]["days"] == 30
assert 70 < felt_radius_km(5) < 90 and felt_radius_km(9.5) == 500
from app.iot.relevance import rule_reading
r = rule_reading("tim SAR", "plan")
assert r["mode"] == "plan" and r["mode_by"] == "user"
assert rule_reading("anggota damkar")["mode"] == "protected" and rule_reading("anggota damkar")["mode_by"] == "rule"
print("modes ok")
