import os

DATABASE_URL = os.getenv(
    "DATABASE_URL",
    "postgresql://atlas:atlas@localhost:5433/atlas",
)

# Indonesia bounding box (lon/lat)
IDN_BBOX = (95.0, -11.0, 141.0, 6.0)

HTTP_TIMEOUT = float(os.getenv("HTTP_TIMEOUT", "60"))

# Browser origins allowed to call the API, comma-separated ("*" = any site).
CORS_ORIGINS = [o.strip() for o in os.getenv("CORS_ORIGINS", "*").split(",") if o.strip()]
