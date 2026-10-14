"""BMKG, Indonesia's official source: felt/significant earthquakes and
severe-weather nowcast warnings.

Quakes are stored like the other catalogues (metric 'quake', source
'bmkg_quake') and win deduplication over USGS and EMSC: BMKG adds which
towns felt the shaking (MMI) and its own tsunami statement.

Warnings are CAP messages (heavy rain, lightning, strong wind...) with
polygons and a validity window of a few hours, so they refresh every 15
minutes, not with the twice-daily ingest. BMKG asks to be credited as the
source.
"""
import logging
import re
import xml.etree.ElementTree as ET
from datetime import datetime

import httpx

from ..config import HTTP_TIMEOUT
from ..db import conn, execute
from .seismic import urgency

log = logging.getLogger(__name__)

TEWS = "https://data.bmkg.go.id/DataMKG/TEWS/"
NOWCAST = "https://www.bmkg.go.id/alerts/nowcast/id"
UA = {"User-Agent": "nusantara-atlas/1.0 (+https://api.winatra.app)"}
CAP_NS = {"cap": "urn:oasis:names:tc:emergency:cap:1.2"}


def _client() -> httpx.Client:
    return httpx.Client(timeout=HTTP_TIMEOUT, follow_redirects=True, headers=UA)


def quake_row(g: dict) -> tuple | None:
    """One BMKG TEWS entry -> insert parameters, or None if unusable."""
    try:
        lat, lon = (float(x) for x in g["Coordinates"].split(","))
        mag = float(g["Magnitude"])
        when = datetime.fromisoformat(g["DateTime"])
    except (KeyError, ValueError):
        return None
    m = re.search(r"([\d.]+)", g.get("Kedalaman", ""))
    depth = float(m.group(1)) if m else None
    potensi = g.get("Potensi")
    # "Tidak berpotensi tsunami" must not read as a tsunami warning
    tsunami = bool(potensi and "tsunami" in potensi.lower() and "tidak" not in potensi.lower())
    return (when, mag, depth, g.get("Wilayah"), g.get("Dirasakan"), potensi,
            1 if tsunami else 0, urgency(mag, depth, tsunami), lon, lat)


def ingest_quakes() -> int:
    rows = []
    with _client() as c:
        for feed in ("gempadirasakan.json", "gempaterkini.json"):
            r = c.get(TEWS + feed)
            r.raise_for_status()
            rows += [q for q in map(quake_row, r.json()["Infogempa"]["gempa"]) if q]
    if rows:
        with conn() as c, c.cursor() as cur:
            cur.executemany(
                """
                INSERT INTO observation (source_id, metric, observed_at, value, attrs, geom)
                VALUES ('bmkg_quake', 'quake', %s, %s,
                        jsonb_strip_nulls(jsonb_build_object(
                            'depth_km', %s::float8, 'place', %s::text, 'felt', %s::text,
                            'potensi', %s::text, 'tsunami', %s::int, 'urgency', %s::text)),
                        ST_SetSRID(ST_MakePoint(%s::float8, %s::float8), 4326))
                ON CONFLICT (source_id, metric, observed_at, geom) DO UPDATE
                  SET attrs = EXCLUDED.attrs, value = EXCLUDED.value
                """,
                rows,
            )
    log.info("BMKG: %d gempa", len(rows))
    return len(rows)


def cap_polygons(x: ET.Element) -> list[str]:
    """CAP '<polygon>lat,lon lat,lon ...</polygon>' -> WKT rings (lon lat)."""
    rings = []
    for p in x.findall(".//cap:polygon", CAP_NS):
        pts = [tuple(pt.split(",")) for pt in (p.text or "").split()]
        pts = [(lon, lat) for lat, lon in pts if lat and lon]
        if len(pts) >= 3:
            if pts[0] != pts[-1]:
                pts.append(pts[0])
            rings.append("((" + ",".join(f"{lon} {lat}" for lon, lat in pts) + "))")
    return rings


