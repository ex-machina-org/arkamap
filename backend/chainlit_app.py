"""Chat entry point. Talks to the Agent API and turns each `viz` into a
Chainlit Custom Element, so the answer arrives with a component + its data.

The components themselves are written by the frontend, one JSX file per name
in VIZ_COMPONENTS, placed in public/elements/<Name>.jsx. Each receives the
`viz` payload as `props` (see docs/VIZ.md for shapes). No file for a type = that
viz is skipped and the text answer still shows.

Run: chainlit run chainlit_app.py --port 8001
"""
import os

import chainlit as cl
import httpx

API = os.getenv("ATLAS_API", "http://127.0.0.1:8000/api")
# Sent when the API has API_KEYS set; the first key is Chainlit's own.
HEADERS = {"X-API-Key": k} if (k := os.getenv("API_KEYS", "").split(",")[0].strip()) else {}

# viz.type -> component name. The single place frontend and backend agree on.
VIZ_COMPONENTS = {
    "ranking": "RankingChart",
    "region_card": "RegionCard",
    "event_map": "EventMap",
    "alerts": "AlertList",
}


@cl.on_chat_start
async def start():
    cl.user_session.set("sid", None)


@cl.on_message
async def on_message(msg: cl.Message):
    try:
        async with httpx.AsyncClient(timeout=90, headers=HEADERS) as c:
            r = await c.post(f"{API}/agent/chat", json={
                "question": msg.content, "session_id": cl.user_session.get("sid")})
            if r.status_code == 429:
                await cl.Message(f"Terlalu banyak permintaan. {r.json()['detail']}").send()
                return
            r.raise_for_status()
            d = r.json()
    except Exception as exc:  # noqa: BLE001
        await cl.Message(f"Agent tidak bisa dihubungi: {type(exc).__name__}").send()
        return

    cl.user_session.set("sid", d["session_id"])
    elements = [
        cl.CustomElement(name=VIZ_COMPONENTS[v["type"]], props=v, display="inline")
        for v in d["viz"] if v["type"] in VIZ_COMPONENTS
    ]
    await cl.Message(content=d["answer"], elements=elements).send()
