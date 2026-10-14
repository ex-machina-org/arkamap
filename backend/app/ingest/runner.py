"""Orchestrates ingest jobs and records the outcome on each source row.

Every job writes back last_run_at / last_ok_at / last_error, so the API can
tell users how fresh a dataset is and whether the last refresh failed.
"""
import logging
from datetime import datetime, timedelta, timezone

from ..db import conn, execute, query_one
from . import bmkg, climate, disasters, energy, fire, marine, outlook, regions, seismic, urban, windfield
from .sources import METRICS, SOURCES

log = logging.getLogger(__name__)


def seed_registry() -> None:
    """Upsert the source and metric catalogues."""
    with conn() as c, c.cursor() as cur:
        cur.executemany(
            """
            INSERT INTO source (id, aspect, title, publisher, url, license,
                                cadence, is_modelled, notes)
            VALUES (%(id)s,%(aspect)s,%(title)s,%(publisher)s,%(url)s,%(license)s,
                    %(cadence)s,%(is_modelled)s,%(notes)s)
            ON CONFLICT (id) DO UPDATE SET
              title=EXCLUDED.title, publisher=EXCLUDED.publisher, url=EXCLUDED.url,
              license=EXCLUDED.license, cadence=EXCLUDED.cadence,
              is_modelled=EXCLUDED.is_modelled, notes=EXCLUDED.notes
            """,
            SOURCES,
        )
        cur.executemany(
            """
            INSERT INTO metric_def (metric, aspect, label, unit, description,
                                    polarity, scale_min, scale_max, source_id)
            VALUES (%(metric)s,%(aspect)s,%(label)s,%(unit)s,%(description)s,
                    %(polarity)s,%(scale_min)s,%(scale_max)s,%(source_id)s)
            ON CONFLICT (metric) DO UPDATE SET
              label=EXCLUDED.label, unit=EXCLUDED.unit,
              description=EXCLUDED.description, polarity=EXCLUDED.polarity,
              scale_min=EXCLUDED.scale_min, scale_max=EXCLUDED.scale_max,
              source_id=EXCLUDED.source_id
            """,
            METRICS,
        )
        # Drop catalogue rows for metrics we no longer expose, so a metric
        # retired in code also disappears from the rail on servers that
        # already ingested it. The indicator values themselves stay.
        cur.execute(
            "DELETE FROM metric_def WHERE metric <> ALL(%s)",
            ([m["metric"] for m in METRICS],),
        )
    # humidity_mean, wind_max and wind_direction are internal or non-choropleth
    # values, not user-facing metrics, so they are deliberately absent from
    # METRICS. A bearing in particular has no "bad" end: colouring 0-360 as a
    # severity scale makes 359 degrees look extreme next to 1 degree.


def _mark(source_id: str, ok: bool, error: str | None = None) -> None:
    now = datetime.now(timezone.utc)
    execute(
        """
        UPDATE source SET last_run_at=%s,
               last_ok_at = CASE WHEN %s THEN %s ELSE last_ok_at END,
               last_error = %s
        WHERE id=%s
        """,
        (now, ok, now, error, source_id),
    )


def _due(source_id: str, days: int | None) -> bool:
    """True when a slow source should refresh: never succeeded, or last
    success is older than `days` (None = once only)."""
    row = query_one("SELECT last_ok_at FROM source WHERE id = %s", (source_id,))
    last = row and row["last_ok_at"]
    if last is None:
        return True
    return days is not None and datetime.now(timezone.utc) - last > timedelta(days=days)


