"""Offline checks for the Agent's safety nets (no DB, no keys):
    python test_agent.py
"""
from app.agent.agent import render_template, unsupported_numbers
from app.agent.router import route_keywords
from app.agent.tools import SKILLS, TOOLS

r = {"tool": "rank_regions", "data": {"results": [{"name": "Riau", "score": 87.5}]}}
assert unsupported_numbers("Riau skor 87.5", [r]) == set()
assert unsupported_numbers("Riau skor 87,50", [r]) == set()      # 87.50 == 87.5
assert unsupported_numbers("| 1 | Riau | 87,5 |", [r]) == set()   # table row no + comma decimal
assert unsupported_numbers("Riau skor 88", [r]) == set()           # rounded
assert unsupported_numbers("Riau skor 92", [r]) == {"92"}
assert unsupported_numbers("Riau punya 12 kejadian", [r]) == {"12"}         # invented
assert route_keywords("peringkat provinsi rawan kebakaran") == "ranking"
assert route_keywords("gempa terbaru") == "events"
assert route_keywords("apa yang perlu diwaspadai") == "alerts"
assert route_keywords("kondisi Riau") == "region"
assert route_keywords("resep rendang") is None and route_keywords("Riau?") is None   # agent decides
assert route_keywords("ada erupsi gunung api?") == "events"
assert route_keywords("banjir bulan ini") == "events"
assert route_keywords("kota mana yang jalannya terpadat?") == "ranking"
assert all(t in TOOLS for s in SKILLS.values() for t in s["tools"])
assert "Riau (87.5)" in render_template([r])
r2 = {"tool": "rank_regions", "data": {"sort": "value_desc", "weights": {"road_density": 1},
      "results": [{"name": "DKI Jakarta", "score": 10.1, "values": {"road_density": 13.488}}]}}
assert "road_density tertinggi: DKI Jakarta (13.49)" in render_template([r2])
empty = {"tool": "rank_regions", "data": {"weights": {"no2_mean": 1}, "level": "provinsi", "results": []}}
assert render_template([empty]) == "Belum ada data no2_mean untuk level provinsi."
# planners in order: a failing or unreadable one hands over to the next; all failing -> keywords
import app.agent.router as rt
P0 = rt.Plan(skill="guide", pemahaman="cara kirim lewat MQTT", topik_panduan="iot_mqtt")
def boom(state, timeout): raise RuntimeError("429")
rt._planners = lambda: [("gemini", boom, 4), ("openrouter", lambda s, t: (None, {"input": 5}), 8),
                        ("deepseek", lambda s, t: (P0, {"input": 7, "output": 3}), 8)]
assert rt.plan("kirim lewat broker") == (P0, {"input": 12, "output": 3}, "deepseek")
rt._planners = lambda: [("gemini", boom, 4)]
assert rt.plan("gempa")[0] is None
assert rt.route("gempa") == ("events", "keyword", None)
assert rt.route("siapa presiden indonesia") == ("off_topic", "keyword", None)
assert rt.route("cara menambahkan alat iot gimana?") == ("guide", "keyword", "iot_tambah")
assert route_keywords("apakah kamu punya data panas?") == "events"
# a JSON-mode planner: code fences stripped, the reply validated against Plan
class R:
    def raise_for_status(self): pass
    def json(self): return {"usage": {"prompt_tokens": 9, "completion_tokens": 4}, "choices": [{"message": {
        "content": '```json\n{"skill": "region", "pemahaman": "AQI Balikpapan", "semua_data": false, "topik_panduan": null}\n```'}}]}
rt.httpx.post, real_post = (lambda *a, **k: R()), rt.httpx.post
assert rt._openai("u", "k", {})("q", 3) == (rt.Plan(skill="region", pemahaman="AQI Balikpapan"), {"input": 9, "output": 4})
rt.httpx.post = real_post
# every LLM failed: Jev picks the skill when sure, keywords when it fails
class J:
    def raise_for_status(self): pass
    def json(self): return {"answers": {"skill": {"choice": "ranking", "probabilities": {"ranking": 0.8}}}}
rt.OPENROUTER_API_KEY, rt.httpx.post = "k", (lambda *a, **k: J())
assert rt.route("provinsi paling rawan") == ("ranking", "jev", None)
rt.httpx.post = boom
assert rt.route("gempa") == ("events", "keyword", None)
rt.OPENROUTER_API_KEY, rt.httpx.post = "", real_post
assert route_keywords("data alat saya ditolak 429 kenapa?") == "my_data"     # their own device first
assert route_keywords("sensor saya masih online?") == "my_data" and route_keywords("cara pasang sensor") == "guide"
# how-to questions route to the guide, data questions keep their skill
assert route_keywords("cara menambahkan alat iot gimana?") == "guide"
assert route_keywords("format json kiriman sensor apa saja?") == "guide"
assert route_keywords("gempa terbaru") == "events" and route_keywords("kondisi Riau") == "region"
from app.agent import guide
assert guide.pick("cara menambahkan alat iot") == "iot_tambah"
assert guide.pick("format payload json esp32") == "iot_kirim"
assert guide.pick("data sensor saya ditolak 401") == "iot_masalah"
assert guide.pick("versi tabel setelah tambah sensor") == "iot_tabel"
assert guide.pick("lupa password") == "akun" and guide.pick("halo") == "umum"
assert guide.pick("gimana kirim data lewat mqtt?") == "iot_mqtt"          # specific beats generic on a tie
# guide text is tool data: its own numbers pass the guard, invented ones do not
g = guide.guide("iot_kirim")
assert unsupported_numbers("Maksimal 16 KB, 100 field, 1 kiriman per detik.", [g]) == set()
assert unsupported_numbers("Maksimal 64 KB per kiriman.", [g]) == {"64"}
assert render_template([g]) == g["data"]["text"]
assert all(t in TOOLS for s in SKILLS.values() for t in s["tools"]) and SKILLS["off_topic"]["tools"] == []
from app.api.agent import check_rate
import app.api.agent as api_agent
api_agent.AGENT_RATE_PER_CLIENT, api_agent.AGENT_RATE_GLOBAL = 2, 3
assert check_rate("user:1", 0) == check_rate("user:1", 1) == (0, "")
assert check_rate("user:1", 2)[1] == "client"          # one user's third chat in a minute waits ...
assert check_rate("ip:9.9.9.9", 2) == (0, "")          # ... without blocking anyone else
assert check_rate("ip:8.8.8.8", 3)[1] == "global"      # until everyone together reaches the shared cap
assert check_rate("user:1", 61) == (0, "")             # a minute later the window has moved on
# the test account is never limited: every chat passes, and none counts toward the shared cap
from app.agent import agent as ag_
tester = {"id": 7, "email": "Arkamap.Test@example.com"}
assert ag_.unlimited(tester) and not ag_.unlimited({"id": 8, "email": "x@example.com"}) and not ag_.unlimited(None)
assert ag_.token_budget(tester) == ag_.NO_BUDGET and ag_.token_budget(None) == ag_.SESSION_TOKEN_BUDGET
before = len(api_agent._hits[api_agent._EVERYONE])
for _ in range(20):
    api_agent._limit(None, tester)
