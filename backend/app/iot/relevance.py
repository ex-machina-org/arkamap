"""Read a user's own description ("who I am, what I want to watch") and
decide what their dashboard shows: the closest view template (field), the
metrics that fit, and an honest note about anything we have no data for.
Users never pick a field themselves."""
import logging
from typing import Literal

from pydantic import BaseModel, Field

from .. import fields, modes
from ..config import GEMINI_API_KEY, LLM_MODEL
from ..db import query

log = logging.getLogger(__name__)

# Fallback when the AI is off or fails: keyword in the description -> field.
_RULES = [
    (("nelayan", "laut", "pesisir", "kapal", "perahu", "pelabuhan", "tambak", "pantai"), "nelayan"),
    (("pemadam", "damkar", "karhutla", "kebakaran", "manggala"), "pemadam"),
    (("tani", "sawah", "kebun", "pertanian", "ladang", "petani"), "pertanian"),
    (("plts", "surya", "energi", "listrik", "solar", "pln"), "energi"),
    (("udara", "polusi", "kesehatan", "dinkes", "puskesmas", "ispa"), "kesehatan"),
    (("kota", "urban", "planner", "tata", "transport", "dishub", "pemkot", "bappeda"), "tata_kota"),
    (("bencana", "bpbd", "sar", "gempa", "banjir", "relawan", "basarnas"), "bencana"),
    (("lingkungan", "dlh", "peneliti", "klhk", "konservasi"), "lingkungan"),
]


# Data we have that is NOT a per-region metric; without this list the model
# wrongly reports e.g. wind direction or live hotspot maps as missing.
OTHER_DATA = [
    "Titik panas/api satelit (NASA FIRMS, 4 satelit, diperbarui beberapa kali sehari, resolusi 375 m) sebagai peta titik",
    "Arah dan kecepatan angin dalam grid seluruh Indonesia (animasi partikel angin)",
    "Katalog gempa terbaru (USGS + EMSC/BMKG) dengan magnitudo, kedalaman, lokasi",
    "Bencana: erupsi, banjir, kebakaran hutan besar, siklon (GDACS dan NASA EONET) dengan tingkat peringatan",
    "Jejak bangunan OpenStreetMap di 18 kota besar",
    "Area yang terjangkau dalam N menit berkendara/jalan kaki/sepeda dari satu titik (isochrone)",
    "Halte TransJakarta (hanya DKI Jakarta)",
    "Data sensor IoT milik pengguna sendiri (isi bebas, dikirim lewat HTTP/MQTT) dibandingkan dengan data wilayah",
]


class Pick(BaseModel):
    metric: str
    reason: str = Field(description="satu kalimat singkat kenapa relevan bagi pengguna ini")


class Reading(BaseModel):
    mode: Literal["protected", "responden", "plan"] = Field(description=(
        "protected = turun ke lapangan saat kejadian; responden = mencegah sebelum terjadi; "
        "plan = merencanakan ke depan"))
    field: str = Field(description="id bidang yang PALING mendekati; 'umum' bila tidak ada yang mendekati")
    fit: Literal["cocok", "sebagian", "tidak_cocok"] = Field(description=(
        "cocok = kebutuhan pengguna tertutup data kami; sebagian = sebagian saja; "
        "tidak_cocok = data kami hampir tidak menjawab kebutuhannya"))
    metrics: list[Pick] = Field(description="0-8 metrik yang benar-benar relevan, urut dari terpenting")
    unsupported: list[str] = Field(description=(
        "hal yang pengguna minta atau butuhkan tetapi TIDAK ada di data kami, "
        "mis. 'jumlah kendaraan', 'kualitas air sungai'; kosong bila semua tersedia"))
    message: str = Field(description=(
        "1-3 kalimat bahasa Indonesia untuk pengguna: apa yang bisa kami tampilkan untuknya, "
        "dan terus terang bila bidang/kebutuhannya belum didukung data kami. Tanpa angka."))