def run_all(with_regions: bool = True, include_slow: bool = True) -> dict:
    """Full refresh. Safe to re-run; every step upserts. include_slow=False
    skips ohsome, which can take most of an hour, so a
    first boot isn't held up; the scheduled refresh picks them up."""
    report: dict[str, object] = {}
    seed_registry()

    if with_regions:
        try:
            report["regions"] = regions.load_regions()
            # kabupaten/kota depend on provinces existing (parent lookup)
            report["kabkota"] = regions.load_kabkota()
        except Exception as exc:  # noqa: BLE001 - report, don't crash the job
            log.exception("gagal memuat wilayah")
            report["regions_error"] = str(exc)

    # Deliberately OUTSIDE the with_regions block. Boundaries are static and
    # only fetched on an empty database, but population is a separate column
    # that a later release can add — gating it on with_regions meant an
    # existing deployment upgraded to this version and silently kept NULL
    # populations, so every kabupaten density fell back to its province.
    try:
        missing = query_one(
            """
            SELECT COUNT(*) AS c FROM region
             WHERE level = 'kabkota' AND population IS NULL
            """
        )["c"]
        # 5 ADM2 features are lakes/forests with no population, so a handful
        # of NULLs is the healthy steady state, not a reason to refetch.
        if missing > 20:
            report["kabkota_population"] = regions.load_kabkota_population()
        else:
            report["kabkota_population"] = "sudah lengkap"
    except Exception as exc:  # noqa: BLE001
        log.exception("gagal memuat penduduk kabupaten")
        report["population_error"] = str(exc)

    try:
        report["hotspots"] = fire.ingest_hotspots()
        _mark("firms_viirs", True)
    except Exception as exc:  # noqa: BLE001
        log.exception("gagal ingest titik panas")
        report["hotspots_error"] = str(exc)
        _mark("firms_viirs", False, str(exc))

    try:
        report["hotspots_extra"] = fire.ingest_extra_hotspots()
        _mark("firms_extra", True)
    except Exception as exc:  # noqa: BLE001
        log.exception("gagal ingest titik panas tambahan")
        report["hotspots_extra_error"] = str(exc)
        _mark("firms_extra", False, str(exc))
    # rows stored before the ingest kept to Indonesia's land and coast
    report["hotspots_pruned"] = fire.prune_outside()
    try:
        report["static_heat_cells"] = fire.refresh_static_cells()
    except Exception as exc:  # noqa: BLE001
        log.exception("gagal memperbarui sel panas statis")
        report["static_heat_cells_error"] = str(exc)

    try:
        report["climate_values"] = climate.ingest_climate()
        _mark("open_meteo_daily", True)
        _mark("open_meteo_aq", True)
    except Exception as exc:  # noqa: BLE001
        log.exception("gagal ingest iklim")
        report["climate_error"] = str(exc)
        _mark("open_meteo_daily", False, str(exc))

    # Aggregates run after their inputs; fire risk reads the climate terms.
    try:
        report["fire_regions"] = fire.aggregate_fire_indicators()
        _mark("derived_fire_risk", True)
    except Exception as exc:  # noqa: BLE001
        log.exception("gagal agregasi kebakaran")
        report["fire_error"] = str(exc)
        _mark("derived_fire_risk", False, str(exc))

    # Real power stations and long-term irradiance — both keyless public APIs.
    try:
        report["power_plants"] = energy.ingest_power_plants()
        energy.aggregate_power_capacity()
        _mark("climate_trace", True)
    except Exception as exc:  # noqa: BLE001
        log.exception("gagal ingest pembangkit")
        report["power_error"] = str(exc)
        _mark("climate_trace", False, str(exc))

    try:
        report["solar_annual"] = energy.ingest_solar_climatology()
        _mark("nasa_power", True)
    except Exception as exc:  # noqa: BLE001
        log.exception("gagal ingest iradiasi tahunan")
        report["solar_error"] = str(exc)
        _mark("nasa_power", False, str(exc))

    # Rate-limited and slow (about a minute), so it runs on the schedule
    # rather than on demand from the browser.
    try:
        report["wind_grid"] = windfield.ingest_wind_grid()
    except Exception as exc:  # noqa: BLE001
        log.exception("gagal ingest grid angin")
        report["wind_grid_error"] = str(exc)

    # Earthquakes are independent of the climate/fire chain, so a failure
    # here leaves the rest of the refresh intact.
    try:
        report["quakes"] = seismic.ingest_quakes()
        _mark("usgs_quake", True)
    except Exception as exc:  # noqa: BLE001
        log.exception("gagal ingest gempa")
        report["quake_error"] = str(exc)
        _mark("usgs_quake", False, str(exc))

    try:
        report["quakes_emsc"] = seismic.ingest_quakes_emsc()
        _mark("emsc_quake", True)
    except Exception as exc:  # noqa: BLE001
        log.exception("gagal ingest gempa EMSC")
        report["quake_emsc_error"] = str(exc)
        _mark("emsc_quake", False, str(exc))
    # BMKG also runs every 15 minutes on its own (main.py); here so a first
    # boot/seed has it too. Its run() dedupes all catalogues.
    report["bmkg"] = bmkg.run()

    try:
        report["marine"] = marine.ingest_marine()
        _mark("open_meteo_marine", True)
    except Exception as exc:  # noqa: BLE001
        log.exception("gagal ingest laut")
        report["marine_error"] = str(exc)
        _mark("open_meteo_marine", False, str(exc))

    try:
        report["seasonal"] = outlook.ingest_seasonal()
        _mark("open_meteo_seasonal", True)
    except Exception as exc:  # noqa: BLE001
        log.exception("gagal ingest prakiraan musiman")
        report["seasonal_error"] = str(exc)
        _mark("open_meteo_seasonal", False, str(exc))
    report["quakes_deduped"] = seismic.dedupe_quakes()
    report["quakes_classified"] = seismic.classify_missing()

    for key, fn, src in (("gdacs", disasters.ingest_gdacs, "gdacs"),
                         ("eonet", disasters.ingest_eonet, "nasa_eonet")):
        try:
            report[key] = fn()
            _mark(src, True)
        except Exception as exc:  # noqa: BLE001
            log.exception("gagal ingest %s", key)
            report[f"{key}_error"] = str(exc)
            _mark(src, False, str(exc))
    report["disasters_deduped"] = disasters.dedupe()

    try:
        report["seismic_regions"] = seismic.aggregate_seismic_indicators()
        _mark("derived_seismic", True)
    except Exception as exc:  # noqa: BLE001
        log.exception("gagal agregasi kerawanan gempa")
        report["seismic_error"] = str(exc)
        _mark("derived_seismic", False, str(exc))

    try:
        climate.aggregate_water_and_energy()
        _mark("derived_water", True)
        _mark("derived_energy", True)
    except Exception as exc:  # noqa: BLE001
        log.exception("gagal agregasi air/energi")
        report["derived_error"] = str(exc)
        _mark("derived_water", False, str(exc))

    # Last, so a slow ohsome run doesn't delay everything else. Weekly
    # (ohsome takes up to an hour and is a shared public service); RWI once.
    for key, fn, src, every, slow in (
            ("transjakarta", urban.ingest_transjakarta, "transjakarta_gtfs", 7, False),
            ("wealth_index", urban.ingest_rwi, "meta_rwi", None, False),
            ("osm_urban", urban.ingest_osm_urban, "osm_ohsome", 7, True)):
        if (slow and not include_slow) or not _due(src, every):
            report[key] = "belum waktunya"
            continue
        try:
            report[key] = fn()
            _mark(src, True)
        except Exception as exc:  # noqa: BLE001
            log.exception("gagal ingest %s", key)
            report[f"{key}_error"] = str(exc)
            _mark(src, False, str(exc))

    return report
