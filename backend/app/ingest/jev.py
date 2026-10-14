"""TypeSafe Jev: structured decisions this project can't get from a linear
formula.

PARKED: not called anywhere right now. Quake urgency uses the rules in
seismic.urgency() instead, because Jev's per-call cost doesn't fit a task
that runs on every quake of every refresh. Kept as-is to switch back on
for low-volume decisions later (import it where needed).

classify_quake_urgency_jev(): USGS gives every event mag + depth_km + a free
-text place + a tsunami flag, and depth matters as much as magnitude (a
shallow M6 near a coast is far more dangerous than a deep M6), a nuance a
flat magnitude threshold misses. Jev turns that into an action-oriented
category the frontend can render directly.

Returns None (never raise) with no TYPESAFE_API_KEY set, or an API error,
or a low-confidence answer — callers fall back to their pre-Jev behaviour
exactly.
"""
import logging

from typesafe_sdk import TypeSafeRateLimitError

from ..config import TYPESAFE_API_KEY

log = logging.getLogger(__name__)

__all__ = ["classify_quake_urgency_jev", "TypeSafeRateLimitError"]

_client = None


def _get_client():
    """Built once and reused: the SDK's HTTP client keeps a connection
    pool, so a new instance per call would reconnect on every event."""
    global _client
    if _client is None:
        from typesafe_sdk import TypeSafeClient
        _client = TypeSafeClient(api_key=TYPESAFE_API_KEY)
    return _client


_QUAKE_LEVELS = ("informasi", "pantau", "siaga_tsunami", "darurat")

_QUAKE_CRITERIA = {
    "informasi": "Minor or routine event, no real threat: small magnitude, or deep enough that shaking at the surface is minimal.",
    "pantau": "Worth watching: moderate magnitude and/or shallow enough to be felt, but not immediately dangerous.",
    "siaga_tsunami": "Shallow, offshore/coastal event with real tsunami potential — USGS tsunami flag set, or shallow+high magnitude near the coast.",
    "darurat": "Shallow, high-magnitude event likely to cause damage and casualties near populated areas.",
}


def classify_quake_urgency_jev(mag: float, depth_km: float | None, place: str | None, tsunami: bool) -> tuple[str, float] | None:
    """Best-effort urgency category for one earthquake event. Returns
    (level, confidence) or None — never raises. A flat magnitude threshold
    can't tell a shallow coastal M6 (dangerous) from a deep inland M6
    (barely felt); Jev reasons over mag+depth+place+tsunami together."""
    if not TYPESAFE_API_KEY:
        return None

    try:
        from typesafe_sdk import Choice, TypeSafeError

        client = _get_client()
        response = client.system_one(
            state={
                "mag": mag,
                "depth_km": depth_km,
                "place": place,
                "tsunami": tsunami,
            },
            questions={
                "urgency": Choice(
                    instructions=(
                        "This is a real earthquake event from USGS. Based on its "
                        "magnitude, depth, location, and tsunami flag, how urgent "
                        "is it for a public monitoring dashboard?"
                    ),
                    criteria=_QUAKE_CRITERIA,
                ),
            },
        )
        answer = response.choices["urgency"]
        if answer.confidence < 0.5 or answer.choice not in _QUAKE_LEVELS:
            return None
        return answer.choice, answer.confidence
    except TypeSafeRateLimitError:
        raise
    except TypeSafeError as exc:
        log.warning("jev klasifikasi gempa gagal: %s", exc)
        return None
    except Exception:  # noqa: BLE001 - classification is a nice-to-have, never fatal to ingest
        log.exception("jev klasifikasi gempa error tak terduga")
        return None


def demo() -> None:
    """No API key needed: proves the safe-fallback paths never raise and
    never call out, which is the one thing that must never break — a bug
    here would mean a missing key or a flaky API taking down ingest
    instead of just leaving quakes without an urgency."""
    import os

    assert TYPESAFE_API_KEY == "" or os.getenv("TYPESAFE_API_KEY"), (
        "TYPESAFE_API_KEY tidak sinkron dengan env — restart proses?"
    )
    if TYPESAFE_API_KEY:
        print("TYPESAFE_API_KEY diset — demo ini tidak memanggil API sungguhan.")
        print("Jalankan classify_quake_urgency_jev() manual untuk uji end-to-end.")
        return
    assert classify_quake_urgency_jev(6.5, 10.0, "Sumatra", True) is None, \
        "harus None tanpa API key, bukan memanggil API atau raise"
    print("ok: fallback aman tanpa TYPESAFE_API_KEY (None, tidak ada panggilan API)")


if __name__ == "__main__":
    demo()
