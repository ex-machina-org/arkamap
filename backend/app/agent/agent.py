"""Planner + executor.

Flow: router.plan(question) (an LLM reads it with the data catalog of
AGENT.md: skill, data topics, metrics; Jev then keywords pick the skill when
every LLM fails) -> by skill, the cheapest path that can answer:
  off_topic  fixed reply, no model call
  guide      the guide text fetched up front, then ONE Gemini call without
             tools to phrase it for the question; the text itself if Gemini
             is off, over budget or fails
  data skills  Gemini tool-calling loop limited to that skill's tools
Guard: every number in the answer must appear in a tool result (the guide
text counts as one). It runs per sentence while streaming, and a sentence
reaches the reader only once it passes, so shown text is never taken back.
If Gemini fails or writes an unsupported number, the backups (backup.py:
OpenRouter, then DeepSeek) continue from the last shown sentence; only when
all fail is a template built from tool output appended, so figures are
never invented.
"""
import json
import logging
import re
import time
import uuid
from datetime import date, datetime, timedelta
from difflib import get_close_matches

from ..config import (AGENT_UNLIMITED_EMAILS, GEMINI_API_KEY, HISTORY_ANSWER_CHARS, HISTORY_TURNS,
                      LLM_MAX_OUTPUT_TOKENS, LLM_MODEL, SESSION_TOKEN_BUDGET)
from ..db import query_one
from . import backup, catalog, guide, router, session, tools
from .router import route
from .standards import POLLUTANTS, standard

log = logging.getLogger(__name__)

MAX_STEPS = 4
# The edge proxy gives up after 30 s; reading the question (LLM planners up to
# 9 s together, Jev up to 3 s only when they all fail) comes first, so the whole
# LLM loop must finish in this many seconds or fall back.
LLM_DEADLINE_S = 17
# "di sana", "wilayah itu", "-nya": the question points back at the region
# already under discussion instead of naming one.
_REFERS_BACK = re.compile(r"\b(di ?sana|di ?situ|sana|situ|wilayah itu|daerah itu|provinsi itu|"
                          r"tersebut|tadi)\b|\w+nya\b", re.I)

# who the agent is and how it answers: AGENT.md, before its data section
SYSTEM = catalog.persona() + "\n\nWAJIB memanggil tool untuk data."

# Kodama's character first; braces escaped because the rest is a str.format template
GUIDE_SYSTEM = catalog.character().replace("{", "{{").replace("}", "}}") + "\n\n" + (
    "Jawab ringkas dan langsung ke langkahnya, HANYA "
    "berdasarkan PANDUAN di bawah. Jangan menambah langkah, menu, angka, atau fitur yang tidak ada di "
    "panduan; bila panduan tidak mencakup pertanyaannya, katakan belum ada panduannya dan sebutkan "
    "bagian panduan yang paling dekat. Sebut data dengan namanya, bukan kode metrik (wave_height_max). "
    "Boleh memakai daftar bernomor.\n\nPANDUAN ({title}):\n{text}"
)

_NUM = re.compile(r"\d+(?:[.,]\d+)*")
_ORDINAL = re.compile(r"^\s*\|?\s*\d+\s*[|.)]", re.M)  # "1." / "| 4 |" list and table row numbers


def _candidates(tok: str) -> list[float]:
    """Indonesian ('2.218,7') and English ('2,218.7') both occur; '5.27' could be
    a decimal or 'five thousand...' so return every plausible reading."""
    out = []
    for t in (tok.replace(".", "").replace(",", "."),   # id: dot = thousands
              tok.replace(",", "")):                    # en: comma = thousands
        try:
            out.append(float(t))
        except ValueError:
            pass
    return out


def _decimals(tok: str) -> int:
    m = re.search(r"[.,](\d+)$", tok)
    return len(m.group(1)) if m and len(m.group(1)) != 3 else (len(m.group(1)) if m else 0)


def unsupported_numbers(answer: str, results: list[dict]) -> set[str]:
    """Numbers in `answer` that no tool result supports. A number is supported
    if some result value, rounded to the answer's precision, equals it (x100
    also allowed for shares shown as percent). List/table row numbers are
    ignored."""
    src = json.dumps([r.get("data") for r in results], default=str)
    allowed = [float(t) for t in re.findall(r"\d+(?:\.\d+)?", src)]
    allowed += [a * 100 for a in allowed if a <= 1]
    bad = set()
    for tok in _NUM.findall(_ORDINAL.sub("", answer)):
        ok = False
        for c in _candidates(tok):
            for d in {_decimals(tok), 0, 1, 2}:  # answer may round harder than it shows
                if any(round(a, d) == round(c, d) for a in allowed):
                    ok = True
        if not ok:
            bad.add(tok)
    return bad


# ── fallback: deterministic tool choice + template answer ──
def _region_in(q: str) -> dict | None:
    """First region named in the question: longest word runs first, so
    'Sulawesi Tengah' beats 'Sulawesi'."""
    words = re.findall(r"[A-Za-z]+", q)
    for n in (3, 2, 1):
        for i in range(len(words) - n + 1):
            name = " ".join(words[i:i + n])
            if len(name) > 3:
                m = tools.find_region(name)["data"]["matches"]
                # "balikpapan" names Kota Balikpapan when no kabupaten shares the name
                if m and m[0]["name"].lower() in (name.lower(), f"kota {name.lower()}"):
                    return m[0]
    return None


# "wilayah saya", "sekitar saya": the signed-in user's own monitoring region
_MINE = re.compile(r"\b(saya|aku|kami|sekitarku|wilayahku|daerahku|lokasiku)\b", re.I)


def _target_region(q: str, context: dict) -> dict | None:
    """The region a question is about: one it names, else the user's own
    (context["home"], from the active profile) when it says "saya", else the
    one under discussion when it points back ("di sana")."""
    named = _region_in(q)
    if named:
        return named
    if context.get("home") and _MINE.search(q):
        return context["home"]
    if context.get("region") and _REFERS_BACK.search(q):
        return context["region"]
    return None


def _regions_in(q: str) -> list[dict]:
    """Every region the question names, in the order it names them ("Jakarta dan
    Bandung"); longer word runs first, and a word belongs to one region only."""
    words = re.findall(r"[A-Za-z]+", q)
    used, found = set(), []
    for n in (3, 2, 1):
        for i in range(len(words) - n + 1):
            span = set(range(i, i + n))
            name = " ".join(words[i:i + n])
            if used & span or len(name) <= 3:
                continue
            m = tools.find_region(name)["data"]["matches"]
            hit = next((x for x in m if x["name"].lower() in (name.lower(), f"kota {name.lower()}")), None)
            # "Jakarta": no region by that very name, but one province carries it (DKI Jakarta)
            prov = [x for x in m if x["level"] == "provinsi" and re.search(rf"\b{re.escape(name)}\b", x["name"], re.I)]
            hit = hit or (prov[0] if len(prov) == 1 else None)
            if hit:
                used |= span
                if all(hit["id"] != r["id"] for _, r in found):
                    found.append((i, hit))
    return [r for _, r in sorted(found, key=lambda x: x[0])]


# ── asking back: when the question can mean several things ──
_QUALIFIER = re.compile(r"\b(kota|kabupaten|kab|provinsi)\b", re.I)


def _ambiguous_region(q: str) -> tuple[str, list[dict]] | None:
    """(the name, the regions it could mean) when a short name fits several:
    "Bandung" is a kabupaten and a kota, "Sulawesi" five provinces. None when
    the question already pins one down ("Kota Bandung", "Riau", "Jakarta")."""
    if _QUALIFIER.search(q):
        return None
    words = re.findall(r"[A-Za-z]+", q)
    for n in (3, 2, 1):
        for i in range(len(words) - n + 1):
            name = " ".join(words[i:i + n])
            if len(name) <= 3:
                continue
            hits = [x for x in tools.find_region(name)["data"]["matches"]
                    if re.search(rf"\b{re.escape(name)}\b", x["name"], re.I)]
            if not hits:
                continue
            exact = [x for x in hits if x["name"].lower() == name.lower()]
            kota = [x for x in hits if x["name"].lower() == f"kota {name.lower()}"]
            if not (exact or kota) and _topics_in(name):
                continue   # "data laut" asks for sea data, not for Tanah Laut or Banggai Laut
            if exact:
                return (name, exact + kota) if kota else None   # kabupaten X or Kota X
            if sum(x["level"] == "provinsi" for x in hits) == 1:
                return None                                    # "Jakarta" -> DKI Jakarta
            return (name, hits) if len(hits) > 1 else None
    return None


def _region_choices(q: str, name: str, hits: list[dict]) -> dict:
    opts = []
    for x in hits[:6]:
        label = (f"{x['name']} (kabupaten)" if x["level"] == "kabkota" and not x["name"].lower().startswith("kota ")
                 else x["name"])
        opts.append({"label": label, "question": re.sub(re.escape(name), label, q, count=1, flags=re.I)})
    return {"question": f"\"{name}\" bisa berarti beberapa wilayah. Yang mana maksudmu?", "options": opts}


_TOPICS = catalog.TOPICS
# everything about a region: "semua data", but also "ringkas kondisi lingkungan", "gambaran umum"
_ALL = re.compile(r"\b(semua|seluruh|lengkap|keseluruhan|semuanya|ringkas(an|kan)?|rangkum(an|kan)?|gambaran|"
                  r"overview|kondisi lingkungan|secara umum)\b", re.I)


def _topics_in(q: str) -> list[str]:
    return [k for k, (_, words, _) in _TOPICS.items() if re.search(rf"\b(?:{words})\b", q, re.I)]


def _wanted(q: str, context: dict) -> tuple[list[str], list[str]]:
    """(topics asked about, specific metrics asked about). This turn's LLM
    reading (context["need"]) when there is one, else the topics the question
    names, else the ones under discussion when it points back ("di sana").
    ([], []) = all data (asked for everything, or no topic at all)."""
    need = context.get("need") or {}
    if need.get("all") or _ALL.search(q):
        return [], []
    if need.get("topik") or need.get("metrik"):
        return need.get("topik", []), need.get("metrik", [])
    # a follow-up that names no data ("detail di Kalimantan") stays on the data under discussion
    return _topics_in(q) or context.get("topics", []), [] if _topics_in(q) else context.get("metrics", [])


def _metrics(topics: list[str]) -> list[str] | None:
    return sorted(set().union(*(_TOPICS[k][2] for k in topics))) if topics else None


def _focus(q: str, context: dict) -> list[str] | None:
    """Metrics a region answer uses and shows: the metrics asked about ("tinggi
    gelombang"), else their topics ("data laut"); None = all."""
    topics, metrics = _wanted(q, context)
    return sorted(metrics) or _metrics(topics)


def _need(plan) -> dict:
    """The data the LLM read in the question; metric names it made up are dropped."""
    metrics = [m for m in plan.metrik if m in catalog.METRICS]
    topics = list(plan.topik) or [k for k, (*_, ms) in _TOPICS.items() if ms & set(metrics)]
    # a reading that names data is not "everything", whatever the flag says
    return {"all": plan.semua_data and not topics, "topik": topics, "metrik": metrics}


def _short(label: str) -> str:
    """A metric's name without its window or note: "PM2.5 tertinggi (prakiraan 48 jam)" -> "PM2.5 tertinggi"."""
    return label.split(" (")[0]


