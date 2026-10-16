"""Evacuation sites for /responder/route, a province at a time.

Only the places that matter for an evacuation, as points: every hospital,
official assembly points, and the large mosques, churches, fields, schools
and halls. Size comes from the OSM outline's bounding box, so a place of
worship mapped as a bare point (size unknown) is left out on purpose. No
building footprints are stored: one province is a few hundred to a few
thousand points, against hundreds of thousands of footprints per city.

A daemon thread works through the provinces, Yogyakarta first, one 1° tile
per Overpass request, and refreshes each province weekly. Progress lives in
evac_site_progress, so a restart resumes and an Overpass outage only delays
the province that failed.
"""
import logging
import math
import threading
import time
from datetime import datetime, timezone

import httpx

from ..api.buildings import HEADERS, OVERPASS_URLS
from ..db import conn, query, query_one

log = logging.getLogger(__name__)

FIRST = "idn.special_region_of_yogyakarta"
TILE_DEG = 1.0
REFRESH_DAYS = 7
RETRY_AFTER_S = 3600         # a failed province waits this long before its next try
PAUSE_S = 5                  # between Overpass requests, to stay a polite client
IDLE_S = 3600                # nothing due: look again in an hour
OVERPASS_TIMEOUT_S = 180

# Smallest outline worth sending people to. ponytail: guesses, not a BPBD standard; tune here.
MIN_AREA = {"worship_muslim": 1500, "worship": 1000, "field": 5000, "school": 5000, "hall": 300}
# The bounding box overstates a building's area (more when it sits at an angle).
# ponytail: bbox x 0.7 instead of the true polygon area; fetch `out geom` if the thresholds need precision.
BBOX_FILL = 0.7

QUERY = """[out:json][timeout:{timeout}][bbox:{s},{w},{n},{e}];
(
  nwr["amenity"="hospital"];
  nwr["emergency"="assembly_point"];
  nwr["amenity"="shelter"]["shelter_type"="evacuation"];
  wr["amenity"~"^(place_of_worship|school|university|college|townhall|community_centre)$"];
  wr["leisure"~"^(pitch|park|stadium)$"];
  wr["landuse"="recreation_ground"];
);
out center bb tags;"""

WORSHIP_NOTE = {"muslim": "Masjid", "christian": "Gereja", "hindu": "Pura", "buddhist": "Wihara"}


def bbox_area(bounds: dict | None) -> float | None:
    """Estimated area in m² from an Overpass `bb` box; None for a point."""
    if not bounds:
        return None
    lat = math.radians((bounds["minlat"] + bounds["maxlat"]) / 2)
    w = (bounds["maxlon"] - bounds["minlon"]) * 111_320 * math.cos(lat)
    h = (bounds["maxlat"] - bounds["minlat"]) * 110_540
    return w * h * BBOX_FILL


def classify(tags: dict, area: float | None) -> tuple[str, str] | None:
    """(kind, note) for a site worth keeping, else None."""
    amenity, leisure = tags.get("amenity"), tags.get("leisure")
    if amenity == "hospital":
        return "hospital", "Rumah sakit"
    if tags.get("emergency") == "assembly_point" or (amenity == "shelter" and tags.get("shelter_type") == "evacuation"):
        return "assembly", "Titik kumpul"
    if area is None:
        return None
    if amenity == "place_of_worship":
        religion = tags.get("religion")
        limit = MIN_AREA["worship_muslim"] if religion == "muslim" else MIN_AREA["worship"]
        return ("worship", WORSHIP_NOTE.get(religion, "Tempat ibadah")) if area >= limit else None
    if amenity in ("school", "university", "college"):
        return ("school", "Sekolah" if amenity == "school" else "Kampus") if area >= MIN_AREA["school"] else None
    if amenity in ("townhall", "community_centre"):
        return ("hall", "Balai desa/kantor pemerintahan" if amenity == "townhall" else "Balai warga") if area >= MIN_AREA["hall"] else None
    if leisure in ("pitch", "park", "stadium") or tags.get("landuse") == "recreation_ground":
        note = {"stadium": "Stadion", "park": "Taman/alun-alun"}.get(leisure, "Lapangan")
        return ("field", note) if area >= MIN_AREA["field"] else None
    return None


def sites_from(elements: list[dict]) -> list[dict]:
    out = []
    for e in elements:
        # with `bb`, Overpass sends a way's bounds but not its center
        b = e.get("bounds")
        point = e.get("center") or (b and {"lat": (b["minlat"] + b["maxlat"]) / 2, "lon": (b["minlon"] + b["maxlon"]) / 2}) or e
        if "lat" not in point:
            continue
        tags = e.get("tags", {})
        area = bbox_area(e.get("bounds"))
        picked = classify(tags, area)
        if picked:
            out.append({"osm_id": f"{e['type']}/{e['id']}", "kind": picked[0], "note": picked[1],
                        "name": tags.get("name"), "area_m2": area and round(area),
                        "lon": point["lon"], "lat": point["lat"]})
    return out


def tiles(west: float, south: float, east: float, north: float) -> list[tuple[float, float, float, float]]:
    """The bbox cut into cells of at most TILE_DEG a side."""
    nx, ny = max(1, math.ceil((east - west) / TILE_DEG)), max(1, math.ceil((north - south) / TILE_DEG))
    dx, dy = (east - west) / nx, (north - south) / ny
    return [(west + i * dx, south + j * dy, west + (i + 1) * dx, south + (j + 1) * dy) for i in range(nx) for j in range(ny)]