def warning_row(xml: str) -> dict | None:
    x = ET.fromstring(xml)
    info = x.find("cap:info", CAP_NS)
    if info is None:
        return None
    t = lambda path: (info.findtext(path, namespaces=CAP_NS) or "").strip() or None  # noqa: E731
    rings = cap_polygons(info)
    if not rings:
        return None
    return {
        "id": (x.findtext("cap:identifier", namespaces=CAP_NS) or "").strip(),
        "event": t("cap:event"), "headline": t("cap:headline"), "description": t("cap:description"),
        "area": t("cap:area/cap:areaDesc"), "severity": t("cap:severity"),
        "urgency": t("cap:urgency"), "certainty": t("cap:certainty"),
        "effective": t("cap:effective"), "expires": t("cap:expires"),
        "wkt": "MULTIPOLYGON(" + ",".join(rings) + ")",
    }


def ingest_warnings() -> int:
    """Fetch every current nowcast; drop warnings that have expired."""
    with _client() as c:
        r = c.get(NOWCAST)
        r.raise_for_status()
        links = [i.findtext("link") for i in ET.fromstring(r.content).findall(".//item")]
        rows = []
        for link in filter(None, links):
            try:
                cap = c.get(link)
                cap.raise_for_status()
                w = warning_row(cap.text)
                if w and w["id"]:
                    rows.append({**w, "url": link})
            except Exception as exc:  # noqa: BLE001 - one bad message must not drop the rest
                log.warning("peringatan BMKG %s gagal: %s", link, exc)
    with conn() as c, c.cursor() as cur:
        cur.executemany(
            """
            INSERT INTO weather_warning (id, event, headline, description, area, severity,
                                         urgency, certainty, effective, expires, url, geom)
            VALUES (%(id)s, %(event)s, %(headline)s, %(description)s, %(area)s, %(severity)s,
                    %(urgency)s, %(certainty)s, %(effective)s, %(expires)s, %(url)s,
                    -- MakeValid can return a GeometryCollection; keep only the polygons
                    ST_Multi(ST_CollectionExtract(ST_MakeValid(ST_GeomFromText(%(wkt)s, 4326)), 3)))
            ON CONFLICT (id) DO UPDATE SET expires = EXCLUDED.expires, geom = EXCLUDED.geom,
              description = EXCLUDED.description, severity = EXCLUDED.severity
            """,
            rows,
        )
    execute("DELETE FROM weather_warning WHERE expires < now() - interval '1 day'")
    log.info("BMKG: %d peringatan cuaca", len(rows))
    return len(rows)


def run() -> dict:
    """The 15-minute job: both feeds, independently."""
    from .runner import _mark
    from .seismic import dedupe_quakes
    out = {}
    for key, fn, src in (("quakes", ingest_quakes, "bmkg_quake"),
                         ("warnings", ingest_warnings, "bmkg_warning")):
        try:
            out[key] = fn()
            _mark(src, True)
        except Exception as exc:  # noqa: BLE001
            log.exception("BMKG %s gagal", key)
            out[f"{key}_error"] = str(exc)
            _mark(src, False, str(exc))
    out["deduped"] = dedupe_quakes()
    return out


if __name__ == "__main__":
    q = quake_row({"DateTime": "2026-09-30T02:35:54+00:00", "Coordinates": "4.84,95.14", "Magnitude": "4.1",
                   "Kedalaman": "5 km", "Wilayah": "laut 54 km BL Calang", "Dirasakan": "III-IV Calang"})
    assert q[1] == 4.1 and q[2] == 5.0 and q[6] == 0 and q[8:] == (95.14, 4.84)
    q = quake_row({"DateTime": "2026-09-22T00:00:00+00:00", "Coordinates": "-8.1,107.2", "Magnitude": "7.1",
                   "Kedalaman": "20 km", "Potensi": "Berpotensi tsunami"})
    assert q[6] == 1 and q[7] == "siaga_tsunami"
    assert quake_row({"DateTime": "2026-09-22T00:00:00+00:00", "Coordinates": "-8.1,107.2", "Magnitude": "7.1",
                      "Potensi": "Tidak berpotensi tsunami"})[6] == 0
    cap = ('<alert xmlns="urn:oasis:names:tc:emergency:cap:1.2"><identifier>X1</identifier><info>'
           '<event>Hujan Lebat</event><severity>Moderate</severity><expires>2026-09-30T19:10:00+07:00</expires>'
           '<area><areaDesc>Jambi</areaDesc><polygon>-2.3,101.6 -2.4,101.7 -2.5,101.6</polygon></area>'
           '</info></alert>')
    w = warning_row(cap)
    assert w["id"] == "X1" and w["area"] == "Jambi" and w["wkt"].startswith("MULTIPOLYGON(((101.6 -2.3,")
    print("ok")