def _topic_choices(q: str, region: dict) -> dict:
    """Which data about a region: a summary of everything first, then each topic that has data
    at the region's level, each saying what is inside, so nobody has to ask what there is."""
    cov = catalog.coverage()
    lvl = "prov" if region.get("level") == "provinsi" else "kab"
    opts = [{"label": "Ringkasan semua data", "question": f"ringkasan semua data {region['name']}",
             "description": "Sorotan tiap topik: udara, cuaca, kebakaran, gempa, air, laut, energi, penduduk"}]
    for label, _, metrics in _TOPICS.values():
        have = [_short(cov[m]["label"]) for m in sorted(metrics) if m in cov and cov[m].get(lvl)]
        if have:
            opts.append({"label": label, "question": f"{label.lower()} di {region['name']}",
                         "description": ", ".join(have[:5]) + (f", +{len(have) - 5} lainnya" if len(have) > 5 else "")})
    return {"question": f"Ada {len(opts) - 1} kelompok data untuk {region['name']}. Mau lihat yang mana?", "options": opts}


def _next_steps(region: dict, results: list[dict]) -> dict | None:
    """After a summary of a region: where to go next, from what the summary showed."""
    d = next((r["data"] for r in results if r["tool"] == "region_summary" and not r.get("error")), None)
    if not d:
        return None
    have = {i["metric"] for i in d["indicators"]}
    name = region["name"]
    opts = [o for o, need in (
        ({"label": "Tren kualitas udara", "question": f"riwayat kualitas udara di {name} 30 hari",
          "description": "Grafik PM2.5 dan polutan lain dari hari ke hari"}, "pm25_mean"),
        ({"label": "Bandingkan dengan wilayah lain", "question": f"bandingkan PM2.5 {name} dengan wilayah lain",
          "description": "Peringkat PM2.5 dengan posisi wilayah ini"}, "pm25_mean"),
        ({"label": "Titik panas terbaru", "question": f"titik panas di {name} 7 hari terakhir",
          "description": "Lokasi titik panas satelit dan tren hariannya"}, "hotspot_count_7d"),
        ({"label": "Gempa terbaru", "question": f"gempa di {name} 30 hari terakhir",
          "description": "Gempa tercatat di sekitar wilayah ini"}, "seismic_hazard"),
        ({"label": "Peringatan aktif", "question": "apa yang perlu diwaspadai sekarang?",
          "description": "Peringatan cuaca BMKG, gempa, dan wilayah yang perlu perhatian"}, None),
    ) if need is None or need in have]
    return {"question": "Mau lanjut ke mana?", "options": opts[:5]} if opts else None


def _where_choices(q: str, metrics: list[str]) -> dict:
    """A data topic but no region: name one, or see the national ranking of each metric that has data."""
    cov = catalog.coverage()
    opts = [{"label": f"Peringkat: {cov[m]['label']}",
             "question": f"provinsi dengan {cov[m]['label'].split(' (')[0].lower()} tertinggi"}
            for m in metrics if m in cov and cov[m]["prov"]][:4]
    return {"question": "Untuk wilayah mana? Tulis nama provinsi atau kab/kota, atau lihat peringkat nasionalnya:",
            "options": opts}


_RANK_CHOICES = (("Rawan kebakaran", "paling rawan kebakaran"), ("Kerawanan gempa", "paling rawan gempa"),
                 ("Polusi udara (PM2.5)", "dengan PM2.5 tertinggi"), ("Gelombang laut", "dengan gelombang tertinggi"),
                 ("Tekanan air bersih", "dengan tekanan air bersih tertinggi"),
                 ("Kepadatan penduduk", "dengan penduduk terpadat"))


def _rank_choices(q: str) -> dict:
    """A ranking without a metric: which one (never a silent default)."""
    level = "kota dan kabupaten" if re.search(r"\b(kota|kabupaten|kab)\b", q, re.I) else "provinsi"
    return {"question": f"Peringkat {level} bisa menurut beberapa data. Pilih salah satu:",
            "options": [{"label": label, "question": f"{level} {tail}", "description": what}
                        for (label, tail), what in zip(_RANK_CHOICES, (
                            "Indeks rawan kebakaran 0-100", "Indeks kerawanan gempa 0-100",
                            "PM2.5 rata-rata 7 hari, µg/m³", "Gelombang tertinggi prakiraan 3 hari, m",
                            "Indeks tekanan air bersih 0-100", "Jiwa per km²"))]}


_EVENT_CHOICES = (("Gempa", "gempa", "USGS, EMSC, BMKG; magnitudo dan lokasi"),
                  ("Titik panas", "titik panas", "Satelit NASA FIRMS; bukan konfirmasi kebakaran"),
                  ("Bencana lain (banjir, erupsi)", "bencana", "GDACS dan NASA EONET: banjir, erupsi, siklon"))


def _event_choices(q: str) -> dict:
    return {"question": "Ada tiga jenis kejadian yang dicatat Arkamap. Mau lihat yang mana?",
            "options": [{"label": label, "question": f"{q} ({word})", "description": what}
                        for label, word, what in _EVENT_CHOICES]}


def _days_in(q: str, default: int) -> int:
    if m := re.search(r"(\d+)\s*(hari|minggu|pekan|bulan|tahun)", q, re.I):
        return min(int(m.group(1)) * {"hari": 1, "minggu": 7, "pekan": 7, "bulan": 30, "tahun": 365}[m.group(2).lower()], 365)
    ql = q.lower()
    for w, d in (("hari ini", 1), ("minggu", 7), ("pekan", 7), ("bulan", 30), ("tahun", 365)):
        if w in ql:
            return d
    return default


# ranking: question word -> metric; first match wins, so specific phrases come before generic ones
_RANK_METRICS = (("titik panas", "hotspot_count_7d"), ("hotspot", "hotspot_count_7d"),
                 ("kebakaran", "fire_risk"), ("gempa", "seismic_hazard"),
                 ("gelombang", "wave_height_max"), ("ombak", "wave_height_max"),
                 ("suhu laut", "sea_surface_temp"), ("permukaan laut", "sea_surface_temp"),
                 ("pm2", "pm25_mean"), ("pm 2", "pm25_mean"), ("hujan", "rain_30d"),
                 ("sungai", "river_discharge"), ("uv", "uv_index_max"), ("angin", "wind_speed"),
                 ("suhu", "temp_max_mean"),
                 ("lalu lintas", "no2_mean"), ("no2", "no2_mean"),
                 ("kendaraan", "no2_mean"), ("jalan", "road_density"),
                 ("halte", "transit_stop_density"),
                 ("transjakarta", "transit_coverage_500m"),
                 ("kesehatan", "health_facilities_per_10k"),
                 ("rumah sakit", "health_facilities_per_10k"),
                 ("sekolah", "schools_per_10k"), ("spklu", "ev_charging_count"),
                 ("penduduk", "population_density"), ("padat", "population_density"),
                 ("mobil listrik", "ev_charging_count"),
                 ("pembangkit", "power_capacity_mw"),
                 ("sejahtera", "wealth_index"), ("miskin", "wealth_index"),
                 ("udara", "pm25_mean"), ("surya", "solar_rooftop_mwp"),
                 ("air", "water_stress"), ("api", "fire_risk"))
_EVENT_WORDS = ("panas", "hotspot", "gempa", "erupsi", "gunung", "banjir", "bencana", "siklon",
                "kekeringan", "longsor", "kebakaran hutan")


def _metrics_named(q: str, context: dict) -> list[str]:
    """Every metric the question names, in order: the LLM's reading, else metric
    names ("PM2.5 rata-rata") and question words ("hujan"), each counted once."""
    if metrics := (context.get("need") or {}).get("metrik"):
        return metrics
    ql, out = q.lower(), []
    labels = sorted(((c["label"].split(" (")[0].lower(), m) for m, c in catalog.coverage().items()),
                    key=lambda lm: -len(lm[0]))
    for word, m in labels + list(_RANK_METRICS):
        if m not in out and re.search(rf"(?<![a-z0-9]){re.escape(word)}", ql):
            out.append(m)
            ql = ql.replace(word, " ")   # "PM2.5 rata-rata" is not also "udara"
    return out


def _rank_metric(q: str, context: dict) -> str | None:
    """The metric a ranking is about: the one the LLM read, else a question word; None = not named."""
    if metrics := (context.get("need") or {}).get("metrik"):
        return metrics[0]
    ql = q.lower()
    # a metric's own name ("PM2.5 rata-rata", longest first), then a question word,
    # else the metric under discussion ("lalu kab/kota mana yang tertinggi?")
    labels = sorted(((c["label"].split(" (")[0].lower(), m) for m, c in catalog.coverage().items()),
                    key=lambda lm: -len(lm[0]))
    return (next((m for label, m in labels if label in ql), None)
            or next((m for w, m in _RANK_METRICS if w in ql), None) or context.get("rank_metric")
            or next(iter(context.get("metrics", [])), None))


# "bandingkan dengan wilayah lain": the region under discussion against the rest
_OTHERS = re.compile(r"\b(wilayah|daerah|kota|kabupaten|provinsi) lain(nya)?\b|\bbandingkan\b|\bdibanding(kan)?\b", re.I)

_FACILITY_WORDS = ((r"pembangkit|pltu|pltg|pltgu|pltd|plta|power plant", "power_plant"),
                   (r"halte|transjakarta|busway", "transit_stop"))


# a question about readings over time, not only the latest value
_HISTORY = re.compile(r"\b(riwayat|tren|grafik|rata-?rata|rerata|tertinggi|terendah|maksimum|minimum|maks|min|naik|"
                      r"turun|perubahan|statistik|selama|sejak|kemarin|\d+\s*(jam|hari|minggu))\b", re.I)


# a comparison over time, not at one moment ("Jakarta dan Bandung paling tinggi" is a ranking)
_OVER_TIME = re.compile(r"\b(tren|grafik|riwayat|historis|dari waktu ke waktu|perkembangan|naik|turun|seminggu|sebulan|"
                        r"setahun|\d+\s*(hari|minggu|bulan)|minggu|bulan)\b", re.I)


# a question about how often events happened over time, not which ones happened ("gempa minggu ini")
_EVENT_TREND = re.compile(r"\b(tren|grafik|riwayat|historis|dari waktu ke waktu|perkembangan|naik|turun|frekuensi|"
                          r"per (hari|minggu)|harian|mingguan|statistik|berapa kali)\b", re.I)


def _event_trend_request(q: str, context: dict) -> dict | None:
    """event_trend arguments for "tren gempa 30 hari terakhir"; None otherwise."""
    ql = q.lower()
    if not (_EVENT_TREND.search(q) and any(w in ql for w in _EVENT_WORDS)):
        return None
    kind = "hotspot" if ("panas" in ql or "hotspot" in ql or "kebakaran hutan" in ql) else \
        "quake" if "gempa" in ql else "disaster"
    where = _target_region(q, context)
    return {"kind": kind, "days": _days_in(q, 90 if kind == "disaster" else 30),
            "region_id": where["id"] if where else None}


def _compare_request(q: str, context: dict) -> dict | None:
    """compare arguments when the question asks how two or more regions' data,
    or several data of one region, moved over time; None otherwise."""
    ql = q.lower()
    if not _OVER_TIME.search(q) or any(w in ql for w in _EVENT_WORDS):
        return None   # "tren gempa di Jawa dan Sumatra" counts events, it is not an indicator
    regions = _regions_in(q)
    metrics = _metrics_named(q, context)
    if not regions and (where := context.get("region") or context.get("home")) and len(metrics) > 1:
        regions = [where]
    if not metrics and len(regions) > 1 and (m := _rank_metric(q, context)):
        metrics = [m]   # "bandingkan trennya di Jakarta dan Bandung": the data under discussion
    if not ((len(regions) > 1 and metrics) or (len(regions) == 1 and len(metrics) > 1)):
        return None
    return {"region_ids": [r["id"] for r in regions[:5]], "metrics": metrics[:1] if len(regions) > 1 else metrics[:5],
            "days": _days_in(q, 30)}


