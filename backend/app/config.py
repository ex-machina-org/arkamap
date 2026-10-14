import os

DATABASE_URL = os.getenv(
    "DATABASE_URL",
    "postgresql://atlas:atlas@localhost:5433/atlas",
)

# NASA FIRMS regional feeds need no key; the area API does. If a key is
# present we use the finer area endpoint, otherwise the regional CSV.
FIRMS_MAP_KEY = os.getenv("FIRMS_MAP_KEY", "").strip()

# Indonesia bounding box (lon/lat)
IDN_BBOX = (95.0, -11.0, 141.0, 6.0)

HTTP_TIMEOUT = float(os.getenv("HTTP_TIMEOUT", "60"))

# Agent LLM: Google AI Studio (Gemini) via langchain-google-genai.
# Empty key = the agent skips the model and answers from tool output alone
# (see agent/agent.py).
# TypeSafe Jev SDK (ingest/jev.py). Parked: quake urgency now uses rules
# (seismic.urgency). Kept for later low-volume use; optional.
TYPESAFE_API_KEY = os.getenv("TYPESAFE_API_KEY", "").strip()

GEMINI_API_KEY = os.getenv("GEMINI_API_KEY", "").strip()
LLM_MODEL = os.getenv("LLM_MODEL", "gemini-3.1-flash-lite")

# Jev via OpenRouter (typesafe/jev-*): picks the skill when every LLM planner fails (agent/router.py).
OPENROUTER_API_KEY = os.getenv("OPENROUTER_API_KEY", "").strip()
JEV_MODEL = os.getenv("JEV_MODEL", "typesafe/jev-1.13")

# Backup writers (agent/backup.py), tried in this order when Gemini fails
# mid-answer; each continues the text already shown. Empty model or key = skipped.
OPENROUTER_LLM_MODEL = os.getenv("OPENROUTER_LLM_MODEL", "google/gemini-3.1-flash-lite").strip()
# Agent planner (agent/router.py) when Gemini fails: free OpenRouter models, tried in
# this order within one request; then DEEPSEEK_API_KEY. Free models are rate-limited
# and come and go: check https://openrouter.ai/models?max_price=0 when they all fail.
OPENROUTER_PLAN_MODELS = [m.strip() for m in os.getenv(
    "OPENROUTER_PLAN_MODELS",
    "google/gemma-4-31b-it:free,nvidia/nemotron-3-super-120b-a12b:free,openrouter/free").split(",") if m.strip()]
DEEPSEEK_API_KEY = os.getenv("DEEPSEEK_API_KEY", "").strip()
DEEPSEEK_MODEL = os.getenv("DEEPSEEK_MODEL", "deepseek-v4-flash")
DEEPSEEK_BASE_URL = os.getenv("DEEPSEEK_BASE_URL", "https://api.deepseek.com/beta").rstrip("/")

# Agent token limits. Per call: model output cap. Per session: once
# input+output tokens reach the budget, the session answers from templates
# (no LLM) instead of spending more quota. History keeps only the last few
# turns, each answer clipped, so context stays small.
LLM_MAX_OUTPUT_TOKENS = int(os.getenv("LLM_MAX_OUTPUT_TOKENS", "1024"))
SESSION_TOKEN_BUDGET = int(os.getenv("SESSION_TOKEN_BUDGET", "40000"))
# Agent chats per minute: per account (or per visitor IP for guests), and for
# everyone together, which caps what all users can spend of the LLM quotas.
AGENT_RATE_PER_CLIENT = int(os.getenv("AGENT_RATE_PER_CLIENT", "10"))
AGENT_RATE_GLOBAL = int(os.getenv("AGENT_RATE_GLOBAL", "60"))
# Accounts the Agent never limits: no chats per minute, no session token budget (the test account).
AGENT_UNLIMITED_EMAILS = {e.strip().lower() for e in os.getenv("AGENT_UNLIMITED_EMAILS", "arkamap.test@example.com").split(",")
                          if e.strip()}
HISTORY_TURNS = int(os.getenv("HISTORY_TURNS", "3"))
HISTORY_ANSWER_CHARS = int(os.getenv("HISTORY_ANSWER_CHARS", "500"))

# Browser origins allowed to call the API, comma-separated ("*" = any site).
CORS_ORIGINS = [o.strip() for o in os.getenv("CORS_ORIGINS", "*").split(",") if o.strip()]
# Bootstrap app keys, comma-separated: accepted as X-API-Key before any key
# is issued from the database (app/clients.py).
API_KEYS = {k.strip() for k in os.getenv("API_KEYS", "").split(",") if k.strip()}

# Accounts. JWT_SECRET must be set in production (docker-compose.prod.yml
# refuses to start without it); the dev default only works locally.
JWT_SECRET = os.getenv("JWT_SECRET", "dev-only-secret-change-me")
JWT_DAYS = int(os.getenv("JWT_DAYS", "7"))
# Emails that become admins on signup (moderate community data).
ADMIN_EMAILS = {e.strip().lower() for e in os.getenv("ADMIN_EMAILS", "").split(",") if e.strip()}

# Public base URL the sensor examples point at (app/iot/quickstart.py).
PUBLIC_URL = os.getenv("PUBLIC_URL", "http://localhost:8000").rstrip("/")

# Every /api/* request must carry a valid X-API-Key (an issued app key or
# one of API_KEYS). Off in local dev so tests and curl work without keys;
# turn it on wherever the API is exposed.
REQUIRE_API_KEY = os.getenv("REQUIRE_API_KEY", "0") == "1"

# IoT payloads must carry "nama" and "waktu". Off during the transition: a
# reading without them is stored (nama -> "default", waktu -> arrival time)
# and the device gets a warning; set IOT_STRICT_PAYLOAD=1 to reject instead.
IOT_STRICT_PAYLOAD = os.getenv("IOT_STRICT_PAYLOAD", "0") == "1"