assert len(api_agent._hits[api_agent._EVERYONE]) == before
class Req:
    def __init__(self, h, host="10.0.0.2"): self.headers, self.client = h, type("C", (), {"host": host})
assert api_agent.client_key(Req({}), {"id": 5}) == "user:5"
assert api_agent.client_key(Req({"x-real-ip": "1.2.3.4"}), None) == "ip:1.2.3.4"        # the edge's real client IP
assert api_agent.client_key(Req({}), None) == "ip:10.0.0.2"
assert api_agent.client_key(Req({"x-arkamap-client-ip": "9.8.7.6", "x-real-ip": "76.76.21.21"}), None) == \
    "ip:9.8.7.6"                                          # the visitor behind the Vercel proxy, not Vercel
# session context: only tool output sets the region; follow-up detection
from app.agent.session import remember_region
from app.agent.agent import _REFERS_BACK
ctx = remember_region({}, [{"tool": "region_summary", "data": {"id": "idn.riau", "name": "Riau", "level": "provinsi"}}])
assert ctx["region"]["id"] == "idn.riau"
ctx = remember_region(ctx, [{"tool": "events", "data": {"region": None}}])   # national query keeps it
tctx = remember_region({}, [{"tool": "trend", "data": {"region": {"id": "idn.jambi", "name": "Jambi", "level": "provinsi"}}}])
assert tctx["region"]["id"] == "idn.jambi"                                # "naik atau turun?" next stays in Jambi
assert ctx["region"]["id"] == "idn.riau"
assert _REFERS_BACK.search("bagaimana dengan titik panasnya di sana?")
assert _REFERS_BACK.search("gempa di wilayah itu")
assert not _REFERS_BACK.search("gempa terbaru di Indonesia")
# asking back: options keep the rest of the question and name the place fully
import app.agent.agent as ag
# the catalog as the database would give it (offline: no DB)
ag.catalog.coverage = lambda: {"wave_height_max": {"label": "Gelombang tertinggi (prakiraan 3 hari)", "prov": 30, "kab": 301},
                               "sea_surface_temp": {"label": "Suhu permukaan laut", "prov": 30, "kab": 312},
                               "seismic_hazard": {"label": "Kerawanan gempa", "prov": 34, "kab": 0},
                               "pm25_mean": {"label": "PM2.5 rata-rata", "prov": 34, "kab": 519},
                               "aqi_forecast_max": {"label": "Indeks kualitas udara tertinggi (prakiraan 48 jam)",
                                                    "prov": 34, "kab": 519},
                               "fire_risk": {"label": "Indeks rawan kebakaran", "prov": 34, "kab": 519}}
ag.tools.find_region = lambda n: {"data": {"matches": {
    "Bandung": [{"id": "b", "name": "Bandung", "level": "kabkota"}, {"id": "bb", "name": "Bandung Barat", "level": "kabkota"},
                {"id": "kb", "name": "Kota Bandung", "level": "kabkota"}],
    "Riau": [{"id": "r", "name": "Riau", "level": "provinsi"}, {"id": "kr", "name": "Kepulauan Riau", "level": "provinsi"}],
    "Jakarta": [{"id": "j", "name": "DKI Jakarta", "level": "provinsi"}, {"id": "js", "name": "Kota Jakarta Selatan", "level": "kabkota"}],
    "Sulawesi": [{"id": f"s{i}", "name": f"Sulawesi {d}", "level": "provinsi"} for i, d in enumerate(("Barat", "Selatan", "Tengah"))],
}.get(n, [])}}
name, hits = ag._ambiguous_region("kondisi Bandung hari ini")
assert name == "Bandung" and [h["id"] for h in hits] == ["b", "kb"]          # Bandung Barat is another place
c = ag._region_choices("kondisi Bandung hari ini", name, hits)
assert [o["question"] for o in c["options"]] == ["kondisi Bandung (kabupaten) hari ini", "kondisi Kota Bandung hari ini"]
assert ag._ambiguous_region("kondisi Sulawesi")[0] == "Sulawesi"
real_find = ag.tools.find_region
ag.tools.find_region = lambda n: {"data": {"matches": [{"id": "tl", "name": "Tanah Laut", "level": "kabkota"},
                                                       {"id": "bl", "name": "Banggai Laut", "level": "kabkota"}]
                                           if n.lower() == "laut" else []}}
assert ag._ambiguous_region("saya mau lihat data laut") is None                # a data word, not a place
ag.tools.find_region = real_find
for q in ("kondisi Riau", "kondisi Jakarta", "kondisi Kota Bandung", "gempa di kabupaten Bandung"):
    assert ag._ambiguous_region(q) is None, q
assert ag._for_model({"lat": 1.0, "v": 1890.4312, "s": 0.012345, "x": None, "a": [{"normalised": 3, "k": 2}]}) == \
    {"v": 1890.43, "s": 0.0123, "a": [{"k": 2}]}