# asking for the history itself, typos allowed ("hisotrisnya")
_HISTORY_WORDS = ("historis", "histori", "history", "riwayat", "tren", "grafik", "perkembangan")


def _wants_history(q: str) -> bool:
    if re.search(r"\b(dari waktu ke waktu|dari hari ke hari|hari ke hari|harian)\b", q, re.I):
        return True
    return any(get_close_matches(re.sub(r"nya$", "", w), _HISTORY_WORDS, n=1, cutoff=0.75) for w in _words(q) if len(w) > 3)


def _region_history_request(q: str, context: dict) -> tuple[str, dict] | None:
    """("trend" | "compare", arguments) when the question asks for the history of
    a region's data, by name or as a follow-up ("lihat historisnya" after a
    region card): the metrics it names, else those of the topic it names or that
    is under discussion. Forecasts are left out: their history is of predictions,
    not of what was measured. None when it is not a history question, names the
    user's own sensors, or no region or data is in sight."""
    if not _wants_history(q) or _IOT.search(q):
        return None
    where = _target_region(q, context) or context.get("region") or context.get("home")
    cov = catalog.coverage()
    # a metric named by its own name ("PM2.5") is that metric; a topic word ("kualitas udara") is the whole topic
    topics = _topics_in(q)
    named = (context.get("need") or {}).get("metrik") or ([] if topics else _metrics_named(q, context)) or \
        [m for m in _metrics_named(q, context) if re.search(rf"(?<![a-z0-9]){re.escape(_short(cov[m]['label']).lower())}",
                                                             q.lower()) and m in cov]
    metrics = named or (None if topics else context.get("metrics")) or \
        sorted(set().union(*(_TOPICS[k][2] for k in (topics or context.get("topics", [])))))
    # air as a whole: its pollutants, the ones that decide the verdict first; never forecasts
    metrics = sorted((m for m in metrics if m in cov and "prakiraan" not in cov[m]["label"].lower()),
                     key=lambda m: POLLUTANTS.index(m) if m in POLLUTANTS else len(POLLUTANTS))[:5]
    if not (where and metrics):
        return None
    days = _days_in(q, 30)
    if len(metrics) == 1:
        return "trend", {"region_id": where["id"], "metric": metrics[0], "days": days}
    return "compare", {"region_ids": [where["id"]], "metrics": metrics, "days": days}


# how far back a chart beside an answer reaches when the question names no window
READINGS_DAYS = 7
HISTORY_DAYS = 7


def _span(hours: int) -> str:
    return f"{hours // 24} hari terakhir" if hours >= 48 and hours % 24 == 0 else f"{hours} jam terakhir"


def _hours_in(q: str, default: int = 24) -> int:
    """The window a readings question asks for, in hours; `default` when it names none."""
    if m := re.search(r"(\d+)\s*(jam|hari|minggu)", q, re.I):
        return min(int(m.group(1)) * {"jam": 1, "hari": 24, "minggu": 168}[m.group(2).lower()], 24 * 90)
    ql = q.lower()
    return next((h for w, h in (("kemarin", 48), ("minggu", 168), ("bulan", 720)) if w in ql), default)


def _named(names: list[str], q: str) -> list[str]:
    return [n for n in names if n.lower() in q.lower()]


_MONTHS = {"januari": 1, "jan": 1, "februari": 2, "feb": 2, "maret": 3, "mar": 3, "april": 4, "apr": 4, "mei": 5,
           "juni": 6, "jun": 6, "juli": 7, "jul": 7, "agustus": 8, "agu": 8, "agt": 8, "september": 9, "sep": 9,
           "oktober": 10, "okt": 10, "november": 11, "nov": 11, "desember": 12, "des": 12}
_MONTH = "|".join(sorted(_MONTHS, key=len, reverse=True))
_DATE = re.compile(rf"\b(\d{{4}})-(\d{{2}})-(\d{{2}})\b|\b(\d{{1,2}})\s+({_MONTH})\b\.?(?:\s+(\d{{4}}))?"
                   rf"|\btanggal\s+(\d{{1,2}})\b(?!\s+(?:{_MONTH})\b)", re.I)
_CLOCK = re.compile(r"\bjam\s*(\d{1,2})(?:[.:](\d{2}))?\b", re.I)


def _period_in(q: str, now: datetime | None = None) -> tuple[datetime, datetime] | None:
    """[since, until) in WIB that a question names: "7 Oktober", "2026-10-07", "dari
    tanggal 7 sampai 8 Oktober" (to the end of the last day), "kemarin", "hari ini",
    optionally "jam 8 sampai jam 12". None when it names no day or clock time."""
    now = now or datetime.now(tools.WIB)
    try:
        days = [date(int(m[1]), int(m[2]), int(m[3])) if m[1]
                else date(int(m[6] or now.year), _MONTHS[m[5].lower()], int(m[4])) if m[4]
                else date(now.year, now.month, int(m[7])) for m in _DATE.finditer(q)]
        if len(days) == 2 and not re.search(rf"\b{days[0].day}\s+({_MONTH})", q, re.I):
            days[0] = days[0].replace(month=days[1].month, year=days[1].year)   # "7 sampai 8 Oktober"
    except ValueError:
        return None   # "31 Februari": no such day
    ql = q.lower()
    if not days:
        days = [now.date() - timedelta(days=1)] if "kemarin" in ql else [now.date()] if "hari ini" in ql else []
    clock = [(int(h), int(mn or 0)) for h, mn in _CLOCK.findall(q) if int(h) < 24]
    if not days and not clock:
        return None
    first, last = (min(days), max(days)) if days else (now.date(), now.date())
    at = lambda d, h=0, mn=0: datetime(d.year, d.month, d.day, h, mn, tzinfo=tools.WIB)  # noqa: E731
    since = at(first, *clock[0]) if clock else at(first)
    until = at(last, *clock[-1]) if len(clock) >= 2 else at(last + timedelta(days=1))
    return since, until


# a question about places or rankings, which stays on public data even when it names one of the user's fields
_PLACES = re.compile(r"\b(provinsi|kabupaten|kab|kota|wilayah|daerah|nasional|indonesia|se-?indonesia)\b", re.I)
# "data iot apa saja yang bisa kulihat": a listing of the user's devices and tables
_OVERVIEW = re.compile(r"\b(apa (saja|aja)|ada apa|daftar(kan|nya)?|list|punya apa|(bisa )?(di|ku|saya |aku )?(lihat|liat))\b",
                       re.I)


# small talk: the whole message is a greeting or thanks ("halo kodama", "makasih ya kak")
_HELLO = r"halo|hallo|hai|hay|hi|hello|hey|hei|pagi|siang|sore|malam|selamat|assalamualaikum|assalamu|alaikum|permisi|kodama"
_THANKS = r"terima|kasih|makasih|makasi|thanks|thank|thx|tq|mantap|mantab|keren|good"
# replies to Kodama's offer at the end of its last answer ("Mau lihat trennya?"): accept or decline
_YES = r"ya|iya|iyaa|yes|yup|boleh|mau|oke|ok|okay|okey|sip|siap|gas|lanjut|silakan|tentu|yuk|ayo|bisa"
_NO = r"tidak|nggak|ngga|gak|ga|enggak|engga|nope|no|usah|nanti|dulu|cukup"
_FILLER = r"ya|yah|yaa|deh|dong|kak|kakak|min|banyak|sekali|bgt|banget|nih|aja|lagi|you|all|semua|semuanya"
# asking who Kodama is or what it can do
_WHO = re.compile(r"\b(kamu siapa|siapa (kamu|kodama|namamu)|apa itu kodama|kodama (itu )?apa|kenalan|perkenalkan( diri)?|"
                  r"kamu bisa apa|bisa (bantu )?apa( saja| aja)?|apa (saja|aja) yang bisa (kamu|kodama|kau)|"
                  r"(kamu|kodama) bisa (bantu )?apa)\b", re.I)


def _picked(reply: str, pending: dict) -> str | None:
    """The option a typed reply picks: its number ("2", "nomor 2", "yang ke-2") or its label; None otherwise."""
    opts, labels = pending.get("options", []), pending.get("labels", [])
    if (m := re.fullmatch(r"\s*(?:yang |nomor |no\.? ?|pilihan )?(?:ke-?)?(\d{1,2})\s*[.)]?\s*", reply, re.I)):
        n = int(m.group(1))
        return opts[n - 1] if 1 <= n <= len(opts) else None
    return next((o for o, label in zip(opts, labels) if label.lower() == reply.strip().lower()), None)


def _small_talk(q: str) -> str | None:
    """"hello", "thanks", "who", "yes" or "no" when the message is only that; None when it
    carries a real question ("halo, gempa terbaru apa?" is a quake question, not a greeting)."""
    if _WHO.search(q):
        return "who"
    words = re.findall(r"[a-z]+", q.lower())
    if not words or len(words) > 6:
        return None
    is_ = lambda pattern, w: bool(re.fullmatch(pattern, w))  # noqa: E731
    if any(not is_(f"{_HELLO}|{_THANKS}|{_FILLER}|{_YES}|{_NO}", w) for w in words):
        return None
    if any(is_(_THANKS, w) for w in words):
        return "thanks"    # "oke makasih" is thanks
    if any(is_(_NO, w) for w in words):
        return "no"        # "nggak usah dulu"
    if any(is_(_YES, w) and not is_(_HELLO, w) for w in words):
        return "yes"       # "boleh", "iya mau"
    return "hello"


def _starters(user: dict | None, home: dict | None) -> dict:
    """Questions to start with, as buttons: what Kodama answers well, the user's own region and devices first."""
    qs = [f"Bagaimana kualitas udara di {home['name']}?" if home else "Provinsi dengan PM2.5 tertinggi",
          "Apa yang perlu diwaspadai sekarang?", "Gempa terbaru",
          "Data IoT apa saja yang bisa kulihat?" if user else "Cara menambahkan alat IoT",
          "Provinsi paling rawan kebakaran"]
    return {"question": "Mau coba yang mana?", "options": [{"label": q, "question": q} for q in qs]}


def _overview(d: dict) -> str:
    """The user's devices and their tables, counted from the data: a model kept calling tables devices."""
    devs = d["devices"]
    if not devs:
        return "Kamu belum punya alat IoT. Tambahkan lewat halaman Perangkat IoT."
    lines = [f"Kamu punya {len(devs)} alat IoT dengan {sum(len(x['tables']) for x in devs)} tabel data:"]
    lines += [f"- **{x['name']}** ({'online' if x['online'] else 'offline'}), {len(x['tables'])} tabel: "
              + ", ".join(t["name"] for t in x["tables"]) + "." for x in devs if x["tables"]]
    if empty := [x["name"] for x in devs if not x["tables"]]:
        lines.append(f"- Belum mengirim data: {', '.join(empty)}.")
    lines.append("Pilih tabel di bawah untuk melihat isinya, atau tanyakan misalnya \"rata-rata suhu 24 jam terakhir\".")
    return "\n".join(lines)


_IOT = re.compile(r"\b(iot|alat|sensor|perangkat|stasiun)(nya|ku)?\b", re.I)

# a request for rows of a data table rather than a statistic
_TABLE = re.compile(r"\b(tabel|table|tampilkan|tampilin|tunjukkan|lihat|daftar|baris|data mentah|rekap|catatan|log|"
                    r"isi data|detail|versi|kolom)(nya)?\b", re.I)
# "seluruh datanya", "semua data": every row the table holds, not only the latest 50
_EVERY = re.compile(r"\b(seluruh|semua|selama ini|semuanya|lengkap)\b", re.I)
# words that say little about which of the user's tables is meant
_GENERIC = {"data", "tabel", "table", "alat", "sensor", "perangkat", "stasiun", "udara", "default", "tanpa", "nama"}