def rule_reading(text: str, mode: str | None = None, known: set[str] | None = None) -> dict:
    t = text.lower()
    fid = next((f for words, f in _RULES if any(w in t for w in words)), None)
    f = fields.get(fid)
    mode_id = mode or modes.rule_mode(text)
    picked = modes.order_metrics(mode_id, f["metrics"], known if known is not None else set(f["metrics"]))
    return {
        "field": f["id"], "fit": None, "unsupported": [], "by": "rule",
        "mode": mode_id, "mode_by": "user" if mode else "rule",
        "metrics": [{"metric": m, "reason": f"bagian dari tampilan {f['label']} (mode {modes.get(mode_id)['label']})"}
                    for m in picked],
        "message": (f"Tampilan disesuaikan untuk {f['label']} berdasarkan kata kunci; AI sedang tidak tersedia "
                    "untuk menilai kecocokan data." if fid else
                    "Kami belum bisa menilai kebutuhan Anda (AI sedang tidak tersedia), jadi yang tampil "
                    "adalah ringkasan umum. Coba simpan profil lagi nanti."),
    }


def rule_pick(role: str) -> list[dict]:
    """Metrics only; kept for callers/tests that need just the list."""
    return rule_reading(role)["metrics"]


def read_profile(role: str, goals: str | None, mode: str | None = None) -> dict:
    """{field, mode, mode_by, fit, metrics, unsupported, message, by}.
    `mode` given = the user chose it; otherwise the AI (or keywords) pick
    one. Unknown field ids and metrics from the model are dropped."""
    text = f"{role}. {goals or ''}"
    catalog = query("SELECT metric, label, aspect, description FROM metric_def ORDER BY aspect, metric")
    known = {m["metric"] for m in catalog}
    if GEMINI_API_KEY:
        try:
            from langchain_google_genai import ChatGoogleGenerativeAI
            llm = ChatGoogleGenerativeAI(model=LLM_MODEL, google_api_key=GEMINI_API_KEY,
                                         temperature=0, timeout=15, max_retries=0)  # < 30 s proxy limit
            res = llm.with_structured_output(Reading).invoke(
                "Pengguna platform data lingkungan Indonesia menjelaskan dirinya sendiri. Tentukan "
                "tampilan yang paling cocok, metrik yang relevan, dan JUJUR sebutkan kebutuhan yang tidak "
                "bisa kami jawab. Jangan memaksakan kecocokan: bila bidangnya tidak ada atau datanya "
                "kurang nyambung, katakan begitu.\n"
                f"Penjelasan pengguna:\nPeran: {role}\nIngin memantau / tujuan: {goals or '-'}\n\n"
                + (f"Mode DITETAPKAN pengguna: {mode} ({modes.get(mode)['title']}). Isi mode dengan itu dan "
                   "pilih metrik yang cocok untuk mode tersebut.\n" if mode else
                   "Tentukan mode yang paling cocok dari penjelasannya.\n")
                + "Mode (sudut pandang waktu):\n"
                + "\n".join(f"- {k}: {m['title']}. {m['description']}" for k, m in modes.MODES.items())
                + "\n\n"
                "Bidang tampilan yang tersedia:\n"
                + "\n".join(f"- {f['id']}: {f['label']}. {f['description']}" for f in fields.catalogue())
                + "\n\nMetrik per wilayah yang tersedia (untuk daftar metrics, hanya id ini):\n"
                + "\n".join(f"- {m['metric']} [{m['aspect']}]: {m['label']}. {m['description'][:110]}"
                            for m in catalog)
                + "\n\nData lain yang juga tersedia (bukan metrik, tapi JANGAN disebut tidak tersedia):\n"
                + "\n".join(f"- {d}" for d in OTHER_DATA))
            f = fields.get(res.field)
            return {"field": f["id"], "fit": res.fit, "by": "ai",
                    "mode": mode or res.mode, "mode_by": "user" if mode else "ai",
                    "metrics": [p.model_dump() for p in res.metrics if p.metric in known][:8],
                    "unsupported": [u for u in res.unsupported if u.strip()][:10],
                    "message": res.message}
        except Exception as exc:  # noqa: BLE001
            log.warning("baca profil AI gagal, pakai kata kunci: %s", exc)
    return rule_reading(text, mode, known)