# focus: only the topic asked about; everything when asked for all; the topic carries over "di sana"
assert ag._topics_in("bagaimana kualitas udara di Riau?") == ["udara"]
assert ag._topics_in("titik panas di Riau") == ["kebakaran"] and ag._topics_in("cuaca panas di Riau") == ["cuaca"]
assert "pm25_mean" in ag._focus("polusi udara Riau", {}) and "fire_risk" not in ag._focus("polusi udara Riau", {})
assert ag._focus("semua data Riau", {}) is None and ag._focus("kondisi Riau", {}) is None
assert ag._focus("bagaimana di sana?", {"topics": ["gempa"]}) == sorted(ag._TOPICS["gempa"][2])
# the LLM's reading decides the data: "udaranya" names no keyword topic, a named metric shows alone
P = rt.Plan(skill="region", pemahaman="indeks kualitas udara Kota Balikpapan", topik=["udara"])
assert ag._focus("udaranya bersih ga", {"need": ag._need(P)}) == sorted(ag._TOPICS["udara"][2])
W = rt.Plan(skill="region", pemahaman="tinggi gelombang Balikpapan", metrik=["wave_height_max", "karangan"])
assert ag._need(W) == {"all": False, "topik": ["laut"], "metrik": ["wave_height_max"]}   # made-up name dropped
assert ag._need(rt.Plan(skill="region", pemahaman="x", semua_data=True, topik=["laut"]))["all"] is False
assert ag._focus("tinggi gelombang di balikpapan", {"need": ag._need(W)}) == ["wave_height_max"]
assert ag._focus("x", {"need": ag._need(rt.Plan(skill="region", pemahaman="x", semua_data=True))}) is None
assert ag._focus("polusi udara Riau", {}) == sorted(ag._TOPICS["udara"][2])          # no LLM: keywords decide
# one session keeps its data: "kualitas udara nasional" then "detail di Kalimantan" stays on air
ctx = {"topics": ["udara"], "metrics": []}
assert ag._focus("saya mau detail di kalimantan", ctx) == sorted(ag._TOPICS["udara"][2])
assert ag._focus("tinggi gelombang di Bali", ctx) == sorted(ag._TOPICS["laut"][2])        # new data named: it wins
assert ag._focus("bagaimana di Bali?", {"topics": ["laut"], "metrics": ["wave_height_max"]}) == ["wave_height_max"]
assert ag._rank_metric("kab/kota mana yang tertinggi?", {"rank_metric": "pm25_mean"}) == "pm25_mean"
assert ag._focus("semua data Kalimantan Timur", ctx) is None
real_call, ag.tools.call = ag.tools.call, (lambda name, args: {"tool": name, "data": args})
assert ag._fallback_calls("ranking", "kab/kota mana yang tertinggi?", {"rank_metric": "aqi_forecast_max"})[0]["data"] \
    == {"weights": {"aqi_forecast_max": 1}, "sort": "value_desc", "level": "kabkota", "within": None, "include": None}
# "bandingkan dengan wilayah lain" after Kota Balikpapan: other kab/kota by µg/m³, Balikpapan kept in view
bpp = {"region": {"id": "idn2.kota_balikpapan", "name": "Kota Balikpapan", "level": "kabkota"}, "rank_metric": "pm25_mean"}
assert ag._fallback_calls("ranking", "iya coba bandingkan dengan wilayah lain?", bpp)[0]["data"] == \
    {"weights": {"pm25_mean": 1}, "sort": "value_desc", "level": "kabkota", "within": None, "include": "idn2.kota_balikpapan"}
kaltim = {"id": "idn.east_kalimantan", "name": "Kalimantan Timur", "level": "provinsi"}
assert ag._within("kab/kota mana yang tertinggi?", {"region": kaltim}, "kabkota") == kaltim["id"]
assert ag._within("kab/kota mana yang tertinggi se-Indonesia?", {"region": kaltim}, "kabkota") is None
assert ag._within("provinsi mana yang tertinggi?", {"region": kaltim}, "provinsi") is None
ag.tools.call = real_call
# ranking never guesses a metric; options each name one
assert ag._rank_metric("tinggi gelombang", {}) == "wave_height_max"
assert ag._rank_metric("provinsi paling rawan", {}) is None and ag._fallback_calls("ranking", "paling rawan") == []
assert all(ag._rank_metric(o["question"], {}) for o in ag._rank_choices("kota paling rawan")["options"])
assert ag._rank_choices("kota paling rawan")["options"][0]["question"].split()[0] == "kota"
# a topic but no region: the national ranking options name a metric too
w = ag._where_choices("data laut", ["sea_surface_temp", "wave_height_max", "wind_speed"])
assert [ag._rank_metric(o["question"], {}) for o in w["options"]] == ["sea_surface_temp", "wave_height_max"]
assert ag.catalog.where({"prov": 34, "kab": 0}) == "hanya provinsi"
# metric by its own name, longest first: "indeks kualitas udara tertinggi" is AQI, not the "udara" keyword's PM2.5
assert ag._rank_metric("tren indeks kualitas udara tertinggi di Riau", {}) == "aqi_forecast_max"
# trend and facilities: every ask-back option resolves, so a click never asks again
assert all(ag._rank_metric(o["question"], {}) for o in ag._trend_choices("trennya di Riau", {})["options"])
assert [ag._rank_metric(o["question"], {}) for o in ag._trend_choices("tren di Riau", {"topics": ["udara"]})["options"]] \
    == ["aqi_forecast_max", "pm25_mean"]
assert ag._facility_kind("PLTU terbesar di Jawa") == "power_plant" and ag._facility_kind("halte busway") == "transit_stop"
assert all(ag._facility_kind(o["question"]) for o in ag._facility_choices("fasilitas di Jakarta")["options"])
assert ag._facility_kind("listrik rumah saya") is None
assert ag._missing_facility("rumah sakit di Kota Bandung") == "rumah sakit"            # no data yet: say so
assert ag._missing_facility("PLTU dan rumah sakit di Jawa") is None                      # a kind we have wins
assert ag._missing_facility("kondisi udara di Bandung") is None
assert route_keywords("rumah sakit di Kota Bandung") == "facilities"
riau = {"id": "idn.riau", "name": "Riau", "level": "provinsi"}
real_call, ag.tools.call = ag.tools.call, (lambda name, args: {"tool": name, "data": args})
assert ag._fallback_calls("trend", "tren PM2.5 rata-rata seminggu", {"region": riau})[0]["data"] == \
    {"region_id": "idn.riau", "metric": "pm25_mean", "days": 7}
assert ag._fallback_calls("trend", "trennya bagaimana", {}) == []                     # no metric, no region: ask
assert ag._fallback_calls("facilities", "pembangkit listrik nasional")[0]["data"] == {"kind": "power_plant", "region_id": None}
ag.tools.call = real_call
t = {"tool": "trend", "data": {"region": riau, "label": "PM2.5 rata-rata", "unit": "µg/m³", "days": 30,
     "points": [{"period": "2026-10-07", "value": 40.0}, {"period": "2026-10-09", "value": 52.5}],
     "perubahan": {"arah": "naik", "nilai": 12.5, "satuan": "µg/m³", "persen": 31.2,
                   "dari": "2026-10-07", "sampai": "2026-10-09"}}}