def _words(text: str) -> list[str]:
    return re.findall(r"[a-z0-9]+", text.lower())


# "@Sensor_Balikpapan_01" picked from the input's @ list: a name with its spaces written as "_"
_MENTION = re.compile(r"(?<!\S)@([\w.-]*\w)")


def _mentions(q: str, names: set[str]) -> tuple[str, list[str]]:
    """The question with each @mention written out as the exact name it means (the user's own
    device or table, matched word for word), and those names. A mention of anything else
    (a data source such as "@BMKG_Gempa") keeps its words: "BMKG Gempa"."""
    by_words = {tuple(_words(n)): n for n in names}
    hit: list[str] = []

    def name(m: re.Match) -> str:
        if (n := by_words.get(tuple(_words(m.group(1))))):
            hit.append(n)
            return n
        return m.group(1).replace("_", " ")
    return _MENTION.sub(name, q), hit


def _names_in(names: set[str], q: str) -> list[str]:
    """Which of the user's own table or device names a question means, typos allowed
    ("statius udara kaliurang"). Names whose every word appears win; a name that only
    repeats a longer one ("Stasiun Udara Kaliurang" inside "... (Marsa)") gives way to
    it. Without any full match, the names sharing the most distinctive words are
    the candidates ("dicha": two tables). Several results = ambiguous: the caller asks back."""
    qw = _words(q)
    seen = lambda w, cut=0.7: bool(get_close_matches(w, qw, n=1, cutoff=cut))  # noqa: E731
    full = [n for n in names if _words(n) and all(seen(w) for w in _words(n))]
    if full:
        return [n for n in full if not any(set(_words(n)) < set(_words(m)) for m in full)]
    # partial: the names sharing the most distinctive words ("kaliurang marsa" -> the Marsa table)
    hits = {n: sum(w not in _GENERIC and len(w) > 2 and seen(w, 0.8) for w in _words(n)) for n in names}
    best = max(hits.values(), default=0)
    return [n for n, h in hits.items() if best and h == best]
_STATS = re.compile(r"\b(rata-?rata|rerata|tertinggi|terendah|maksimum|minimum|naik|turun|tren|grafik|perubahan|"
                    r"statistik)\b", re.I)


def _fields_named(q: str, fields: list[dict]) -> list[dict]:
    """The user's fields a question names by key or label ("kelembapannya" counts)."""
    return [f for f in fields for name in {f["key"], f["label"]}
            if name and re.search(rf"\b{re.escape(name)}(nya)?\b", q, re.I)]


def _table_request(q: str, context: dict | None = None) -> dict | None:
    """my_table arguments for a question that asks for rows: the table (named, else
    the one under discussion, else the only one), the columns it names ("hanya suhu
    dan kelembapan"), and the period ("7 Oktober", "24 jam terakhir"). A follow-up
    that only names columns or a period ("yang tanggal 7 saja") stays on the table
    under discussion. None = not a table question, or no table to pick (ask back)."""
    last = (context or {}).get("table")
    fields = tools.my_fields()
    named = _fields_named(q, fields)
    period = _period_in(q)
    tables = _names_in({f["table"] for f in fields}, q)
    # a one-word table name that is also an ordinary word ("cuaca") needs a table or IoT word to count
    by_name = tables and (any(len(_words(t)) > 1 for t in tables) or _IOT.search(q))
    if _STATS.search(q) or not (_TABLE.search(q) or by_name or (last and (named or period or _EVERY.search(q)))):
        return None
    devices = [d for d in _names_in({f["device"] for f in fields}, q) if d not in tables]
    if len(tables) > 1:
        return None   # "Marsa" and "Dicha Suka NGOCOK" both named: ask which
    table, device = (tables or [None])[0], (devices or [None])[0]
    if table and not device:
        device = next((f["device"] for f in fields if f["table"] == table), None)
    if not (table or device):
        in_last = last and [f for f in fields if f["table"] == last["table"] and f["device"] == last["device"]]
        if last and (not named or {f["key"] for f in named} <= {f["key"] for f in in_last}):
            table, device = last["table"], last["device"]
        elif not named and len({f["stream_id"] for f in fields}) == 1:
            table, device = fields[0]["table"], fields[0]["device"]
        elif not named:
            return None
    keys = sorted({f["key"] for f in named if (not table or f["table"] == table)}) or None
    if keys is None and last and table == last["table"]:
        keys = last.get("fields")   # "yang tanggal 7 saja": same columns as before
    if not period and re.search(r"\d+\s*(jam|hari|minggu)", q, re.I):
        now = datetime.now(tools.WIB)
        period = (now - timedelta(hours=_hours_in(q)), now + timedelta(minutes=1))
    if not period and last and table == last["table"]:
        period = (last["since"], last["until"]) if last.get("since") else None
    out = {"table": table, "device": device, "fields": keys, "limit": 200 if _EVERY.search(q) else 50}
    if period:
        out["since"], out["until"] = (str(t) for t in period)
    return out


_MONTH_NAMES = ("", "Januari", "Februari", "Maret", "April", "Mei", "Juni", "Juli", "Agustus", "September",
                "Oktober", "November", "Desember")


def _when(since, until) -> str:
    """A period in words: whole days as dates ("tanggal 7 Oktober 2026", "dari 6 sampai 8
    Oktober 2026"), anything else with WIB clock times."""
    a, b = (datetime.fromisoformat(t) if isinstance(t, str) else t for t in (since, until))
    a, b = a.astimezone(tools.WIB), b.astimezone(tools.WIB)
    day = lambda t: f"{t.day} {_MONTH_NAMES[t.month]} {t.year}"  # noqa: E731
    if a.time() == b.time() == datetime.min.time():
        last = b - timedelta(days=1)
        return f"tanggal {day(a)}" if last.date() == a.date() else f"dari {day(a)} sampai {day(last)}"
    return f"dari {day(a)} {a:%H.%M} sampai {day(b)} {b:%H.%M} WIB"


def _table_summary(d: dict) -> str:
    """The text beside a table answer: which table, how many rows, which columns and
    period; the rows themselves are in the table component, not repeated here."""
    what = f"tabel {d['table']} dari alat IoT milikmu ({d['device']})"
    when = f" {_when(d['since'], d['until'])}" if d.get("since") else ""
    if not d["total"]:
        out = f"Tidak ada baris di {what}{when}."
        if d.get("table_first"):
            out += f" Data tabel ini ada {_when(d['table_first'], d['table_last'])}."
        return out
    cols = ", ".join(c["label"] for c in d["columns"]) if d.get("filtered") else "semua kolom"
    out = f"Berikut {what}{when}: {d['total']} baris, {cols}."
    if d["shown"] < d["total"]:
        out += f" Yang ditampilkan {d['shown']} baris terbaru."
    if d["tidak_ada"]:
        out += f" Kolom {', '.join(d['tidak_ada'])} tidak ada di tabel ini."
    return out


def _table_choices(q: str) -> dict | None:
    """A table question that names no single table: the tables it could mean (all
    of the user's when it names none). Each option asks for one table by its full
    name only, so the click resolves to exactly that table."""
    fields = tools.my_fields()
    pairs = {(f["table"], f["device"]) for f in fields}
    named = set(_names_in({t for t, _ in pairs}, q))
    pairs = sorted(p for p in pairs if not named or p[0] in named)
    several = len({d for _, d in pairs}) > 1
    every = " seluruh datanya" if _EVERY.search(q) else ""
    cols = lambda t, d: [f["label"] or f["key"] for f in fields if f["table"] == t and f["device"] == d]  # noqa: E731
    opts = [{"label": t + (f" · {d}" if several else ""),
             "question": f"tampilkan tabel {t}" + (f" di alat {d}" if several else "") + every,
             "description": "Kolom: " + ", ".join(cols(t, d)[:6]) + (" …" if len(cols(t, d)) > 6 else "")}
            for t, d in pairs]
    return opts and {"question": (f"Ada {len(pairs)} tabel yang cocok. Yang mana maksudmu?" if named
                                  else f"Kamu punya {len(pairs)} tabel data. Mau lihat yang mana?"), "options": opts[:8]}


def _readings_request(q: str, context: dict | None = None) -> dict | None:
    """my_readings arguments when the question asks for a field's history: the user's
    own field it names ("kelembapannya" counts; the longest name wins, a named device
    and table narrow it), else the field under discussion, keeping its window
    unless the question names another. A named field without a window ("suhu alat
    saya") still gets its last READINGS_DAYS, so the latest value comes with its
    history. None = not a readings question, or no field."""
    last = (context or {}).get("reading")
    fields = sorted(tools.my_fields(), key=lambda f: -len(f["label"] or f["key"]))
    devices, tables = _named({f["device"] for f in fields}, q), _named({f["table"] for f in fields}, q)
    hit = next((f for f in fields for name in {f["key"], f["label"]}
                if name and re.search(rf"\b{re.escape(name)}(nya)?\b", q, re.I)
                and (not devices or f["device"] in devices) and (not tables or f["table"] in tables)), None)
    if not (hit or _HISTORY.search(q)):
        return None
    period = _period_in(q)
    span = {"since": str(period[0]), "until": str(period[1])} if period else {}
    if hit:
        return {"field": hit["key"], "device": hit["device"], "table": hit["table"],
                "hours": _hours_in(q, last["hours"] if last else READINGS_DAYS * 24), **span}
    # "naik atau turun?" about the same sensor, in the same window unless the question names one
    return last and ({**{k: v for k, v in last.items() if k not in ("since", "until")},
                      "hours": _hours_in(q, last["hours"]), **span} if span or _hours_in(q, 0) else last)


def _iot_compare_request(q: str, context: dict | None = None) -> dict | None:
    """my_compare arguments when the question names two or more fields of one of
    the user's own tables ("suhu dan kelembapan alat saya"); None otherwise."""
    fields = tools.my_fields()
    devices, tables = _named({f["device"] for f in fields}, q), _named({f["table"] for f in fields}, q)
    by_table: dict[int, dict[str, dict]] = {}
    for f in _fields_named(q, fields):
        if (not devices or f["device"] in devices) and (not tables or f["table"] in tables):
            by_table.setdefault(f["stream_id"], {})[f["key"]] = f
    best = max(by_table.values(), key=len, default={})
    if len(best) < 2:
        return None
    first = next(iter(best.values()))
    period = _period_in(q)
    span = {"since": str(period[0]), "until": str(period[1])} if period else {}
    # in the order the question names them: "suhu dan kelembapan" charts suhu first
    at = lambda f: min(m.start() for n in {f["key"], f["label"]} if n and (m := re.search(rf"\b{re.escape(n)}", q, re.I)))  # noqa: E731
    keys = sorted(best, key=lambda k: at(best[k]))
    return {"fields": keys[:4], "device": first["device"], "table": first["table"],
            "hours": _hours_in(q, READINGS_DAYS * 24), **span}


def _field_choices(q: str) -> dict | None:
    """A readings question that names no field: the user's own fields to pick from.
    Each option names the field, its table, and its device when there are several."""
    fields = [f for f in tools.my_fields() if f["key"] not in ("lat", "lon", "status")]
    several = len({f["device"] for f in fields}) > 1
    opts = [{"label": " · ".join([f["label"] or f["key"], f["table"]] + ([f["device"]] if several else [])),
             "question": f"{q} ({f['key']} di tabel {f['table']}" + (f" alat {f['device']})" if several else ")"),
             "description": f"Field {f['key']} di tabel {f['table']}, alat {f['device']}"}
            for f in fields]
    return opts and {"question": f"Alatmu mengirim {len(fields)} data sensor. Yang mana?", "options": opts[:8]}


