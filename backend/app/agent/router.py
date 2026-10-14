"""Intent -> skill (and, for how-to questions, the guide topic).

plan(): an LLM reads the question first, with the data catalog of AGENT.md in
view, and says what the user wants: the skill and the exact data topics and
metrics. Gemini, else free OpenRouter models, else the operator's DeepSeek.
route(): when every LLM failed, Jev picks the skill; keyword rules when Jev
is off or unsure. Never raises."""
import json
import logging
import time
from concurrent.futures import ThreadPoolExecutor
from typing import Literal

import httpx
from pydantic import BaseModel, Field

from ..config import (DEEPSEEK_API_KEY, DEEPSEEK_BASE_URL, DEEPSEEK_MODEL, GEMINI_API_KEY, JEV_MODEL, LLM_MODEL,
                      OPENROUTER_API_KEY, OPENROUTER_PLAN_MODELS)
from . import catalog, guide
from .tools import SKILLS

log = logging.getLogger(__name__)

# part of the 30 s edge-proxy budget, see agent.LLM_DEADLINE_S: every planner
# together gets PLAN_BUDGET_S, Gemini and OpenRouter at most PLANNER_CAP_S each so
# a slow one still leaves DeepSeek its turn (a refusal such as 429 returns at once)
PLAN_BUDGET_S = 9
PLANNER_CAP_S = 3.5
JEV_TIMEOUT_S = 3
# Gemini refuses a request deadline under 10 s, so its cap is ours: the call runs
# here and is abandoned (it ends by itself at 10 s) when it takes longer.
# Limit: an abandoned call holds a worker up to 10 s; raise max_workers if plans queue
_PLAN_POOL = ThreadPoolExecutor(max_workers=8, thread_name_prefix="plan")


class Plan(BaseModel):
    skill: Literal[tuple(SKILLS)] = Field(description="skill yang menjawab pertanyaan")  # type: ignore[valid-type]
    pemahaman: str = Field(description=("Satu kalimat: data spesifik apa yang diminta pengguna, untuk wilayah "
                                        "mana, dan rentang waktunya. Contoh: 'indeks kualitas udara (AQI) di "
                                        "Kota Balikpapan saat ini'."))
    semua_data: bool = Field(False, description="true hanya bila pengguna meminta semua/seluruh/lengkap data")
    topik: list[Literal[tuple(catalog.TOPICS)]] = Field(  # type: ignore[valid-type]
        [], description="topik data yang ditanyakan (lihat katalog), mis. ['laut']; kosong bila tidak menyebut topik")
    metrik: list[str] = Field([], description=("nama metrik persis dari katalog bila pengguna menanyakan data "
                                               "spesifik, mis. 'tinggi gelombang' -> ['wave_height_max']"))
    topik_panduan: Literal[tuple(guide.TOPICS)] | None = Field(  # type: ignore[valid-type]
        None, description="hanya untuk skill guide: " + "; ".join(f"{k} = {v[1]}" for k, v in guide.TOPICS.items()))


PLAN_SYSTEM = (
    "Kamu perencana asisten Arkamap (data lingkungan Indonesia dan alat IoT milik pengguna). Pahami maksud "
    "pertanyaan pengguna, termasuk yang merujuk ke percakapan sebelumnya, lalu pilih satu skill:\n"
    + "\n".join(f"- {k}: {v['when']}" for k, v in SKILLS.items())
    + "\nPertanyaan yang meminta daftar wilayah yang punya suatu data, atau perbandingan antarwilayah, "
    "memakai skill ranking dengan metrik itu; begitu juga data \"nasional\" atau \"se-Indonesia\". Perbandingan "
    "dari waktu ke waktu (tren, grafik, riwayat, \"sebulan terakhir\") antara wilayah yang disebut, atau beberapa "
    "data di satu wilayah, memakai skill compare. Pertanyaan "
    "lanjutan yang tidak menyebut data baru (\"detail di Kalimantan\") tetap tentang data yang sedang dibahas: "
    "isi topik dan metriknya dengan data itu; \"detail di <wilayah>\" memakai skill region. Permintaan melihat suatu data tanpa menyebut wilayah "
    "(\"lihat data laut\") memakai skill region; agen akan menanyakan wilayahnya. Jangan menebak: isi topik "
    "dan metrik hanya bila pengguna menyebut datanya; \"provinsi paling rawan\" tanpa menyebut rawan apa "
    "berarti metrik kosong, agen akan bertanya balik.\n\n" + catalog.data()
)
# models without structured output get the shape as an example, not a JSON schema (some echo a schema back)
PLAN_JSON = (
    "\n\nBalas HANYA satu objek JSON, tanpa teks lain, contoh:\n"
    '{"skill": "region", "pemahaman": "indeks kualitas udara (AQI) di Kota Balikpapan saat ini", '
    '"semua_data": false, "topik": ["udara"], "metrik": ["aqi_forecast_max"], "topik_panduan": null}\n'
    + "\n".join(f"- {k}: {f.description}" for k, f in Plan.model_fields.items())
    + f"\n- skill salah satu dari: {', '.join(SKILLS)}"
)