assert "Dari 2026-10-07 sampai 2026-10-09 naik 12.5 µg/m³ (31.2%)." in ag.render_template([t])
assert not ag.unsupported_numbers(ag.render_template([t]), [t])                        # the template passes the guard
f = {"tool": "facilities", "data": {"kind": "power_plant", "what": "pembangkit listrik", "region": None,
     "total_count": 136, "total_capacity_mw": 79000.0, "top": [{"name": "PLN Paiton", "capacity_mw": 4825.0}]}}
assert ag.render_template([f]).startswith("136 pembangkit listrik di Indonesia, total 79000.0 MW.")
# the catalog lists what the database has, and says what is empty
md = ag.catalog.markdown([{"metric": "wave_height_max", "label": "Gelombang", "unit": "m", "prov": 30, "kab": 301,
                           "period": "2026-10-09"},
                          {"metric": "road_density", "label": "Kepadatan jalan", "unit": "km/km²", "prov": 0, "kab": 0,
                           "period": None}], {"provinsi": 34, "kabkota": 519})
assert "| `wave_height_max` | Gelombang | m | 30/34 | 301/519 | 2026-10-09 |" in md
assert "### Belum ada datanya" in md and "- `road_density`: Kepadatan jalan" in md
assert all(f"`{m}`" in ag.catalog.text() for m in ag.catalog.METRICS), "AGENT.md: jalankan python -m app.agent.catalog"
assert "Kodama" in ag.SYSTEM and "katalog:mulai" not in ag.catalog.data()
c = ag._topic_choices("kondisi Riau", {"id": "r", "name": "Riau"})
assert c["options"][0]["label"] == "Ringkasan semua data" and ag._focus(c["options"][0]["question"], {}) is None
assert all(ag._focus(o["question"], {}) for o in c["options"][1:])      # every other option picks a topic: no ask loop
assert all(any(w in o["question"] for w in ag._EVENT_WORDS) for o in ag._event_choices("kejadian terbaru")["options"])
# whose region: named > the user's own when they say "saya" > the one under discussion
ag._region_in = lambda q: {"id": "r", "name": "Riau", "level": "provinsi"} if "Riau" in q else None
home, talk = {"id": "h", "name": "Kota Bandung", "level": "kabkota"}, {"id": "t", "name": "Jambi", "level": "provinsi"}
assert ag._target_region("kondisi Riau", {"home": home})["id"] == "r"
assert ag._target_region("gempa di sekitar saya", {"home": home, "region": talk})["id"] == "h"
assert ag._target_region("bagaimana di sana?", {"home": home, "region": talk})["id"] == "t"
assert ag._target_region("gempa terbaru", {"home": home}) is None             # national stays national
assert ag._target_region("gempa di sekitar saya", {}) is None                  # guest: no home
# Gemini stops mid-answer: backups continue from the checked sentences, never redo them
def run(g):
    out = []
    while True:
        try:
            out.append(next(g))
        except StopIteration as stop:
            return out, stop.value
res = [{"tool": "region_summary", "data": {"pm25": 41.2, "n": 3}}]
def gemini():
    yield "token", {"text": "Riau punya PM2.5 41,2 µg/m³. Ada 3 sensor"}
    yield "token", {"text": " aktif. Lalu"}
    raise RuntimeError("429 quota")
seen = {}
def fake_stream(p, system, hist, q, partial, timeout):
    seen[p[0]] = partial
    if p[0] == "openrouter":
        raise RuntimeError("502")
    yield "token", {"text": "Kualitas udara sedang. Skor 99 jelek."}   # 99 is in no tool result
    return {"input": 10, "output": 5}
ag.backup.providers = lambda: [("openrouter",) * 5, ("deepseek",) * 5]
real_stream, ag.backup.stream = ag.backup.stream, fake_stream
st = {"tokens_in": 0, "tokens_out": 0}
events, (text, done, models, why) = run(ag._write(gemini(), lambda: "sys", [], "q", res, [], st))
assert seen == {"openrouter": "Riau punya PM2.5 41,2 µg/m³. Ada 3 sensor aktif. ", "deepseek": seen["openrouter"]}
assert text == "Riau punya PM2.5 41,2 µg/m³. Ada 3 sensor aktif. Kualitas udara sedang. " and not done
assert models == ["gemini", "deepseek"] and "99" in why and {e for e, _ in events} == {"token"}
# OpenAI-style SSE from a backup: prefill without trailing space, continuation's leading space dropped
import contextlib
class Resp:
    def raise_for_status(self): pass
    def iter_lines(self):
        yield ": keep-alive"
        yield 'data: {"choices":[{"delta":{"content":" Kualitas"}}]}'
        yield 'data: {"choices":[{"delta":{"content":" baik."},"finish_reason":"stop"}],"usage":{"prompt_tokens":9,"completion_tokens":2}}'
        yield "data: [DONE]"
sent = {}
ag.backup.httpx.stream = lambda *a, json, **k: (sent.update(json), contextlib.nullcontext(Resp()))[1]
events, usage = run(real_stream(("deepseek", "u", "k", {"model": "m"}, {"prefix": True}), "sys", [], "q", "Ada 3. ", 9))
assert sent["messages"][-1] == {"role": "assistant", "content": "Ada 3.", "prefix": True}
assert "".join(d["text"] for _, d in events) == "Kualitas baik." and usage == {"input": 9, "output": 2}
# own IoT readings: the window, the field (longest name first), the device when two share a field
assert ag._hours_in("rata-rata suhu 6 jam terakhir") == 6 and ag._hours_in("3 hari terakhir") == 72
assert ag._hours_in("suhu kemarin") == 48 and ag._hours_in("riwayat suhu") == 24
mine = [{"device": "Sensor Demo", "device_id": 1, "table": "Sensor Demo", "stream_id": 1, "key": "pm25", "label": "pm25"},
        {"device": "Sensor Demo", "device_id": 1, "table": "Sensor Demo", "stream_id": 1, "key": "suhu", "label": "suhu"},
        {"device": "Demo IoT", "device_id": 3, "table": "cuaca", "stream_id": 3, "key": "suhu", "label": "Suhu luar"},
        {"device": "Demo IoT", "device_id": 3, "table": "cuaca", "stream_id": 3, "key": "lat", "label": "lat"}]