# facilities people ask for whose locations Arkamap does not have (yet)
_MISSING_FACILITY = re.compile(r"\b(rumah sakit|puskesmas|klinik|fasilitas kesehatan|sekolah|spklu|"
                               r"stasiun pengisian|pasar|bandara|pelabuhan)\b", re.I)


def _missing_facility(q: str) -> str | None:
    """The facility a question asks for when it is one Arkamap has no locations of; None otherwise."""
    m = _MISSING_FACILITY.search(q)
    return m.group(1).lower() if m and not _facility_kind(q) else None


def _facility_kind(q: str) -> str | None:
    return next((k for words, k in _FACILITY_WORDS if re.search(rf"\b(?:{words})", q, re.I)), None)


_TREND_DEFAULT = ("pm25_mean", "fire_risk", "rain_30d", "temp_max_mean")


def _trend_choices(q: str, context: dict) -> dict:
    """A trend without a metric: the metrics under discussion, else common ones; each option names one."""
    cov = catalog.coverage()
    metrics = [m for m in (_focus(q, context) or _TREND_DEFAULT) if m in cov][:5]
    return {"question": "Riwayat data apa? Ini yang paling sering dilihat:",
            "options": [{"label": cov[m]["label"], "question": f"{q} ({cov[m]['label'].split(' (')[0]})",
                         "description": f"Satuan {cov[m].get('unit') or '-'}"
                                        + (f"; tersedia {catalog.where(cov[m])}" if "prov" in cov[m] else "")}
                        for m in metrics]}


def _facility_choices(q: str) -> dict:
    return {"question": "Fasilitas apa yang ingin kamu lihat?",
            "options": [{"label": "Pembangkit listrik", "question": f"{q} (pembangkit listrik)"},
                        {"label": "Halte TransJakarta", "question": f"{q} (halte TransJakarta)"}]}


_NATIONAL = re.compile(r"\b(nasional|indonesia|se-?indonesia)\b", re.I)


def _within(q: str, context: dict, level: str) -> str | None:
    """The province a kab/kota ranking stays in: the one the question names, else
    the one under discussion; None = national (asked for, or no province in sight)."""
    if level != "kabkota" or _NATIONAL.search(q):
        return None
    where = _region_in(q) or context.get("region")
    return where["id"] if where and where.get("level") == "provinsi" else None


def _prefetch(skill: str, q: str, context: dict) -> list[dict] | None:
    """The data a rule can already fetch with confidence: a named region, a named
    event kind, a named ranking metric, the alerts. The model then only writes
    the answer, one call without tools, instead of a tool loop of 2-3 calls.
    None = the question needs the model to pick its tools."""
    ql = q.lower()
    sure = (skill in ("alerts", "my_data")
            or (skill == "compare" and _compare_request(q, context) is not None)
            or (skill in ("trend", "compare") and _region_history_request(q, context) is not None)
            or (skill == "facilities" and _facility_kind(q) is not None)
            or (skill == "trend" and _rank_metric(q, context) is not None
                and bool(_target_region(q, context) or context.get("region") or context.get("home")))
            or (skill == "events" and any(w in ql for w in _EVENT_WORDS))
            or (skill == "ranking" and _rank_metric(q, context) is not None)
            or (skill == "region" and (_target_region(q, context) is not None
                                       or bool(context.get("home") or context.get("region")))))
    if not sure:
        return None
    res = _fallback_calls(skill, q, context)
    return res if res and not any(r.get("error") for r in res) else None


def _fallback_calls(skill: str, q: str, context: dict | None = None) -> list[dict]:
    ql = q.lower()
    context = context or {}
    ctx_region = _target_region(q, context)
    focus = {"metrics": _focus(q, context)}
    if skill == "my_data":
        if req := _table_request(q, context):
            return [tools.call("my_table", req)]
        if req := _iot_compare_request(q, context):
            return [tools.call("my_compare", req)]
        if req := _readings_request(q, context):
            return [tools.call("my_readings", req)]
        return [tools.call("my_data", {})]
    if skill == "alerts":
        return [tools.call("alerts", {})]
    if skill == "compare" and (req := _compare_request(q, context)):
        return [tools.call("compare", req)]
    if skill in ("trend", "compare") and (hist := _region_history_request(q, context)):
        return [tools.call(*hist)]
    if skill == "compare":
        return []
    if skill == "trend":
        metric, where = _rank_metric(q, context), ctx_region or context.get("region") or context.get("home")
        return [tools.call("trend", {"region_id": where["id"], "metric": metric, "days": _days_in(q, 30)})] \
            if metric and where else []
    if skill == "facilities":
        kind = _facility_kind(q)
        return [tools.call("facilities", {"kind": kind, "region_id": ctx_region["id"] if ctx_region else None})] \
            if kind else []
    if skill == "events" and (req := _event_trend_request(q, context)):
        return [tools.call("event_trend", req)]
    if skill == "events":
        kind = "hotspot" if ("panas" in ql or "hotspot" in ql or "kebakaran hutan" in ql) else \
            "quake" if "gempa" in ql else \
            "disaster" if any(w in ql for w in ("erupsi", "gunung", "banjir", "bencana", "siklon",
                                               "kekeringan", "longsor", "kebakaran hutan")) else "quake"
        # disasters are rare; a week is usually empty
        return [tools.call("events", {"kind": kind, "days": _days_in(q, 90 if kind == "disaster" else 7),
                                      "region_id": ctx_region["id"] if ctx_region else None})]
    if skill == "ranking":
        metric = _rank_metric(q, context)
        if metric is None:
            return []   # no metric named: never rank by a guess
        # "tertinggi/terpadat" asks for the largest raw value, not the
        # highest attention score (opposite for high_good metrics)
        sort = "value_asc" if any(w in ql for w in ("terendah", "tersedikit", "paling sedikit")) \
            else "value_desc" if any(w in ql for w in ("tertinggi", "terbanyak", "terpadat",
                                                        "paling banyak", "paling tinggi",
                                                        "paling padat")) \
            else "attention"
        level = "kabkota" if re.search(r"\b(kota|kabupaten|kab)\b", ql) else "provinsi"
        here = context.get("region") if _OTHERS.search(q) else None
        if here and not re.search(r"\b(kota|kabupaten|kab|provinsi)\b", ql):
            level = here["level"]   # "bandingkan dengan wilayah lain" after Kota Balikpapan: other kab/kota
        if sort == "attention" and standard(metric):
            sort = "value_desc"     # an air value with a limit is compared by its µg/m³, not by a 0-100 score
        return [tools.call("rank_regions", {"weights": {metric: 1}, "sort": sort, "level": level,
                                            "within": None if here else _within(q, context, level),
                                            "include": here["id"] if here else None})]
    where = ctx_region
    # region: loose match on any word, e.g. a partial name
    for w in q.split() if not where else []:
        m = tools.find_region(w)["data"]["matches"] if len(w) > 3 else []
        # a word only stands for a region it begins ("Riau" -> Riau), never a fuzzy
        # hit on an ordinary word ("menambahkan" once landed on a random region)
        if m and m[0]["name"].lower().startswith(w.lower()):
            where = m[0]
            break
    # no region named: the one under discussion, else the user's own
    where = where or context.get("region") or context.get("home")
    if not where:
        return []
    return [tools.call("region_summary", {"region_id": where["id"], **focus}),
            *_history(where["id"], focus["metrics"], _days_in(q, HISTORY_DAYS))]


def _history(region_id: str, metrics: list[str] | None, days: int) -> list[dict]:
    """The recent history of the one or two metrics a region question names, for a
    chart beside its card; only those with at least two periods to draw. A whole
    topic ("data laut") or everything gets no charts: one per metric would bury the card."""
    if not metrics or len(metrics) > 2:
        return []
    out = [tools.call("trend", {"region_id": region_id, "metric": m, "days": days}) for m in metrics]
    return [r for r in out if not r.get("error") and len(r["data"]["points"]) >= 2]


def _iot_source(results: list[dict]) -> str:
    """The opening line of an answer about the user's own sensors: which device,
    table and field it read, so their own data is never mistaken for a region's."""
    r = next((r for r in _usable(results) if r["tool"] in ("my_readings", "my_compare", "my_data")), None)
    d = r and r["data"]
    if not d:
        return ""
    if r["tool"] == "my_compare":
        labels = ", ".join(f"**{x['label']}**" for x in d["series"])
        return f"Data ini dari alat IoT milikmu **{d['device']}**, tabel **{d['table']}**, field {labels}.\n\n"
    if r["tool"] == "my_readings":
        return f"Data ini dari alat IoT milikmu **{d['device']}**, tabel **{d['table']}**, field **{d['label']}**.\n\n"
    names = [x["name"] for x in d.get("devices", [])]
    return f"Data ini dari alat IoT milikmu: {', '.join(f'**{n}**' for n in names)}.\n\n" if names else ""


