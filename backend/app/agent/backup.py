"""Backup writers for when Gemini stops mid-answer (quota, timeout, a rejected
number): OpenRouter first, then the operator's own DeepSeek key. Each one
continues the text the reader already sees (assistant prefill) instead of
starting over, so a half-written answer is kept, never swapped, and the
backup only pays output tokens for the rest of it."""
import json

import httpx

from ..config import (DEEPSEEK_API_KEY, DEEPSEEK_BASE_URL, DEEPSEEK_MODEL, LLM_MAX_OUTPUT_TOKENS,
                      OPENROUTER_API_KEY, OPENROUTER_LLM_MODEL)


def providers() -> list[tuple[str, str, str, dict, dict]]:
    """(name, url, key, extra request fields, extra fields on the prefill message), in fallback order."""
    out = []
    if OPENROUTER_API_KEY and OPENROUTER_LLM_MODEL:
        # OpenRouter treats a trailing assistant message as the start of the reply
        out.append(("openrouter", "https://openrouter.ai/api/v1/chat/completions", OPENROUTER_API_KEY,
                    {"model": OPENROUTER_LLM_MODEL}, {}))
    if DEEPSEEK_API_KEY:
        # prefix completion is a beta feature: beta base URL + "prefix": true, non-thinking mode only
        out.append(("deepseek", f"{DEEPSEEK_BASE_URL}/chat/completions", DEEPSEEK_API_KEY,
                    {"model": DEEPSEEK_MODEL, "thinking": {"type": "disabled"}}, {"prefix": True}))
    return out


def stream(provider: tuple, system: str, history: list[dict], q: str, partial: str, timeout: float):
    """Generator like agent._llm_once: yields token events with the continuation
    only, returns usage. Raises on HTTP errors, an in-stream error, or a reply
    cut off by the output cap (the caller then tries the next provider)."""
    name, url, key, extra, prefill = provider
    msgs = ([{"role": "system", "content": system}]
            + [{"role": h["role"], "content": h["content"]} for h in history]
            + [{"role": "user", "content": q}])
    if partial:
        # the shown text ends with its whitespace; prefill without it, and drop
        # the continuation's leading whitespace so words neither glue nor double-space
        msgs.append({"role": "assistant", "content": partial.rstrip(), **prefill})
    lead = True
    body = {**extra, "messages": msgs, "stream": True, "temperature": 0,
            "max_tokens": LLM_MAX_OUTPUT_TOKENS, "stream_options": {"include_usage": True}}
    usage = {"input": 0, "output": 0}
    with httpx.stream("POST", url, headers={"Authorization": f"Bearer {key}"}, json=body,
                      timeout=timeout) as r:
        r.raise_for_status()
        for line in r.iter_lines():
            # ":" lines are keep-alive comments
            if not line.startswith("data: ") or line == "data: [DONE]":
                continue
            d = json.loads(line[6:])
            if d.get("error"):
                raise RuntimeError(f"{name}: {d['error']}")
            if u := d.get("usage"):
                usage = {"input": u.get("prompt_tokens", 0), "output": u.get("completion_tokens", 0)}
            for c in d.get("choices") or []:
                t = (c.get("delta") or {}).get("content") or ""
                if lead:
                    t = t.lstrip()
                if t:
                    lead = False
                    yield "token", {"text": t}
                if c.get("finish_reason") == "length":
                    raise RuntimeError(f"{name}: batas token output")
    return usage
