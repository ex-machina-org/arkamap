import json
import logging
import time
from collections import defaultdict, deque

from fastapi import APIRouter, Depends, HTTPException, Request
from fastapi.responses import StreamingResponse
from pydantic import BaseModel, Field

from ..agent import agent, session, tools
from ..auth import optional_user
from ..config import AGENT_RATE_GLOBAL, AGENT_RATE_PER_CLIENT
from .schemas import ChatResponse, ErrorResponse, SessionState


log = logging.getLogger(__name__)
# Access is checked app-wide (clients.require_app_key); only the rate limit is here.
router = APIRouter()


class ChatRequest(BaseModel):
    question: str = Field(min_length=1, max_length=1000)
    session_id: str | None = Field(None, max_length=64, pattern=r"^[A-Za-z0-9_-]+$")


RATE_WINDOW = 60  # seconds
# ponytail: in-memory sliding windows, per process; use Redis if the API runs several workers
_hits: dict[str, deque] = defaultdict(deque)
_EVERYONE = "*"


def client_key(request: Request, user: dict | None) -> str:
    """Whose quota a chat counts against: the account when signed in, else the
    visitor's IP: X-Arkamap-Client-IP from the frontend's Vercel function (whose
    own address every guest would otherwise share), else the edge's X-Real-IP
    (users.client_ip). A forged header only moves a guest to another bucket; the
    shared limit still holds."""
    if user:
        return f"user:{user['id']}"
    from .users import client_ip   # late: the users module pulls in the whole IoT stack
    return "ip:" + (request.headers.get("x-arkamap-client-ip") or client_ip(request))


def check_rate(key: str, now: float | None = None) -> tuple[int, str]:
    """Records a hit for `key` and for everyone; returns (0, "") if allowed, else
    (seconds until a slot frees, "client" or "global" for which limit was hit)."""
    now = time.monotonic() if now is None else now
    for k, limit, scope in ((key, AGENT_RATE_PER_CLIENT, "client"), (_EVERYONE, AGENT_RATE_GLOBAL, "global")):
        q = _hits[k]
        while q and now - q[0] >= RATE_WINDOW:
            q.popleft()
        if len(q) >= limit:
            return int(RATE_WINDOW - (now - q[0])) + 1, scope
    _hits[key].append(now)
    _hits[_EVERYONE].append(now)
    if len(_hits) > 5000:   # forget idle visitors so the table does not grow with every IP ever seen
        for k in [k for k, q in _hits.items() if not q or now - q[-1] >= RATE_WINDOW]:
            del _hits[k]
    return 0, ""


def _limit(request: Request, user: dict | None) -> None:
    # every chat can cost several LLM calls, and the free quotas are small
    if agent.unlimited(user):
        return   # not counted either, so it never uses up the shared limit
    wait, scope = check_rate(client_key(request, user))
    if wait:
        msg = ("Kodama sedang menerima banyak pertanyaan" if scope == "global"
               else "Anda mengirim terlalu banyak pertanyaan")
        # the wait goes in Retry-After only: the frontend adds "Coba kembali dalam N detik" from it
        raise HTTPException(429, f"{msg}.", headers={"Retry-After": str(wait)})


@router.post("/agent/chat", response_model=ChatResponse, responses={401: {"model": ErrorResponse}, 429: {"model": ErrorResponse}})
def chat(body: ChatRequest, request: Request, user: dict | None = Depends(optional_user)) -> dict:
    """Signed in (Bearer token): the Agent knows the user's profile and can read
    their own devices. Guests get public data only."""
    _limit(request, user)
    return agent.chat(body.question, body.session_id, user)


@router.post("/agent/chat/stream", responses={
    200: {"content": {"text/event-stream": {}},
          "description": "SSE: start, step, viz, token, reset, replace, done, error (lihat docs/FRONTEND.md)"},
    401: {"model": ErrorResponse}, 429: {"model": ErrorResponse}})
def chat_stream(body: ChatRequest, request: Request,
                user: dict | None = Depends(optional_user)) -> StreamingResponse:
    """Same turn as /agent/chat, streamed as Server-Sent Events so the UI can
    show steps, components and text as they arrive. POST (not EventSource),
    so the client can send X-API-Key: read it with fetch() + a stream reader."""
    _limit(request, user)

    def sse():
        try:
            for event, data in agent.chat_events(body.question, body.session_id, user):
                yield f"event: {event}\ndata: {json.dumps(data, default=str)}\n\n"
        except Exception:  # noqa: BLE001 - headers are already sent; report in-band
            log.exception("stream chat gagal")
            yield 'event: error\ndata: {"detail": "kesalahan internal"}\n\n'

    return StreamingResponse(sse(), media_type="text/event-stream",
                             headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"})


@router.get("/agent/sessions/{session_id}", response_model=SessionState)
def session_state(session_id: str, user: dict | None = Depends(optional_user)) -> dict:
    """History, context and token usage of one chat session; only for its owner
    (a guest's session for guests), since the history can hold private data."""
    st = session.load(session_id)
    if st["turns"] and st["context"].get("user_id") != (user["id"] if user else None):
        raise HTTPException(404, "sesi tidak ditemukan")
    return {**st, "budget": agent.token_budget(user)}


@router.get("/agent/tools")
def tool_contract() -> dict:
    """The tool/function contract as JSON Schema, plus the skill map."""
    return {
        "tools": {n: {"description": d, "parameters": s.model_json_schema()}
                  for n, (_, s, d) in tools.TOOLS.items()},
        "skills": tools.SKILLS,
    }