real_fields, ag.tools.my_fields = ag.tools.my_fields, (lambda: mine)
assert ag._readings_request("suhu alat saya sekarang")["hours"] == 24 * 7             # named field: latest + a week
assert ag._readings_request("data alat saya sekarang") is None                        # no field, no window: my_data
assert ag._readings_request("rata-rata pm25 24 jam terakhir") == \
    {"field": "pm25", "device": "Sensor Demo", "table": "Sensor Demo", "hours": 24}
assert ag._readings_request("grafik suhu luar Demo IoT 2 hari")["device"] == "Demo IoT"
assert ag._readings_request("grafik suhu di Demo IoT")["device"] == "Demo IoT"            # device named: its field
assert ag._readings_request("kalau pm25nya naik atau turun?")["field"] == "pm25"         # "-nya" still names it
last = {"reading": {"field": "suhu", "device": "Demo IoT", "table": "cuaca", "hours": 72}}
assert ag._readings_request("naik atau turun?", last) == last["reading"]                  # same sensor, same window
assert ag._readings_request("bagaimana 6 jam terakhir?", last)["hours"] == 6
fc = ag._field_choices("rata-rata 24 jam terakhir")
assert "lat" not in str([o["label"] for o in fc["options"]])                            # coordinates are no sensor data
assert all(ag._readings_request(o["question"]) for o in fc["options"])                   # every option resolves
assert len({o["label"] for o in fc["options"]}) == len(fc["options"])                   # no two options look alike
assert ag._readings_request(fc["options"][2]["question"])["device"] == "Demo IoT"        # and each resolves to its own
ag.tools.my_fields = real_fields
mr = {"tool": "my_readings", "data": {"device": "Sensor Demo", "table": "Sensor Demo", "field": "suhu", "label": "suhu",
      "hours": 24, "count": 10, "stats": {"min": 25.1, "max": 27.4, "mean": 26.2},
      "latest": {"value": 26.1, "time": "2026-10-09 09:53"}}}
assert ag.render_template([mr]).startswith("suhu di Sensor Demo (Sensor Demo), 24 jam terakhir: 10 bacaan, rata-rata 26.2")
assert not ag.unsupported_numbers(ag.render_template([mr]), [mr])
assert ag._iot_source([mr]) == "Data ini dari alat IoT milikmu **Sensor Demo**, tabel **Sensor Demo**, field **suhu**.\n\n"
assert ag._span(168) == "7 hari terakhir" and ag._span(24) == "24 jam terakhir" and ag._span(36) == "36 jam terakhir"
# a region question naming one or two metrics gets their history as charts, only where there is one to draw
real_call = ag.tools.call
ag.tools.call = lambda n, a: {"tool": n, "data": {"points": [1, 2] if a["metric"] == "pm25_mean" else [1]}}
assert [r["data"]["points"] for r in ag._history("x", ["pm25_mean", "no2_mean"], 7)] == [[1, 2]]
assert ag._history("x", ["a", "b", "c"], 7) == [] and ag._history("x", None, 7) == []
ag.tools.call = real_call
md = {"tool": "my_data", "data": {"devices": [{"name": "Sensor Demo", "online": False,
      "tables": [{"name": "Sensor Demo", "latest": {"suhu": 26.1, "pm25": None}}]}]}}
assert ag.render_template([md]) == "Sensor Demo (offline): Sensor Demo: suhu 26.1."
# hotspots: one satellite, no low confidence; MODIS 0-100 confidence on the VIIRS scale
from app.ingest import fire as fire_ingest
assert [fire_ingest.confidence(c) for c in ("0", "29.9", "30", "79", "80", "100", "l", "nominal", None)] == \
    ["low", "low", "nominal", "nominal", "high", "high", "low", "nominal", "nominal"]
from app.api import routes as api_routes
assert api_routes.counted("hotspot") == fire_ingest.COUNTED and api_routes.counted("quake") == "TRUE"
# my_data reads the user from the turn, never from arguments
from app.agent import tools as tl
tl.CURRENT_USER.set(None)
assert tl.call("my_data", {})["error"].startswith("perlu masuk")
# periods in WIB: one day, a range to the end of its last day, clock times, relative days
from datetime import datetime as dt
W = ag.tools.WIB
now = dt(2026, 10, 9, 14, 0, tzinfo=W)
d = lambda *a: dt(*a, tzinfo=W)  # noqa: E731
assert ag._period_in("data tanggal 7 Oktober", now) == (d(2026, 10, 7), d(2026, 10, 8))
assert ag._period_in("dari tanggal 6 sampai 8 Oktober", now) == (d(2026, 10, 6), d(2026, 10, 9))
assert ag._period_in("2026-10-07 sampai 2026-10-08", now) == (d(2026, 10, 7), d(2026, 10, 9))
assert ag._period_in("kemarin jam 8 sampai jam 12", now) == (d(2026, 10, 8, 8), d(2026, 10, 8, 12))
assert ag._period_in("hari ini", now) == (d(2026, 10, 9), d(2026, 10, 10))
assert ag._period_in("suhu 24 jam terakhir", now) is None and ag._period_in("31 Februari", now) is None
# tables: which one, which columns, which period; follow-ups stay on the table under discussion
mine2 = [{"device": "Stasiun", "device_id": 6, "table": "cuaca", "stream_id": 5, "key": k, "label": k.capitalize()}
         for k in ("suhu", "kelembapan", "angin")] + \
        [{"device": "Stasiun", "device_id": 6, "table": "Kualitas Udara", "stream_id": 7, "key": k, "label": k.upper()}
         for k in ("pm10", "pm25")]
real_fields, ag.tools.my_fields = ag.tools.my_fields, (lambda: mine2)
t = ag._table_request("tampilkan tabel cuaca hanya suhu dan kelembapan tanggal 9 Oktober")
assert (t["table"], t["fields"], t["since"][:10]) == ("cuaca", ["kelembapan", "suhu"], "2026-10-09")
assert ag._table_request("tampilkan tabel saya") is None                              # two tables: ask back
assert [o["label"] for o in ag._table_choices("tampilkan tabel saya")["options"]] == ["Kualitas Udara", "cuaca"]
assert all(ag._table_request(o["question"]) for o in ag._table_choices("tampilkan tabel saya")["options"])
assert ag._table_request("tampilkan data pm25")["fields"] == ["pm25"]                  # a column picks its table
assert ag._table_request("rata-rata suhu tabel cuaca") is None                         # a statistic, not rows
last = {"table": {"table": "cuaca", "device": "Stasiun", "fields": ["suhu"], "since": None, "until": None}}
assert ag._table_request("yang tanggal 8 Oktober saja", last) == {"table": "cuaca", "device": "Stasiun",
    "fields": ["suhu"], "limit": 50, "since": "2026-10-08 00:00:00+07:00", "until": "2026-10-09 00:00:00+07:00"}