def render_template(results: list[dict]) -> str:
    if not results:
        return ("Saya tidak menemukan data yang cocok dengan pertanyaan itu. Sebutkan nama wilayahnya "
                "(mis. \"kondisi Riau\"), jenis kejadian, atau tanyakan cara memakai Arkamap.")
    out = []
    for r in results:
        d = r.get("data") or {}
        if r["tool"] == "find_region":
            continue   # a lookup step, not an answer
        if r.get("error"):
            out.append(f"Tool {r['tool']} gagal: {r['error']}")
        elif r["tool"] == "rank_regions" and not d.get("results"):
            out.append(f"Belum ada data {', '.join(d.get('weights', {}))} untuk level {d.get('level')}.")
        elif r["tool"] == "rank_regions":
            if d.get("sort", "attention") == "attention":
                top = ", ".join(f"{x['name']} ({x['score']})" for x in d["results"][:5])
                out.append(f"Peringkat teratas (skor 0-100, 100 = paling perlu perhatian): {top}.")
            else:
                m = next(iter(d["weights"]))
                top = ", ".join(f"{x['name']} ({round(x['values'][m], 2)})" for x in d["results"][:5])
                arah = "tertinggi" if d["sort"] == "value_desc" else "terendah"
                label = (d.get("labels") or {}).get(m, m)
                unit = (d.get("units") or {}).get(m, "")
                out.append(f"{label} {arah} ({unit}): {top}." if unit else f"{label} {arah}: {top}.")
            m1 = next(iter(d.get("weights") or {}), None)
            if (std := (d.get("standar") or {}).get(m1)) and (n := d.get("melebihi_batas")):
                out.append(f"{n['jumlah']} dari {n['dari']} wilayah melebihi {std['batas_nama']} "
                           f"({std['batas']} {(d.get('units') or {}).get(m1, '')}).")
        elif r["tool"] == "region_summary":
            if (air := d.get("kualitas_udara")):
                out.append(f"Kualitas udara {d['name']} secara keseluruhan: {air['kategori']}"
                           + (f", ditentukan oleh {', '.join(air['dominan'])}" if air["dominan"] else "")
                           + (f"; melebihi baku mutu: {', '.join(air['melebihi_batas'])}" if air["melebihi_batas"] else "")
                           + (f"; belum ada data {', '.join(air['belum_ada'])}" if air["belum_ada"] else "") + ".")
            if d["indicators"]:
                out.append(f"{d['name']}: " + "; ".join(
                    f"{i['label']} {round(i['value'], 2)} {i['unit']}" + (" (model)" if i["is_modelled"] else "")
                    for i in d["indicators"][:8]) + ".")
            if d.get("tidak_ada"):
                out.append(f"Tidak ada data {', '.join(x['label'] for x in d['tidak_ada'])} untuk {d['name']} "
                           f"({'; '.join(x['label'] + ': ' + x['tersedia_untuk'] for x in d['tidak_ada'])}).")
        elif r["tool"] == "events":
            label = {"quake": "gempa", "hotspot": "titik panas", "disaster": "bencana"}[d["kind"]]
            where = f" di {d['region']['name']}" if d.get("region") else ""
            out.append(f"{d['total_count']} kejadian {label}{where} dalam {d['days']} hari terakhir "
                       f"(ditampilkan {d['shown']}).")
            if by := d.get("by_region_7d"):
                lvl = "kabupaten/kota" if by["level"] == "kabkota" else "provinsi"
                out.append(f"Terbanyak dalam {by['window_days']} hari per {lvl} (satelit VIIRS saja; total di atas "
                           "mencakup semua satelit, jadi satu api bisa terhitung beberapa kali): "
                           + ", ".join(f"{x['name']} ({x['count']})" for x in by["top"]) + ".")
            elif d.get("shown_by_provinsi"):
                out.append("Yang ditampilkan paling banyak di: "
                           + ", ".join(f"{x['name']} ({x['count']})" for x in d["shown_by_provinsi"]) + ".")
            if d.get("top") and (p := d["top"][0]).get("provinsi"):
                at = ", ".join(filter(None, [p.get("kabkota"), p["provinsi"]]))
                what = f"magnitudo {p['mag']}" if "mag" in p else f"FRP {p['frp']} MW" if "frp" in p else "teratas"
                out.append(f"Terkuat: {what} di {at}.")
        elif r["tool"] == "my_data":
            if not d["devices"]:
                out.append("Kamu belum punya alat IoT.")
            for dev in d["devices"]:
                state = "online" if dev["online"] else "offline"
                tables = "; ".join(f"{t['name']}: " + ", ".join(f"{k} {v}" for k, v in t["latest"].items() if v is not None)
                                   for t in dev["tables"])
                out.append(f"{dev['name']} ({state}): {tables or 'belum ada data'}.")
        elif r["tool"] == "my_table":
            out.append(_table_summary(d))   # the rows are in the table component
        elif r["tool"] == "my_readings":
            when = f"dari {d['since']} sampai {d['until']}" if d.get("since") else _span(d["hours"])
            what = f"{d['label']} di {d['device']} ({d['table']}), {when}"
            if not d["count"]:
                out.append(f"Tidak ada bacaan angka {what}.")
            else:
                s = d["stats"]
                out.append(f"{what}: {d['count']} bacaan, rata-rata {s['mean']}, terendah {s['min']}, "
                           f"tertinggi {s['max']}.")
            if d.get("latest"):
                out.append(f"Terakhir {d['latest']['value']} pada {d['latest']['time']}.")
        elif r["tool"] == "alerts":
            out.append(f"{d['count']} peringatan aktif.")
        elif r["tool"] == "event_trend":
            where = f" di {d['region']['name']}" if d.get("region") else ""
            s_ = d["ringkasan"]
            out.append(f"{d['total']} kejadian {d['label'].lower()}{where} dalam {d['days']} hari terakhir, "
                       f"rata-rata {s_['rata_rata']} per {d['per']}, terbanyak {s_['tertinggi']['nilai']} pada "
                       f"{s_['tertinggi']['waktu']}; paruh akhir {d['paruh']['akhir']} dibanding paruh awal "
                       f"{d['paruh']['awal']} ({d['paruh']['arah']})."
                       + (f" Data baru tersimpan sejak {d['data_sejak']}." if d.get("data_sejak") else ""))
        elif r["tool"] in ("compare", "my_compare"):
            parts = []
            for x in d["series"]:
                if not x["points"]:
                    parts.append(f"{x['name']} belum ada data")
                    continue
                seg = f"{x['name']} terakhir {round(x['terakhir']['nilai'], 2)}"
                if c := x.get("perubahan"):
                    seg += f", {c['arah']} {abs(c['nilai'])}" + (f" ({abs(c['persen'])}%)" if c["persen"] is not None else "")
                parts.append(seg)
            out.append(f"{d.get('label') or d.get('subject')}: " + "; ".join(parts) + ".")
        elif r["tool"] == "trend":
            where = d["region"]["name"]
            if not d["points"]:
                out.append(f"Belum ada riwayat {d['label']} untuk {where} dalam {d['days']} hari terakhir.")
            else:
                out.append(f"{d['label']} di {where}: " + ", ".join(
                    f"{p['period']} {round(p['value'], 2)}" for p in d["points"][-7:]) + f" {d['unit']}.")
                if c := d.get("perubahan"):
                    out.append(f"Dari {c['dari']} sampai {c['sampai']} {c['arah']} {abs(c['nilai'])} {c['satuan']}"
                               + (f" ({abs(c['persen'])}%)." if c["persen"] is not None else "."))
        elif r["tool"] == "facilities":
            where = d["region"]["name"] if d.get("region") else "Indonesia"
            out.append(f"{d['total_count']} {d['what']} di {where}"
                       + (f", total {d['total_capacity_mw']} MW" if "total_capacity_mw" in d else "") + ".")
            if d["top"]:
                out.append("Terbesar: " + ", ".join(
                    (x.get("name") or "tanpa nama") + (f" ({x['capacity_mw']} MW)" if "capacity_mw" in x else "")
                    for x in d["top"][:5]) + ".")
        elif r["tool"] == "guide":
            out.append(d["text"])
    return " ".join(out) or render_template([])


# ── LLM loop ──
# What the model never needs to phrase an answer: coordinates (places are named),
# 0-100 normalisations and per-value confidence. The guard still checks against
# the full data, so dropping these only saves input tokens.
_MODEL_DROP = {"lon", "lat", "normalised", "confidence", "daynight", "geojson"}


# a chart's points as the model reads them: enough to describe the line, not every reading
_MODEL_POINTS = 40


def _thin(points):
    """At most _MODEL_POINTS, spread evenly and always ending on the latest; the
    tool's own ringkasan/perubahan already carry the extremes and the change."""
    if not isinstance(points, list) or len(points) <= _MODEL_POINTS:
        return points
    step = len(points) / (_MODEL_POINTS - 1)
    return [points[int(i * step)] for i in range(_MODEL_POINTS - 1)] + [points[-1]]


def _for_model(v):
    """Tool data as the model reads it: no nulls or UI-only keys, floats to a
    few digits (the guard accepts rounded figures), long chart lines thinned."""
    if isinstance(v, dict):
        return {k: _for_model(_thin(x) if k == "points" else x) for k, x in v.items()
                if k not in _MODEL_DROP and x is not None}
    if isinstance(v, list):
        return [_for_model(x) for x in v]
    if isinstance(v, float):
        return round(v, 2) if abs(v) >= 1 else float(f"{v:.3g}")
    return v

def _llm_steps(skill: str, history: list[dict], q: str, context: dict, results: list[dict], persona: str = ""):
    """Generator: yields (event, data) as the model works, and returns
    (answer, tool results, token usage) when done (use `yield from`).
    Events: token {text}, reset {} (text so far was a preamble to a tool
    call, discard it), step {tool, args}, viz {...}."""
    from langchain_core.messages import (AIMessage, HumanMessage, SystemMessage, ToolMessage,
                                         message_chunk_to_message)
    from langchain_core.tools import StructuredTool
    from langchain_google_genai import ChatGoogleGenerativeAI

    lc_tools = [StructuredTool.from_function(func=lambda _n=n, **kw: "",
                                             name=n, description=tools.TOOLS[n][2],
                                             args_schema=tools.TOOLS[n][1])
                for n in tools.SKILLS[skill]["tools"]]
    # Native client, not the OpenAI-compatible endpoint: Gemini 3 needs each
    # tool call's thought_signature sent back, which that layer drops.
    def model(timeout: float):
        return ChatGoogleGenerativeAI(model=LLM_MODEL, google_api_key=GEMINI_API_KEY,
                                      temperature=0, timeout=timeout, max_retries=0,
                                      max_output_tokens=LLM_MAX_OUTPUT_TOKENS).bind_tools(lc_tools)
    system = SYSTEM + persona
    if context.get("region"):
        r = context["region"]
        system += (f" Konteks percakapan: wilayah yang sedang dibahas adalah {r['name']} "
                   f"(region_id={r['id']}). Pakai region_id ini bila pengguna merujuk "
                   "'di sana', 'wilayah itu', atau tidak menyebut wilayah lain.")
    msgs = [SystemMessage(system)] + [
        (HumanMessage if h["role"] == "user" else AIMessage)(h["content"]) for h in history
    ] + [HumanMessage(q)]
    # `results` is the caller's list, filled in place: if the model fails
    # after some tools ran, the caller still has their data for the fallback
    usage = {"input": 0, "output": 0}
    deadline = time.monotonic() + LLM_DEADLINE_S
    for _ in range(MAX_STEPS):
        left = deadline - time.monotonic()
        if left < 10:   # Gemini refuses a request deadline under 10 s
            raise TimeoutError("batas waktu jawaban tercapai")
        full, streamed = None, False
        for chunk in model(left).stream(msgs):
            full = chunk if full is None else full + chunk
            if chunk.text:
                streamed = True
                yield "token", {"text": chunk.text}
        if full is None:
            raise RuntimeError("model tidak mengirim jawaban")
        # chunks summed back into one message keep the tool calls and their
        # thought_signature, which Gemini 3 needs on the next turn
        ai = message_chunk_to_message(full)
        msgs.append(ai)
        um = ai.usage_metadata or {}
        usage["input"] += um.get("input_tokens", 0)
        usage["output"] += um.get("output_tokens", 0)
        _raise_if_cut(ai)
        if not ai.tool_calls:
            return usage
        if streamed:
            yield "reset", {}
        for tc in ai.tool_calls:
            if tc["name"] == "region_summary":
                tc["args"] = {**tc["args"], "metrics": _focus(q, context)}
            if tc["name"] == "rank_regions":
                tc["args"] = {**tc["args"], "within": _within(q, context, tc["args"].get("level", "provinsi"))}
                if (here := context.get("region")) and _OTHERS.search(q):
                    tc["args"]["include"] = here["id"]
            yield "step", {"tool": tc["name"], "args": tc["args"]}
            res = tools.call(tc["name"], tc["args"]) if tc["name"] in tools.SKILLS[skill]["tools"] \
                else {"tool": tc["name"], "error": "tool tidak diizinkan", "data": {}, "viz": None, "sources": []}
            results.append(res)
            if res.get("viz"):
                yield "viz", res["viz"]
            # viz is UI-only: the model sees `data` alone, the same text the number guard checks
            # compact separators: fewer input tokens for the same data
            msgs.append(ToolMessage(json.dumps(_for_model({k: res.get(k) for k in ('tool', 'data', 'error', 'sources')}),
                                               default=str, separators=(",", ":"), ensure_ascii=False),
                                    tool_call_id=tc["id"]))
    raise RuntimeError("batas langkah tercapai tanpa jawaban")


def _raise_if_cut(msg) -> None:
    """A reply stopped by the output cap is unfinished; raising hands it to a backup to continue."""
    if "MAX_TOKENS" in str((msg.response_metadata or {}).get("finish_reason", "")):
        raise RuntimeError("batas token output")


