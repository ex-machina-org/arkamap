import logging
from contextlib import asynccontextmanager

from fastapi import Depends, FastAPI
from fastapi.middleware.cors import CORSMiddleware

from .api.public import router as public_router
from .api.routes import router
from .api.users import router as users_router
from .db import apply_schema, close_pool, init_pool
from .clients import require_app_key
from .config import CORS_ORIGINS

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s %(levelname)-7s %(name)s: %(message)s",
)
log = logging.getLogger("atlas")


@asynccontextmanager
async def lifespan(app: FastAPI):
    init_pool()
    apply_schema()
    log.info("skema siap")

    yield

    close_pool()


app = FastAPI(
    title="Nusantara Sustainability Atlas",
    description=(
        "Lapisan data lokasi untuk keberlanjutan: urban, lingkungan, energi. "
        "Setiap angka membawa sumber, tanggal, dan penanda apakah ia observasi "
        "atau keluaran model."
    ),
    version="0.6.0",
    lifespan=lifespan,
    # every /api/* call needs an app key when REQUIRE_API_KEY=1 (see clients.py)
    dependencies=[Depends(require_app_key)],
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=CORS_ORIGINS,   # env CORS_ORIGINS; default "*"
    allow_methods=["GET", "POST"],
    allow_headers=["Content-Type", "X-API-Key"],
    expose_headers=["Retry-After"],
)

app.include_router(router, prefix="/api", tags=["data"])
app.include_router(users_router, prefix="/api", tags=["users & iot"])
app.include_router(public_router, prefix="/api", tags=["public"])


@app.get("/", include_in_schema=False)
def root() -> dict:
    return {
        "name": "Nusantara Sustainability Atlas",
        "docs": "/docs",
        "aspects": ["urban", "lingkungan", "energi"],
    }