assert ag._table_request("tampilkan hanya angin", last)["fields"] == ["angin"]
assert ag._table_request("bagaimana cuaca di Riau?", {}) is None                     # no table words, nothing open
r = ag._readings_request("rata-rata suhu tanggal 9 Oktober")
assert r["field"] == "suhu" and r["since"].startswith("2026-10-09")
# names as users really give them: typos, a table inside a longer one, several tables named at once
kal = [{"device": "Stasiun Udara Kaliurang", "device_id": 9, "table": t, "stream_id": i, "key": "suhu", "label": "Suhu Udara"}
       for i, t in enumerate(("Stasiun Udara Kaliurang", "Stasiun Udara Kaliurang (Marsa)", "Dicha Suka NGOCOK",
                              "Rumah Dicha", "Ebony Balikpapan"))]
ag.tools.my_fields = lambda: kal
names = {f["table"] for f in kal}
assert ag._names_in(names, "data statius udara kaliurang tampilkan") == ["Stasiun Udara Kaliurang"]
assert ag._names_in(names, "tabel kaliurang (marsa)") == ["Stasiun Udara Kaliurang (Marsa)"]
assert sorted(ag._names_in(names, "dicha")) == ["Dicha Suka NGOCOK", "Rumah Dicha"]          # partial: both
t = ag._table_request("bagian dicha suka ngocok tampilkan tabelnya selama ini")
assert (t["table"], t["device"], t["limit"]) == ("Dicha Suka NGOCOK", "Stasiun Udara Kaliurang", 200)
amb = "itu bagian dari data statius udara kaliurang (Marsa) yang nama dicha suka ngocok saya mau tampilan tablenya"
assert ag._table_request(amb) is None                                                    # two tables named: ask
c = ag._table_choices(amb)
assert [o["label"] for o in c["options"]] == ["Dicha Suka NGOCOK", "Stasiun Udara Kaliurang (Marsa)"]
assert [ag._table_request(o["question"])["table"] for o in c["options"]] == \
    ["Dicha Suka NGOCOK", "Stasiun Udara Kaliurang (Marsa)"]                             # each click is unambiguous
assert ag._table_request("tampilkan seluruh datanya", {"table": {"table": "Rumah Dicha", "device": "x",
                                                                   "fields": None, "since": None, "until": None}}) \
    == {"table": "Rumah Dicha", "device": "x", "fields": None, "limit": 200}
assert ag.tools._pick(kal, None, "Stasiun Udara Kaliurang")[0]["table"] == "Stasiun Udara Kaliurang"   # exact wins
# the listing counts devices and tables from the data: tables are never called devices
ov = ag._overview({"devices": [{"name": "Stasiun Udara Kaliurang", "online": True,
                                "tables": [{"name": "Stasiun Udara Kaliurang"}, {"name": "Dicha Suka NGOCOK"}]},
                               {"name": "tes", "online": False, "tables": []}]})
assert ov.startswith("Kamu punya 2 alat IoT dengan 2 tabel data:\n- **Stasiun Udara Kaliurang** (online), 2 tabel: "
                     "Stasiun Udara Kaliurang, Dicha Suka NGOCOK.\n- Belum mengirim data: tes.")
assert ag._OVERVIEW.search("aku mau liat data iot ada apa aja yang bisa kulihat")
assert ag._PLACES.search("provinsi dengan PM2.5 tertinggi") and not ag._PLACES.search("pm25 alat saya")
md2 = {"tool": "my_data", "data": {"devices": [{"name": "tes", "online": False, "tables": []}]}}
assert ag.render_template([md2]) == "tes (offline): belum ada data."
ag.tools.my_fields = real_fields
# a table answer's text names the table, rows, columns and period; it never repeats the rows
tb = {"tool": "my_table", "data": {"device": "Stasiun", "table": "cuaca", "columns": [{"key": "suhu", "label": "Suhu"}],
      "rows": [{"waktu": "2026-10-09 12:33", "suhu": 28.8}], "total": 45, "shown": 1, "tidak_ada": ["hujan"],
      "filtered": True}}
assert ag.render_template([tb]) == ("Berikut tabel cuaca dari alat IoT milikmu (Stasiun): 45 baris, Suhu. Yang ditampilkan 1 baris terbaru. "
                                    "Kolom hujan tidak ada di tabel ini.")
assert "28.8" not in ag.render_template([tb])
assert ag._when(d(2026, 10, 7), d(2026, 10, 8)) == "tanggal 7 Oktober 2026"
assert ag._when("2026-10-06T00:00:00+07:00", "2026-10-09T00:00:00+07:00") == "dari 6 Oktober 2026 sampai 8 Oktober 2026"
assert ag._when(d(2026, 10, 9, 10), d(2026, 10, 9, 11, 30)) == "dari 9 Oktober 2026 10.00 sampai 9 Oktober 2026 11.30 WIB"
empty = {**tb["data"], "total": 0, "shown": 0, "since": d(2026, 10, 9, 10), "until": d(2026, 10, 9, 11),
         "table_first": d(2026, 10, 9, 1, 53), "table_last": d(2026, 10, 9, 5, 33)}
assert ag._table_summary(empty) == ("Tidak ada baris di tabel cuaca dari alat IoT milikmu (Stasiun) dari 9 Oktober 2026 10.00 sampai "
                                    "9 Oktober 2026 11.00 WIB. Data tabel ini ada dari 9 Oktober 2026 01.53 sampai "
                                    "9 Oktober 2026 05.33 WIB.")