def _llm_once(system: str, history: list[dict], q: str):
    """One streamed model call without tools (guide answers). Generator like
    _llm_steps: yields token events, returns usage."""
    from langchain_core.messages import AIMessage, HumanMessage, SystemMessage
    from langchain_google_genai import ChatGoogleGenerativeAI

    msgs = [SystemMessage(system)] + [
        (HumanMessage if h["role"] == "user" else AIMessage)(h["content"]) for h in history
    ] + [HumanMessage(q)]
    llm = ChatGoogleGenerativeAI(model=LLM_MODEL, google_api_key=GEMINI_API_KEY, temperature=0,
                                 timeout=LLM_DEADLINE_S, max_retries=0, max_output_tokens=LLM_MAX_OUTPUT_TOKENS)
    full = None
    for chunk in llm.stream(msgs):
        full = chunk if full is None else full + chunk
        if chunk.text:
            yield "token", {"text": chunk.text}
    if full is None:
        raise RuntimeError("model tidak mengirim jawaban")
    _raise_if_cut(full)
    um = full.usage_metadata or {}
    return {"input": um.get("input_tokens", 0), "output": um.get("output_tokens", 0)}


# A sentence ends at ". ", "! ", "? ", ": " or a line break, with the whitespace after it;
# "2.218,7" has no space, so it never splits.
_SENTENCE_END = re.compile(r"[.!?:]\s+|\n\s*")


class _Unsupported(Exception):
    """A sentence carried a number no tool result supports."""


def _checked(gen, results: list[dict], extra: list[dict], shown: list[str]):
    """Pass a writer's events through, holding text back until a sentence ends
    and its numbers check out against `results` (read live: the tool loop fills
    it while running) plus `extra`. Released text goes into `shown`, which the
    caller keeps when the writer fails. Returns the writer's return value."""
    buf = ""

    def release(text: str):
        if bad := unsupported_numbers(text, results + extra):
            raise _Unsupported(sorted(bad))
        shown.append(text)
        return "token", {"text": text}

    try:
        while True:
            try:
                event, data = next(gen)
            except StopIteration as stop:
                if buf.strip():
                    yield release(buf)
                return stop.value
            if event == "token":
                buf += data["text"]
                if ends := [m.end() for m in _SENTENCE_END.finditer(buf)]:
                    text, buf = buf[:ends[-1]], buf[ends[-1]:]
                    yield release(text)
            elif event == "reset":
                # a preamble before a tool call: unseen if still held back
                buf = ""
                if shown:
                    shown.clear()
                    yield "reset", {}
            else:
                yield event, data
    finally:
        gen.close()   # stops a writer we gave up on mid-stream


def _usable(results: list[dict]) -> list[dict]:
    """Tool results that answer the question: no errors, no lookup steps."""
    return [r for r in results if not r.get("error") and r["tool"] not in ("list_metrics", "find_region")]


def _write(primary, backup_system, history: list[dict], q: str, results: list[dict], extra: list[dict],
           st: dict):
    """Streams the answer: Gemini (`primary`, a writer generator, or None when
    off), then each backup, every one continuing the checked text already
    shown. `backup_system()` gives the backups' prompt with the data inlined
    (they have no tools). Returns (text shown, finished?, writers used, why
    the last one stopped)."""
    shown: list[str] = []
    used: list[str] = []
    why = None
    deadline = time.monotonic() + LLM_DEADLINE_S
    writers = [("gemini", lambda: primary)] if primary is not None else []
    for p in backup.providers():
        # Limit: a backup after a slow Gemini can push the turn past the 30 s
        # proxy limit; quota errors (the usual case) fail fast and leave it time
        writers.append((p[0], lambda p=p: backup.stream(p, backup_system(), history, q, "".join(shown),
                                                        max(deadline - time.monotonic(), 8))))
    for name, make in writers:
        before = len(shown)
        try:
            usage = yield from _checked(make(), results, extra, shown)
            st["tokens_in"] += usage["input"]
            st["tokens_out"] += usage["output"]
            return "".join(shown), True, used + [name], why
        except Exception as exc:  # noqa: BLE001 - any writer failure -> the next one continues
            why = f"{name}: angka tidak berasal dari data {exc}" if isinstance(exc, _Unsupported) \
                else f"{name} gagal: {type(exc).__name__}"
            log.warning("penulis jawaban %s berhenti: %s", name, exc)
            if len(shown) > before:
                used.append(name)
    return "".join(shown), False, used, why


# a token budget no session reaches: still an int (the API schema), still exact in JavaScript
NO_BUDGET = 2**53 - 1


def unlimited(user: dict | None) -> bool:
    """An account in AGENT_UNLIMITED_EMAILS: no rate limit, no session token budget."""
    return bool(user) and (user.get("email") or "").lower() in AGENT_UNLIMITED_EMAILS


def token_budget(user: dict | None) -> int:
    return NO_BUDGET if unlimited(user) else SESSION_TOKEN_BUDGET


def chat(question: str, session_id: str | None = None, user: dict | None = None) -> dict:
    """Non-streaming: run the same event flow and return the final payload."""
    for event, data in chat_events(question, session_id, user):
        if event == "done":
            return data
    raise RuntimeError("alur chat berakhir tanpa hasil")


def _persona(user: dict | None) -> tuple[str, dict | None]:
    """(system-prompt line about who is asking, their monitoring region). Guests: ("", None)."""
    if not user:
        return "", None
    from ..api import users   # late: the API module pulls in the whole IoT stack
    p = users._active_profile(user["id"]) or {}
    home = p.get("region_id") and query_one("SELECT id, name, level FROM region WHERE id = %s", (p["region_id"],))
    line = (f" Pengguna sedang masuk sebagai {user['name']}. Profil pantauan aktif: peran {p.get('role') or '-'}; "
            f"bidang {p.get('field_label') or '-'}; mode {p.get('mode_label') or '-'}; wilayah pantauan "
            f"{home['name'] if home else 'belum dipilih'}. Utamakan wilayah itu bila pertanyaan menyebut 'saya' atau "
            "tidak menyebut wilayah; data publik wilayah lain tetap boleh dijawab bila ditanyakan.")
    return line, home or None


def chat_events(question: str, session_id: str | None = None, user: dict | None = None):
    """The whole turn as (event, data) pairs, for /agent/chat/stream:
    start -> step/viz/token/reset while the model works -> replace (only when
    the streamed text is replaced by the safe template answer) -> done (the
    same payload /agent/chat returns; authoritative). `user` is the signed-in
    user from the request's token, or None for a guest.

    The user is set around each step, not once: the stream runs every step of
    this generator in its own copy of the context (Starlette's thread pool), so
    a value set in the first step was gone by the time a tool read it ("masuk
    dulu" to a signed-in user), and the final reset raised after `done`."""
    turn = _turn(question, session_id, user)
    while True:
        token = tools.CURRENT_USER.set(user)
        try:
            event = next(turn)
        except StopIteration:
            return
        finally:
            tools.CURRENT_USER.reset(token)
        yield event


