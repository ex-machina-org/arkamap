"""Chat session state in Postgres: history, conversation context and the
token count the per-session budget is checked against."""
from psycopg.types.json import Jsonb

from ..db import execute, query_one


def load(sid: str) -> dict:
    row = query_one("SELECT history, context, turns, tokens_in, tokens_out FROM agent_session"
                    " WHERE id = %s", (sid,))
    return row or {"history": [], "context": {}, "turns": 0, "tokens_in": 0, "tokens_out": 0}


def save(sid: str, s: dict) -> None:
    execute(
        """
        INSERT INTO agent_session (id, history, context, turns, tokens_in, tokens_out)
        VALUES (%(id)s, %(history)s, %(context)s, %(turns)s, %(tokens_in)s, %(tokens_out)s)
        ON CONFLICT (id) DO UPDATE SET
          history = EXCLUDED.history, context = EXCLUDED.context, turns = EXCLUDED.turns,
          tokens_in = EXCLUDED.tokens_in, tokens_out = EXCLUDED.tokens_out, updated_at = now()
        """,
        {**s, "id": sid, "history": Jsonb(s["history"]), "context": Jsonb(s["context"])},
    )


def remember_region(context: dict, results: list[dict]) -> dict:
    """The last region a tool actually resolved becomes the session's
    'di sana'. Only tool output counts, never the model's own wording."""
    for r in results:
        d = r.get("data") or {}
        if r.get("tool") == "region_summary" and d.get("id"):
            context["region"] = {"id": d["id"], "name": d["name"], "level": d["level"]}
        elif r.get("tool") in ("events", "trend", "facilities") and d.get("region"):
            context["region"] = d["region"]
    return context
