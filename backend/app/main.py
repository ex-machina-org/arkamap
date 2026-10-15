import logging
import os
from contextlib import asynccontextmanager
from datetime import datetime

from apscheduler.schedulers.background import BackgroundScheduler
from apscheduler.triggers.cron import CronTrigger
from apscheduler.triggers.interval import IntervalTrigger
from fastapi import BackgroundTasks, Depends, FastAPI
from fastapi.middleware.cors import CORSMiddleware

from .api.agent import router as agent_router
from .api.buildings import router as buildings_router
from .api.clients import router as clients_router
from .api.data import router as data_router
from .api.isochrone import router as isochrone_router
from .api.reports import router as reports_router
from .api.responder import router as responder_router
from .api.public import router as public_router
from .api.routes import router
from .api.users import purge_test_devices, router as users_router
from .auth import admin_user
from .db import apply_schema, close_pool, init_pool
from .clients import require_app_key
from .config import CORS_ORIGINS
from .ingest.buildings_prewarm import run_forever as run_buildings_forever, start_background as start_buildings_background
from .ingest import bmkg
from .ingest.runner import run_all, seed_registry
from .iot.layout import retry_rule_layouts

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s %(levelname)-7s %(name)s: %(message)s",
)
log = logging.getLogger("atlas")
# httpx logs every request URL at INFO, and some carry keys (FIRMS area API).
logging.getLogger("httpx").setLevel(logging.WARNING)

scheduler = BackgroundScheduler(timezone="Asia/Jakarta")


def _scheduled_refresh() -> None:
    log.info("refresh terjadwal mulai")
    try:
        report = run_all(with_regions=False)
        log.info("refresh selesai: %s", report)
    except Exception:  # noqa: BLE001
        log.exception("refresh terjadwal gagal")


@asynccontextmanager
async def lifespan(app: FastAPI):
    init_pool()
    apply_schema()
    seed_registry()
    log.info("skema siap")

    # FIRMS publishes new granules through the day; 06:00 WIB picks up the
    # overnight passes before anyone opens the map.
    if os.getenv("ENABLE_SCHEDULER", "1") == "1":
        scheduler.add_job(
            _scheduled_refresh, CronTrigger(hour="6,18", minute=0),
            id="refresh", replace_existing=True, max_instances=1,
        )
        # BMKG warnings only live a few hours; quakes should show up fast
        scheduler.add_job(
            bmkg.run, IntervalTrigger(minutes=15), id="bmkg", replace_existing=True,
            max_instances=1, next_run_time=datetime.now(),
        )
        # sensor fields laid out/categorised by rules while the AI was down
        scheduler.add_job(
            retry_rule_layouts, IntervalTrigger(minutes=30), id="iot_retry", replace_existing=True,
            max_instances=1, next_run_time=datetime.now(),
        )
        # test devices delete themselves, with everything they received
        scheduler.add_job(
            purge_test_devices, IntervalTrigger(minutes=10), id="test_devices", replace_existing=True,
            max_instances=1, next_run_time=datetime.now(),
        )
        scheduler.start()
        log.info("penjadwal aktif: refresh 06:00/18:00 WIB, BMKG tiap 15 menit")

    # Buildings are covered by a continuous background loop, not a cron
    # entry: Overpass's own per-tile latency is what limits throughput, so
    # a fixed schedule would either idle between runs for no reason or need
    # a run length no cron interval fits. start_background() keeps batching
    # through _CITIES (see buildings_prewarm.py) until every tile in every
    # listed city is done, then the thread exits.
    start_buildings_background()

    yield

    if scheduler.running:
        scheduler.shutdown(wait=False)
    close_pool()


class StripTrailingSlash:
    """Serves "/api/regions/" as "/api/regions" instead of redirecting to it. Starlette's
    redirect carries the absolute URL, i.e. this API's own domain, which a proxy in front
    (the frontend's /api) would hand to the browser and so reveal where the API lives."""

    def __init__(self, app):
        self.app = app

    async def __call__(self, scope, receive, send):
        path = scope.get("path", "")
        if scope["type"] in ("http", "websocket") and len(path) > 1 and path.endswith("/"):
            path = path.rstrip("/") or "/"
            scope = {**scope, "path": path, "raw_path": path.encode()}
        await self.app(scope, receive, send)


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

app.add_middleware(StripTrailingSlash)
app.add_middleware(
    CORSMiddleware,
    allow_origins=CORS_ORIGINS,   # env CORS_ORIGINS; default "*"
    allow_methods=["GET", "POST"],
    allow_headers=["Content-Type", "X-API-Key"],
    expose_headers=["Retry-After"],
)

app.include_router(router, prefix="/api", tags=["data"])
app.include_router(data_router, prefix="/api", tags=["data"])
app.include_router(agent_router, prefix="/api", tags=["agent"])
app.include_router(buildings_router, prefix="/api", tags=["data"])
app.include_router(reports_router, prefix="/api", tags=["reports"])
app.include_router(isochrone_router, prefix="/api", tags=["data"])
app.include_router(responder_router, prefix="/api", tags=["responder"])
app.include_router(users_router, prefix="/api", tags=["users & iot"])
app.include_router(public_router, prefix="/api", tags=["public"])
app.include_router(clients_router, prefix="/api", tags=["clients (admin)"])


@app.post("/api/admin/refresh", tags=["admin"])
def trigger_refresh(background: BackgroundTasks, with_regions: bool = False,
                    _: dict = Depends(admin_user)) -> dict:
    """Kick off ingest without waiting for the schedule. Admin accounts only."""
    background.add_task(run_all, with_regions)
    return {"status": "dijadwalkan", "with_regions": with_regions}


@app.post("/api/admin/refresh-buildings", tags=["admin"])
def trigger_buildings_refresh(background: BackgroundTasks, _: dict = Depends(admin_user)) -> dict:
    """(Re)start the continuous buildings prewarm loop if it isn't already
    running — useful after it's finished once and Overpass has since added
    new footprints. run_forever()'s own _running guard makes this a no-op
    if a loop is already in flight. Admin accounts only."""
    background.add_task(run_buildings_forever)
    return {"status": "dijadwalkan"}


@app.get("/", include_in_schema=False)
def root() -> dict:
    return {
        "name": "Nusantara Sustainability Atlas",
        "docs": "/docs",
        "aspects": ["urban", "lingkungan", "energi"],
    }