def _overpass(w: float, s: float, e: float, n: float) -> list[dict]:
    q = QUERY.format(timeout=OVERPASS_TIMEOUT_S, s=round(s, 4), w=round(w, 4), n=round(n, 4), e=round(e, 4))
    last: Exception | None = None
    for url in OVERPASS_URLS:
        try:
            r = httpx.post(url, data={"data": q}, timeout=OVERPASS_TIMEOUT_S + 20, headers=HEADERS)
            r.raise_for_status()
            return r.json()["elements"]
        except Exception as exc:  # noqa: BLE001
            last = exc
            log.warning("overpass titik evakuasi %s gagal: %s", url.split("/")[2], exc)
    raise RuntimeError(f"Overpass tidak merespons: {last}")


def _due_province() -> dict | None:
    """Next province to fetch: never fetched first (Yogyakarta before the rest), then the stalest
    past REFRESH_DAYS; one that just failed waits RETRY_AFTER_S."""
    return query_one(
        """
        SELECT r.id, ST_XMin(r.geom) AS w, ST_YMin(r.geom) AS s, ST_XMax(r.geom) AS e, ST_YMax(r.geom) AS n
        FROM region r LEFT JOIN evac_site_progress p ON p.province_id = r.id
        WHERE r.level = 'provinsi'
          AND (p.fetched_at IS NULL OR p.fetched_at < now() - make_interval(days => %(days)s))
          AND (p.failed_at IS NULL OR p.failed_at < now() - make_interval(secs => %(retry)s))
        ORDER BY p.fetched_at NULLS FIRST, r.id = %(first)s DESC, r.id
        LIMIT 1
        """,
        {"days": REFRESH_DAYS, "retry": RETRY_AFTER_S, "first": FIRST},
    )


def ingest_province(province: dict) -> int:
    """Fetches one province tile by tile and replaces its sites. Raises if any tile fails,
    so a half-fetched province keeps its previous sites."""
    started = datetime.now(timezone.utc)
    found: dict[str, dict] = {}
    for w, s, e, n in tiles(province["w"], province["s"], province["e"], province["n"]):
        for site in sites_from(_overpass(w, s, e, n)):
            found[site["osm_id"]] = site
        time.sleep(PAUSE_S)
    with conn() as c, c.cursor() as cur:
        for site in found.values():
            # The tile grid overlaps neighbours, so each site is filed under the province it lies in.
            cur.execute(
                """
                INSERT INTO evac_site (osm_id, kind, name, note, area_m2, province_id, fetched_at, geom)
                SELECT %(osm_id)s, %(kind)s, %(name)s, %(note)s, %(area_m2)s,
                       (SELECT id FROM region WHERE level = 'provinsi' AND ST_Intersects(geom, pt) LIMIT 1),
                       %(at)s, pt
                FROM (SELECT ST_SetSRID(ST_MakePoint(%(lon)s, %(lat)s), 4326) AS pt) p
                ON CONFLICT (osm_id) DO UPDATE SET kind = EXCLUDED.kind, name = EXCLUDED.name, note = EXCLUDED.note,
                  area_m2 = EXCLUDED.area_m2, province_id = EXCLUDED.province_id, fetched_at = EXCLUDED.fetched_at,
                  geom = EXCLUDED.geom
                """,
                {**site, "at": started},
            )
        # Sites gone from OSM (or shrunk below the limits) since the last fetch.
        cur.execute("DELETE FROM evac_site WHERE province_id = %s AND fetched_at < %s", (province["id"], started))
        cur.execute(
            """
            INSERT INTO evac_site_progress (province_id, fetched_at, failed_at, sites, error)
            VALUES (%s, now(), NULL, (SELECT count(*) FROM evac_site WHERE province_id = %s), NULL)
            ON CONFLICT (province_id) DO UPDATE SET fetched_at = now(), failed_at = NULL, sites = EXCLUDED.sites, error = NULL
            """,
            (province["id"], province["id"]),
        )
    return len(found)


def _record_failure(province_id: str, error: str) -> None:
    with conn() as c, c.cursor() as cur:
        cur.execute(
            """
            INSERT INTO evac_site_progress (province_id, failed_at, error) VALUES (%s, now(), %s)
            ON CONFLICT (province_id) DO UPDATE SET failed_at = now(), error = EXCLUDED.error
            """,
            (province_id, error[:500]),
        )


_running = False


def run_forever() -> None:
    """Fetches due provinces one after another; idles when none is due. One loop per process."""
    global _running
    if _running:
        return
    _running = True
    try:
        while True:
            province = _due_province()
            if not province:
                time.sleep(IDLE_S)
                continue
            t0 = time.monotonic()
            try:
                n = ingest_province(province)
                log.info("titik evakuasi %s: %d titik dalam %.0f s", province["id"], n, time.monotonic() - t0)
            except Exception as exc:  # noqa: BLE001
                log.warning("titik evakuasi %s gagal: %s", province["id"], exc)
                _record_failure(province["id"], str(exc))
                time.sleep(PAUSE_S)
    finally:
        _running = False


def start_background() -> None:
    threading.Thread(target=run_forever, daemon=True, name="evac-sites").start()


def coverage() -> list[dict]:
    """Per province: sites stored and when, for checking the fill from a shell."""
    return query("SELECT province_id, sites, fetched_at, failed_at, error FROM evac_site_progress ORDER BY province_id")


if __name__ == "__main__":
    import sys

    from ..db import apply_schema, init_pool
    init_pool()
    apply_schema()
    # `python -m app.ingest.evac_sites <province_id>` fetches one province now.
    target = sys.argv[1] if len(sys.argv) > 1 else FIRST
    row = query_one("SELECT id, ST_XMin(geom) AS w, ST_YMin(geom) AS s, ST_XMax(geom) AS e, ST_YMax(geom) AS n"
                    " FROM region WHERE id = %s", (target,))
    print(target, ingest_province(row), "titik")