# Kodama's character: PERSONA.md opens every prompt, its notes for developers stay out
assert ag.SYSTEM.startswith("# Kepribadian Kodama") and "Untuk pengembang" not in ag.SYSTEM and "Aturan menjawab" in ag.SYSTEM
assert "Kepribadian Kodama" in ag.GUIDE_SYSTEM.format(title="t", text="x")
# small talk is answered by Kodama itself; a greeting that carries a question is that question
for q, kind in (("halo", "hello"), ("Halo Kodama!", "hello"), ("selamat pagi kak", "hello"), ("makasih ya", "thanks"),
                ("terima kasih banyak", "thanks"), ("kamu siapa?", "who"), ("apa itu kodama", "who"),
                ("bisa bantu apa aja?", "who"), ("halo, gempa terbaru apa?", None), ("kondisi Riau", None),
                ("ok", "yes"), ("boleh", "yes"), ("iya mau", "yes"), ("oke makasih", "thanks"),
                ("nggak usah dulu", "no"), ("ya", "yes")):
    assert ag._small_talk(q) == kind, (q, ag._small_talk(q))
assert ag.guide.greeting("Dicha Putri", True).startswith("Halo, Dicha! Aku Kodama")
assert "masuk dulu" in ag.guide.greeting(None, False) and ag.guide.thanks(None) == "Sama-sama! Kalau masih ada yang mau dicek, tanya saja."
assert "roh penjaga pohon" in ag.guide.intro(True) and "Anda" not in ag.guide.intro(False) + ag.guide.off_topic(True)
st_ = ag._starters({"id": 1}, {"id": "b", "name": "Kota Bandung"})["options"]
assert st_[0]["question"] == "Bagaimana kualitas udara di Kota Bandung?" and "Data IoT apa saja yang bisa kulihat?" in [o["label"] for o in st_]
assert "Cara menambahkan alat IoT" in [o["label"] for o in ag._starters(None, None)["options"]]
# the stream resumes each step in a fresh context copy: the user must still be there, and no error after done
import contextvars
def fake_turn(q, sid, user):
    yield "start", tl.CURRENT_USER.get()
    yield "done", tl.CURRENT_USER.get()
real_turn, ag._turn = ag._turn, fake_turn
g = ag.chat_events("q", None, {"id": 7})
assert [contextvars.copy_context().run(next, g) for _ in range(2)] == [("start", {"id": 7}), ("done", {"id": 7})]
try:
    contextvars.copy_context().run(next, g)
except StopIteration:
    pass
ag._turn = real_turn
# history charts: the model reads a long line thinned, ending on the latest point
pts = [{"period": i, "value": float(i)} for i in range(100)]
thin = ag._thin(pts)
assert len(thin) == ag._MODEL_POINTS and thin[0] == pts[0] and thin[-1] == pts[-1] and ag._thin(pts[:5]) == pts[:5]
assert ag._for_model({"points": pts})["points"] == ag._for_model(thin)
summ = ag.tools._summary([{"period": "a", "value": 2.0}, {"period": "b", "value": 9.0, "max": 11.0, "min": 1.0},
                          {"period": "c", "value": 4.0}])
assert summ == {"rata_rata": 5.0, "tertinggi": {"nilai": 11.0, "waktu": "b"}, "terendah": {"nilai": 1.0, "waktu": "b"}}
assert ag._days_in("14 hari terakhir", 30) == 14 and ag._days_in("2 minggu", 30) == 14 and ag._days_in("sebulan", 7) == 30
assert ag._days_in("tren gempa", 30) == 30
# comparisons: two regions for one metric, several metrics for one region, never an event count
regions = {"jakarta": [{"id": "idn.jkt", "name": "DKI Jakarta", "level": "provinsi"}],
           "bandung": [{"id": "idn2.bdg", "name": "Bandung", "level": "kabkota"},
                       {"id": "idn2.kbdg", "name": "Kota Bandung", "level": "kabkota"}],
           "riau": [{"id": "idn.riau", "name": "Riau", "level": "provinsi"}]}
real_find, real_cov = ag.tools.find_region, ag.catalog.coverage
ag.tools.find_region = lambda name: {"data": {"matches": regions.get(name.lower(), [])}}
ag.catalog.coverage = lambda: {"pm25_mean": {"label": "PM2.5 rata-rata"}, "rain_30d": {"label": "Hujan 30 hari"},
                               "temp_max_mean": {"label": "Suhu maksimum harian"}}
assert [r["id"] for r in ag._regions_in("PM2.5 Jakarta dan Bandung")] == ["idn.jkt", "idn2.bdg"]
assert ag._compare_request("bandingkan tren PM2.5 Jakarta dan Bandung sebulan terakhir", {}) == \
    {"region_ids": ["idn.jkt", "idn2.bdg"], "metrics": ["pm25_mean"], "days": 30}
assert ag._compare_request("grafik suhu maksimum harian dan hujan 30 hari di Riau 2 minggu", {})["metrics"] == \
    ["temp_max_mean", "rain_30d"]
assert ag._compare_request("PM2.5 Jakarta dan Bandung", {}) is None                 # no time: a ranking
assert ag._compare_request("tren gempa di Jakarta dan Bandung", {}) is None         # events are counted, not compared
assert ag._event_trend_request("tren gempa 14 hari", {}) == {"kind": "quake", "days": 14, "region_id": None}
assert ag._event_trend_request("grafik titik panas di Riau", {})["region_id"] == ag._region_in("Riau")["id"]
assert ag._event_trend_request("gempa minggu ini", {}) is None                       # which quakes, not how many per day
# "lihat hisotrisnya" after a region card: that region's data over time, forecasts left out
assert ag._wants_history("saya mau lihat hisotrisnya") and ag._wants_history("data dari hari ke hari")
assert not ag._wants_history("kualitas udara di Riau") and not ag._wants_history("tampilkan tabel saya")
ag.catalog.coverage = lambda: {"pm25_mean": {"label": "PM2.5 rata-rata"}, "no2_mean": {"label": "NO₂ rata-rata"},
                               "co_mean": {"label": "CO rata-rata"}, "pm25_forecast_max": {"label": "PM2.5 tertinggi (prakiraan 48 jam)"},
                               "aqi_forecast_max": {"label": "Indeks kualitas udara tertinggi (prakiraan 48 jam)"}}
diy = {"region": {"id": "idn.diy", "name": "DI Yogyakarta", "level": "provinsi"}, "topics": ["udara"], "metrics": []}
assert ag._region_history_request("saya mau lihat hisotrisnya", diy) == \
    ("compare", {"region_ids": ["idn.diy"], "metrics": ["pm25_mean", "no2_mean", "co_mean"], "days": 30})
assert ag._region_history_request("riwayat PM2.5 rata-rata 14 hari", diy) == \
    ("trend", {"region_id": "idn.diy", "metric": "pm25_mean", "days": 14})