def _state(question: str, previous: str | None, region: dict | None, topics: list[str] | None = None,
           own_tables: list[str] | None = None) -> str:
    """The question, with the previous turn, the region and data under discussion
    for follow-ups, and the names of the user's own IoT tables (any name, even a
    person's or a joke, is their data, not off-topic)."""
    if not (previous or region or topics or own_tables):
        return question
    return "\n".join(filter(None, [
        f"Pertanyaan sebelumnya: {previous}" if previous else None,
        f"Wilayah yang sedang dibahas: {region['name']}" if region else None,
        f"Data yang sedang dibahas: {', '.join(topics)}" if topics else None,
        f"Tabel data alat IoT milik pengguna (skill my_data): {', '.join(own_tables)}" if own_tables else None,
        f"Pertanyaan sekarang: {question}",
    ]))


def _gemini(state: str) -> tuple[Plan | None, dict[str, int]]:
    from langchain_google_genai import ChatGoogleGenerativeAI
    llm = ChatGoogleGenerativeAI(model=LLM_MODEL, google_api_key=GEMINI_API_KEY, temperature=0,
                                 timeout=10, max_retries=0)
    out = llm.with_structured_output(Plan, include_raw=True).invoke([("system", PLAN_SYSTEM), ("human", state)])
    um = getattr(out["raw"], "usage_metadata", None) or {}
    return out.get("parsed"), {"input": um.get("input_tokens", 0), "output": um.get("output_tokens", 0)}


def _openai(url: str, key: str, extra: dict):
    """A planner on an OpenAI-compatible endpoint, in JSON mode."""
    def call(state: str, timeout: float) -> tuple[Plan | None, dict[str, int]]:
        r = httpx.post(url, headers={"Authorization": f"Bearer {key}"}, timeout=timeout, json={
            **extra, "temperature": 0, "response_format": {"type": "json_object"},
            "messages": [{"role": "system", "content": PLAN_SYSTEM + PLAN_JSON}, {"role": "user", "content": state}]})
        r.raise_for_status()
        d = r.json()
        u = d.get("usage") or {}
        text = d["choices"][0]["message"]["content"].strip().removeprefix("```json").strip("`").strip()
        return Plan.model_validate(json.loads(text)), {"input": u.get("prompt_tokens", 0),
                                                       "output": u.get("completion_tokens", 0)}
    return call


def _planners() -> list[tuple[str, object, float]]:
    """(name, fn(state, timeout), its own cap) in fallback order."""
    out = []
    if GEMINI_API_KEY:
        out.append(("gemini", lambda state, timeout: _gemini(state), PLANNER_CAP_S))
    if OPENROUTER_API_KEY and OPENROUTER_PLAN_MODELS:
        # one request: OpenRouter moves to the next model itself when one is rate-limited
        out.append(("openrouter", _openai("https://openrouter.ai/api/v1/chat/completions", OPENROUTER_API_KEY,
                                          {"models": OPENROUTER_PLAN_MODELS}), PLANNER_CAP_S))
    if DEEPSEEK_API_KEY:
        out.append(("deepseek", _openai(f"{DEEPSEEK_BASE_URL}/chat/completions", DEEPSEEK_API_KEY,
                                        {"model": DEEPSEEK_MODEL, "thinking": {"type": "disabled"}}), PLAN_BUDGET_S))
    return out


