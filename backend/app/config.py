import os

DATABASE_URL = os.getenv(
    "DATABASE_URL",
    "postgresql://atlas:atlas@localhost:5433/atlas",
)

# Indonesia bounding box (lon/lat)
IDN_BBOX = (95.0, -11.0, 141.0, 6.0)

HTTP_TIMEOUT = float(os.getenv("HTTP_TIMEOUT", "60"))

# Agent LLM: Google AI Studio (Gemini) via langchain-google-genai.
# Empty key = the agent skips the model and answers from tool output alone
# (see agent/agent.py).
GEMINI_API_KEY = os.getenv("GEMINI_API_KEY", "").strip()
LLM_MODEL = os.getenv("LLM_MODEL", "gemini-3.1-flash-lite")

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

# Every /api/* request must carry a valid X-API-Key (an issued app key or
# one of API_KEYS). Off in local dev so tests and curl work without keys;
# turn it on wherever the API is exposed.
REQUIRE_API_KEY = os.getenv("REQUIRE_API_KEY", "0") == "1"