assert ag._region_history_request("riwayat kualitas udara di sana 30 hari", diy)[1]["metrics"] == \
    ["pm25_mean", "no2_mean", "co_mean"]                                                  # the topic, not PM2.5 alone
assert ag._region_history_request("grafik suhu alat saya", diy) is None                 # the user's own sensor
assert ag._region_history_request("kualitas udara di sana", diy) is None                # no history asked
ag.tools.find_region, ag.catalog.coverage = real_find, real_cov
ag.tools.my_fields = lambda: mine
assert ag._iot_compare_request("grafik suhu dan pm25 Sensor Demo") == \
    {"fields": ["suhu", "pm25"], "device": "Sensor Demo", "table": "Sensor Demo", "hours": 24 * 7}
assert ag._iot_compare_request("suhu alat saya") is None
ag.tools.my_fields = real_fields
cmp_ = {"tool": "compare", "data": {"label": "PM2.5 rata-rata", "series": [
    {"name": "DKI Jakarta", "points": [1], "terakhir": {"nilai": 114.6}, "perubahan": {"arah": "naik", "nilai": 22.33, "persen": 24.2}},
    {"name": "Kab. Bandung", "points": [], "terakhir": None}]}}
assert ag.render_template([cmp_]) == "PM2.5 rata-rata: DKI Jakarta terakhir 114.6, naik 22.33 (24.2%); Kab. Bandung belum ada data."
assert ag._iot_source([{"tool": "my_compare", "data": {"device": "D", "table": "T", "series": [{"label": "suhu"}, {"label": "pm25"}]}}]) == \
    "Data ini dari alat IoT milikmu **D**, tabel **T**, field **suhu**, **pm25**.\n\n"
et = {"tool": "event_trend", "data": {"label": "Gempa", "days": 30, "per": "hari", "region": None, "total": 89,
      "ringkasan": {"rata_rata": 2.97, "tertinggi": {"nilai": 8, "waktu": "2026-10-08"}},
      "paruh": {"awal": 38, "akhir": 51, "arah": "naik"}, "data_sejak": "2026-09-20"}}
assert ag.render_template([et]) == ("89 kejadian gempa dalam 30 hari terakhir, rata-rata 2.97 per hari, terbanyak 8 pada "
                                    "2026-10-08; paruh akhir 51 dibanding paruh awal 38 (naik). Data baru tersimpan sejak 2026-09-20.")
assert not ag.unsupported_numbers(ag.render_template([et]), [et])
assert {"compare", "my_compare", "event_trend"} <= set(TOOLS) and "compare" in SKILLS
# "ringkas kondisi lingkungan" is everything about the region, not a question to ask back
assert ag._focus("Ringkas kondisi lingkungan di Riau", {}) is None and ag._focus("gambaran umum Riau", {}) is None
# options say what is inside; a typed number or label picks one; offers are never continued
real_cov = ag.catalog.coverage
ag.catalog.coverage = lambda: {"pm25_mean": {"label": "PM2.5 rata-rata", "prov": 34, "kab": 519},
                               "no2_mean": {"label": "NO₂ rata-rata", "prov": 34, "kab": 519},
                               "seismic_hazard": {"label": "Kerawanan gempa", "prov": 34, "kab": 0}}
riau = {"id": "idn.riau", "name": "Riau", "level": "provinsi"}
tc = ag._topic_choices("Ringkas kondisi Riau", riau)
assert tc["options"][0]["label"] == "Ringkasan semua data" and len(tc["options"]) == 3
assert {"label": "Kualitas udara", "question": "kualitas udara di Riau", "description": "NO₂ rata-rata, PM2.5 rata-rata"} in tc["options"]
assert tc["question"] == "Ada 2 kelompok data untuk Riau. Mau lihat yang mana?"
assert all(o["label"] != "Gempa" for o in ag._topic_choices("x", {"id": "k", "name": "Sleman", "level": "kabkota"})["options"])
ag.catalog.coverage = real_cov
pend = {"options": ["a?", "b?", "c?"], "labels": ["Gempa", "Titik panas", "Bencana"]}
assert ag._picked("2", pend) == "b?" and ag._picked("nomor 3", pend) == "c?" and ag._picked("yang ke-1", pend) == "a?"
assert ag._picked("titik panas", pend) == "b?" and ag._picked("9", pend) is None and ag._picked("gempa di Aceh", pend) is None
assert all(o.get("description") for o in ag._event_choices("kejadian terbaru")["options"])
summ = [{"tool": "region_summary", "data": {"indicators": [{"metric": "pm25_mean"}, {"metric": "seismic_hazard"}]}}]
ns = ag._next_steps(riau, summ)
assert [o["label"] for o in ns["options"]] == ["Tren kualitas udara", "Bandingkan dengan wilayah lain", "Gempa terbaru", "Peringatan aktif"]
print("ok")

# @mentions from the input's list: written out as the exact own name, else as plain words
own = {"Sensor Balikpapan 01", "cuaca_luar", "Stasiun Udara"}
assert ag._mentions("@Sensor_Balikpapan_01 bagaimana tren PM2.5 minggu ini?", own) == \
    ("Sensor Balikpapan 01 bagaimana tren PM2.5 minggu ini?", ["Sensor Balikpapan 01"])
assert ag._mentions("bandingkan @cuaca_luar dan @Stasiun_Udara.", own) == \
    ("bandingkan cuaca_luar dan Stasiun Udara.", ["cuaca_luar", "Stasiun Udara"])
assert ag._mentions("gempa dari @BMKG_Gempa hari ini", own) == ("gempa dari BMKG Gempa hari ini", [])
assert ag._mentions("kirim ke tim@arkamap.id", own) == ("kirim ke tim@arkamap.id", [])   # an email is no mention
# the input's short topic mentions are the agent's own topic words: "@udara di Riau" asks about Riau's air
for word, topic in (("udara", "udara"), ("cuaca", "cuaca"), ("kebakaran", "kebakaran"), ("gempa", "gempa"),
                    ("air", "air"), ("laut", "laut"), ("energi", "energi"), ("penduduk", "kota")):
    q, hit = ag._mentions(f"@{word} di Riau", own)
    assert hit == [] and topic in ag._topics_in(q), (word, q)
assert ag._mentions("@NASA_FIRMS titik panas hari ini", own)[0] == "NASA FIRMS titik panas hari ini"