def plan(question: str, previous: str | None = None, region: dict | None = None,
         topics: list[str] | None = None, own_tables: list[str] | None = None) -> tuple[Plan | None, dict[str, int], str | None]:
    """(the LLM's reading of the question, token usage, which planner read it).
    Planners are tried in order within PLAN_BUDGET_S; (None, usage, None) when
    none is set or all fail, and the caller then routes with route()."""
    state = _state(question, previous, region, topics, own_tables)
    deadline = time.monotonic() + PLAN_BUDGET_S
    usage = {"input": 0, "output": 0}
    for name, fn, cap in _planners():
        left = min(cap, deadline - time.monotonic())
        if left < 1:
            break
        try:
            p, u = _PLAN_POOL.submit(fn, state, left).result(timeout=left)
        except Exception as exc:  # noqa: BLE001 - planning must degrade, not fail
            log.warning("perencana %s gagal: %r", name, exc)
            continue
        usage = {k: usage[k] + u.get(k, 0) for k in usage}
        if p:
            return p, usage, name
        log.warning("perencana %s: jawaban tidak terbaca", name)
    return None, usage, None


# the user's own data first ("alat saya"), then how-to phrasing: "cara melihat gempa di peta"
# asks about the product, not for data
_KEYWORDS = {
    "my_data": ("alat saya", "alatku", "sensor saya", "sensorku", "perangkat saya", "data saya", "dataku",
                "profil saya", "milik saya", "punya saya", "wilayah pantauan saya"),
    "guide": ("cara ", "caranya", "tutorial", "panduan", "langkah", "bagaimana menambah", "gimana menambah",
              "api key", "kunci api", "iot", "sensor", "alat ", "alat saya", "perangkat", "kiriman",
              "ditolak", "mqtt", "payload", "esp32", "arduino", "akun", "login", "password", "apa itu",
              "arti ", "maksudnya", "fitur", "kamu bisa", "arkamap", "data apa"),
    "alerts": ("waspada", "peringatan", "darurat", "notifikasi", "alert"),
    "facilities": ("pembangkit", "pltu", "pltg", "halte", "transjakarta", "busway", "rumah sakit", "puskesmas",
                   "klinik", "spklu"),
    "trend": ("tren", "naik", "turun", "perubahan", "dibanding", "riwayat", "dari waktu ke waktu"),
    "events": ("gempa", "panas", "hotspot", "kejadian", "erupsi", "gunung", "banjir",
               "bencana", "siklon", "kekeringan", "longsor"),
    "ranking": ("peringkat", "ranking", "paling", "tertinggi", "terendah", "rawan", "bandingkan", "nasional",
                "terbanyak", "tersedikit", "terpadat"),
    "region": ("kondisi", "data", "ringkasan", "bagaimana"),
}


def route_keywords(q: str) -> str | None:
    """None = no keyword at all; the agent decides between a region name and off_topic."""
    q = q.lower() + " "
    for skill, words in _KEYWORDS.items():  # dict order = priority
        if any(w in q for w in words):
            return skill
    return None


def _jev_skill(question: str) -> str | None:
    """Jev's skill choice when it is sure (probability >= 0.5); None when off, unsure or failing."""
    if not OPENROUTER_API_KEY:
        return None
    try:
        r = httpx.post(
            "https://openrouter.ai/api/alpha/decisions",
            headers={"Authorization": f"Bearer {OPENROUTER_API_KEY}"},
            json={"model": JEV_MODEL, "state": question,
                  "questions": {"skill": {"type": "choice",
                                          "instructions": ("Pilih skill yang paling tepat untuk pertanyaan pengguna "
                                                           "Arkamap (data lingkungan Indonesia dan alat IoT pengguna)."),
                                          "criteria": {k: v["when"] for k, v in SKILLS.items()}}}},
            timeout=JEV_TIMEOUT_S)
        r.raise_for_status()
        a = r.json()["answers"]["skill"]
        p = float((a.get("probabilities") or {}).get(a["choice"], 1.0))
        return a["choice"] if a["choice"] in SKILLS and p >= 0.5 else None
    except Exception as exc:  # noqa: BLE001 - routing must degrade, not fail
        log.warning("jev routing gagal, pakai keyword: %s", exc)
        return None


def route(question: str) -> tuple[str, str, str | None]:
    """Skill routing for when no LLM could read the question: Jev, else keyword
    rules. (skill, source 'jev' | 'keyword', guide topic); the topic is set only
    for skill 'guide'."""
    if skill := _jev_skill(question):
        return skill, "jev", guide.pick(question) if skill == "guide" else None
    skill = route_keywords(question) or "off_topic"   # the agent turns this back into "region" for a named region
    return skill, "keyword", guide.pick(question) if skill == "guide" else None