def _turn(question: str, session_id: str | None, user: dict | None):
    uid = user["id"] if user else None
    sid = session_id or uuid.uuid4().hex
    st = session.load(sid)
    if st["turns"] and st["context"].get("user_id") != uid:
        # a session belongs to whoever started it: another account (or a guest)
        # presenting its id gets a fresh one, never its history
        sid = uuid.uuid4().hex
        st = session.load(sid)
    history, context = st["history"], st["context"]
    context["user_id"] = uid
    persona, home = _persona(user)
    if home:
        context["home"] = home
    else:
        context.pop("home", None)
    previous = next((h["content"] for h in reversed(history) if h["role"] == "user"), None)
    # "@Sensor_Balikpapan_01 tren PM2.5": the mention is that device by its exact name, so every name match finds it
    mentioned: list[str] = []
    if "@" in question:
        question, mentioned = _mentions(question, {n for f in tools.my_fields() for n in (f["device"], f["table"])})
    # the last turn asked back: a short reply ("yang kota", "Lainnya: ...") continues that question
    pending = context.pop("pending", None)
    # "2" or an option's label typed back picks that option, like clicking it
    if pending and (pick := _picked(question, pending)):
        question = pick
    # a clicked option is a whole question already; only a short typed reply ("yang kota") continues the last one
    clicked = pending and question in pending.get("options", [])
    # next steps offered after an answer are picked, never continued: a typed reply there is a new question
    asked = (f"{pending['question']} {question}" if pending and not pending.get("offer") and not clicked
             and len(question.split()) <= 8 else question)
    # an LLM reads the question first; Jev then sorts which data it needs. Without
    # any LLM (all off or failed, session budget spent), keywords pick the skill
    # "halo", "makasih", "kamu siapa": Kodama answers in its own voice from code, no model call
    chat_kind = _small_talk(question)
    offer = context.pop("offer", None)
    if chat_kind == "yes" and offer:
        # "ya" to "Mau kubandingkan dengan provinsi tetangganya?": do what was offered, about what was asked
        asked, chat_kind = f"{previous or ''} {offer}".strip(), None
    plan = None
    budget = token_budget(user)
    if not chat_kind and st["tokens_in"] + st["tokens_out"] < budget:
        plan, u, planner = router.plan(asked, previous, context.get("region"),
                                       [_TOPICS[k][0] for k in context.get("topics", [])],
                                       sorted({f["table"] for f in tools.my_fields()})[:30])
        st["tokens_in"] += u.get("input", 0)
        st["tokens_out"] += u.get("output", 0)
    if chat_kind:
        skill, route_src, topic = "guide", "keyword", "umum"
    elif plan:
        skill, route_src = plan.skill, f"llm:{planner}"
        topic = (plan.topik_panduan or guide.pick(asked)) if skill == "guide" else None
        if skill in ("region", "ranking"):
            context["need"] = _need(plan)
    else:
        skill, route_src, topic = route(asked)
    if not chat_kind and user and skill != "my_data" and not _PLACES.search(asked) and not _region_in(asked):
        mine = tools.my_fields()
        own = _names_in({f["table"] for f in mine} | {f["device"] for f in mine}, asked)
        # a name of the user's own table or device ("dicha suka ngocok", "statius udara kaliurang") is their data,
        # never off-topic; one-word names that are also ordinary words ("cuaca") need a table or IoT word as well
        if own and (any(len(_words(n)) > 1 for n in own) or _TABLE.search(asked) or _IOT.search(asked)):
            skill = "my_data"
        # the session is about their sensors: "rata-rata suhu tanggal 9" or "tampilkan seluruh datanya" means
        # their data, not a region's, unless the question names a region
        elif (context.get("table") or context.get("reading")) and (
                _fields_named(asked, mine) or (context.get("table") and (_TABLE.search(asked) or _EVERY.search(asked)))):
            skill = "my_data"
    if (not chat_kind and skill == "my_data" and not _IOT.search(asked) and _region_in(asked)
            and (_topics_in(asked) or _metrics_named(asked, {}))
            and not any(len(_words(n)) > 1 and set(_words(n)) <= set(_words(asked))
                        for f in tools.my_fields() for n in (f["table"], f["device"]))):
        # "kualitas udara di Balikpapan" asks for the region's data, even when one of the
        # user's own tables is called "Ebony Balikpapan": that one is meant by its full name
        skill = "trend" if _wants_history(asked) else "region"
    if (not chat_kind and skill in ("my_data", "region", "ranking", "off_topic") and not _IOT.search(asked)
            and not (context.get("table") or context.get("reading")) and _region_history_request(asked, context)):
        skill = "trend"     # "lihat historisnya" after a region card: that region's data over time, not a table
    if not chat_kind and skill in ("region", "ranking", "trend", "events", "off_topic") and _compare_request(asked, context):
        skill = "compare"   # "tren PM2.5 Jakarta dan Bandung": one chart of both, not a ranking or two cards
    elif not chat_kind and skill in ("trend", "ranking", "region", "off_topic") and _event_trend_request(asked, context):
        skill = "events"    # "tren gempa sebulan": counts per day, not an indicator's trend
    if not chat_kind and mentioned:
        skill = "my_data"   # a device or table picked from the @ list is the user's own data, even named after a city
    if skill == "off_topic" and _missing_facility(asked):
        skill = "facilities"   # "rumah sakit di Bandung" is a data question we cannot answer yet, not off-topic
    if skill == "off_topic" and route_src == "keyword":
        if _target_region(asked, context):
            skill = "region"   # no keyword, but it names a region ("Riau?") or points back at one
        elif pending and asked != question:
            skill = pending["skill"]
    clarify = None
    if asked == question and skill in ("region", "events") and (amb := _ambiguous_region(question)):
        clarify = _region_choices(question, *amb)
    elif (asked == question and skill == "region" and not _ALL.search(question) and not _focus(question, context)
          and (where := _target_region(question, context))):
        clarify = _topic_choices(question, where)   # "kondisi Riau": which data?
    elif (asked == question and skill == "region" and (shown := _focus(question, context))
          and not _target_region(question, context) and not (context.get("region") or context.get("home"))):
        clarify = _where_choices(question, shown)   # "data laut": for which region?
    elif (asked == question and skill == "trend" and not _rank_metric(question, context)
          and not _region_history_request(question, context)):
        clarify = _trend_choices(question, context)  # "trennya bagaimana?": of what?
    elif (asked == question and skill == "trend"
          and not (_target_region(question, context) or context.get("region") or context.get("home"))):
        clarify = {"question": "Tren di wilayah mana? Tulis nama provinsi atau kab/kota.", "options": []}
    elif (asked == question and skill == "my_data" and user and not _STATS.search(question)
          and (_TABLE.search(question) or len(_names_in({f["table"] for f in tools.my_fields()}, question)) > 1)
          and not _table_request(question, context) and (tc := _table_choices(question))):
        clarify = tc                                # "tampilkan tabel saya": which table?
    elif (asked == question and skill == "my_data" and user and _HISTORY.search(question)
          and not _TABLE.search(question) and not _readings_request(question, context)
          and (fc := _field_choices(question))):
        clarify = fc                                # "rata-rata 24 jam terakhir": of which sensor?
    elif asked == question and skill == "facilities" and not _facility_kind(question) and not _missing_facility(question):
        clarify = _facility_choices(question)
    elif asked == question and skill == "ranking" and not _rank_metric(question, context):
        clarify = _rank_choices(question)           # "provinsi paling rawan": by what?
    elif asked == question and skill == "events" and not any(w in question.lower() for w in _EVENT_WORDS):
        clarify = _event_choices(question)          # "kejadian terbaru": which kind?
    yield "start", {"session_id": sid, "skill": "clarify" if clarify else skill, "route_source": route_src}
    answer, results, fallback, models, why = None, [], None, [], None
    finished = True
    used = st["tokens_in"] + st["tokens_out"]
    hist = history[-HISTORY_TURNS * 2:]
    no_llm = ("tidak ada LLM yang diset (GEMINI_API_KEY / cadangan)" if not (GEMINI_API_KEY or backup.providers())
              else f"batas token sesi habis ({used}/{budget}); mulai sesi baru"
              if used >= budget else None)

    if clarify:
        # no model call: the options come from the data and the router
        context["pending"] = {"question": question, "skill": skill,
                              "options": [o["question"] for o in clarify["options"]],
                              "labels": [o["label"] for o in clarify["options"]]}
        skill, answer = "clarify", clarify["question"]
        yield "token", {"text": answer}
    elif skill == "my_data" and not user:
        answer = guide.SIGN_IN                       # deliberate reply, no model call
        yield "token", {"text": answer}
    elif (skill == "my_data" and _OVERVIEW.search(asked) and not _fields_named(asked, tools.my_fields())
          and not _table_request(asked, context) and not _readings_request(asked, context)):
        # "data iot apa saja yang bisa kulihat": the devices and tables, counted by code, with a button per table
        results = [tools.call("my_data", {})]
        yield "step", {"tool": "my_data", "args": {}}
        answer = _overview(results[0]["data"]) if not results[0].get("error") else render_template(results)
        yield "token", {"text": answer}
        if opts := (_table_choices("") or {}).get("options"):
            clarify = {"question": "Tabel mana yang ingin kamu lihat?", "options": opts}
    elif chat_kind:
        name = user and user.get("name")
        answer = {"hello": lambda: guide.greeting(name, bool(user)), "thanks": lambda: guide.thanks(name),
                  "who": lambda: guide.intro(bool(user)), "yes": guide.ready, "no": guide.declined}[chat_kind]()
        yield "token", {"text": answer}
        if chat_kind in ("hello", "who", "yes"):
            clarify = _starters(user, home)
    elif skill == "off_topic":
        answer = guide.off_topic(bool(user))         # deliberate reply, not a failure: no fallback
        yield "token", {"text": answer}
        clarify = _starters(user, home)
    elif skill == "facilities" and (missing := _missing_facility(asked)):
        # an honest "not yet", with what does exist, instead of off-topic or a guess
        answer = (f"Data lokasi {missing} belum tersedia di Arkamap. Data fasilitas yang sudah ada: pembangkit "
                  "listrik (nama, kapasitas, bahan bakar) dan halte TransJakarta (khusus Jakarta).")
        yield "token", {"text": answer}
    elif skill == "guide":
        results = [tools.call("guide", {"topic": topic or guide.pick(asked)})]
        yield "step", {"tool": "guide", "args": {"topic": results[0]["data"]["topic"]}}
        if no_llm:
            fallback = no_llm
        else:
            d = results[0]["data"]
            system = GUIDE_SYSTEM.format(title=d["title"], text=d["text"])
            # numbers the user wrote ("ditolak 429") are theirs, not invented
            answer, finished, models, why = yield from _write(
                _llm_once(system, hist, asked) if GEMINI_API_KEY else None, lambda: system,
                hist, asked, results, [{"data": asked}], st)
    elif no_llm:
        fallback = no_llm
    else:
        def data_system() -> str:
            # backups have no tools: if Gemini failed before fetching, fetch by rule
            if not _usable(results):
                results[:] = _fallback_calls(skill, asked, context)
            data = json.dumps(_for_model([{k: r.get(k) for k in ("tool", "data", "sources")}
                                          for r in _usable(results)]),
                              default=str, separators=(",", ":"), ensure_ascii=False)
            return (SYSTEM + persona + " Jawab hanya dari DATA berikut (hasil tool, satu-satunya sumber angka); "
                    "sebut wilayah dan periodenya.\n\nDATA:\n" + data)

        lead = ""
        if pre := _prefetch(skill, asked, context):
            results = pre
            for r in pre:
                yield "step", {"tool": r["tool"], "args": {}}
                if r.get("viz"):
                    yield "viz", r["viz"]
            if all(r["tool"] == "my_table" for r in pre):
                # the table component shows the rows; a model would only copy them into a second, messier table
                answer = _table_summary(pre[0]["data"])
                yield "token", {"text": answer}
            else:
                # written by code, not left to the model: the reader must know this is their own sensor's data
                if lead := _iot_source(pre) if skill == "my_data" else "":
                    yield "token", {"text": lead}
                system = data_system() + (" Kalimat pembuka yang menyebut alat, tabel, dan field sumber datanya "
                                          "sudah ditulis; lanjutkan tanpa mengulanginya." if lead else "")
                primary = _llm_once(system, hist, asked) if GEMINI_API_KEY else None
                backup_system = lambda: system  # noqa: E731
        else:
            primary = _llm_steps(skill, hist, asked, context, results, persona) if GEMINI_API_KEY else None
            backup_system = data_system
        if answer is None:
            # in the user's own data questions, numbers they wrote ("alat ke-2") are theirs too
            answer, finished, models, why = yield from _write(
                primary, backup_system, hist, asked, results, [{"data": asked}] if skill == "my_data" else [], st)
            answer = lead + answer

    if not answer or not finished:
        # Never replace what the reader already saw: the template is added
        # after it. Prefer what the model already fetched (it understood the
        # question); guess tools from keywords only when nothing usable was fetched.
        fallback = fallback or why
        fetched = _usable(results)
        results = fetched or _fallback_calls(skill, asked, context)
        tail = render_template(results)
        yield "token", {"text": f"\n\nRingkasan dari data: {tail}" if answer else tail}
        answer = f"{answer}\n\nRingkasan dari data: {tail}" if answer else tail
        if not fetched:
            for r in results:
                if r.get("viz"):
                    yield "viz", r["viz"]

    if (not clarify and skill == "region" and _focus(asked, context) is None
            and (where := next((r["data"] for r in results if r["tool"] == "region_summary" and not r.get("error")), None))):
        # a summary of everything: offer the usual next steps instead of leaving the reader to guess them
        if (clarify := _next_steps(where, results)):
            context["pending"] = {"question": asked, "skill": skill, "options": [o["question"] for o in clarify["options"]],
                                  "labels": [o["label"] for o in clarify["options"]], "offer": True}
    if models and (m := re.search(r"([^.!?\n]*\?)\s*$", answer or "")):
        context["offer"] = m.group(1).strip()   # the model's closing offer, for a "ya" next turn
    session.remember_region(context, results)
    if read := next((r["data"] for r in results if r["tool"] == "my_readings" and not r.get("error")), None):
        # the sensor under discussion: "naik atau turun?" next asks about the same field and window
        context["reading"] = {k: read.get(k, 24 if k == "hours" else None) for k in ("field", "device", "table", "hours")}
        if read.get("since"):
            context["reading"] |= {"since": str(read["since"]), "until": str(read["until"])}
    if tab := next((r["data"] for r in results if r["tool"] == "my_table" and not r.get("error")), None):
        # the table under discussion: "tampilkan hanya suhu" or "yang tanggal 7 saja" next stays on it
        context["table"] = {"table": tab["table"], "device": tab["device"],
                            "fields": [c["key"] for c in tab["columns"]] if tab["filtered"] else None,
                            "since": str(tab["since"]) if tab.get("since") else None,
                            "until": str(tab["until"]) if tab.get("until") else None}
    if skill in ("region", "ranking", "events", "trend"):
        # the data under discussion carries over to the next question of the session
        # ("kualitas udara nasional" -> "detail di Kalimantan"); asking for everything clears it
        ranked = [m for r in results if r["tool"] == "rank_regions" and not r.get("error") for m in r["data"]["weights"]] \
            + [r["data"]["metric"] for r in results if r["tool"] == "trend" and not r.get("error")]
        if ranked:
            context["rank_metric"] = ranked[0]
        if (context.get("need") or {}).get("all") or _ALL.search(asked):
            context["topics"], context["metrics"] = [], []
        else:
            # metrics only when asked for by name: after "PM2.5 nasional", "detail di Kalimantan" shows all air data
            topics, metrics = _wanted(asked, context)
            topics = topics or [k for k, (*_, ms) in _TOPICS.items() if ms & set(metrics or ranked)]
            if topics:
                context["topics"], context["metrics"] = topics, metrics
    context.pop("need", None)   # this turn's reading only
    said = answer if not clarify else answer + " Pilihan: " + "; ".join(o["label"] for o in clarify["options"])
    history += [{"role": "user", "content": question},
                {"role": "assistant", "content": said[:HISTORY_ANSWER_CHARS]}]
    st["history"] = history[-HISTORY_TURNS * 2:]
    st["turns"] += 1
    session.save(sid, st)
    yield "done", {
        "session_id": sid, "answer": answer, "skill": skill, "route_source": route_src, "topic": topic,
        "clarify": clarify,
        "fallback": fallback,
        "models": models,
        "context": context,
        "tokens": {"input": st["tokens_in"], "output": st["tokens_out"],
                   "budget": budget},
        "tool_calls": [{"tool": r["tool"], "error": r.get("error")} for r in results],
        "sources": sorted({s for r in results for s in r.get("sources", [])}),
        "viz": [r["viz"] for r in results if r.get("viz")],
    }
