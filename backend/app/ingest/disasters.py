"""Disaster events beyond quakes and hotspots: GDACS alerts and NASA EONET.

Both land in `observation` as metric 'disaster', one row per event, keyed on
its start time + location so a later run updates the alert level instead of
adding a duplicate. attrs.type is normalised across the two feeds:
volcano, earthquake, flood, wildfire, cyclone, drought, landslide, other.
"""
import json
import logging
import re
from datetime import datetime, timezone

import httpx

from ..config import HTTP_TIMEOUT, IDN_BBOX
from ..db import conn, execute

log = logging.getLogger(__name__)

GDACS_URL = "https://www.gdacs.org/gdacsapi/api/events/geteventlist/SEARCH"
EONET_URL = "https://eonet.gsfc.nasa.gov/api/v3/events"

_GDACS_TYPES = {"VO": "volcano", "EQ": "earthquake", "FL": "flood", "WF": "wildfire",
                "TC": "cyclone", "DR": "drought"}
_EONET_TYPES = {"volcanoes": "volcano", "earthquakes": "earthquake", "floods": "flood",
                "wildfires": "wildfire", "severeStorms": "cyclone", "drought": "drought",
                "landslides": "landslide"}
# GDACS alertlevel -> 1..3, so both feeds sort on one numeric `value`
_ALERT = {"Green": 1, "Orange": 2, "Red": 3}

# EONET's bbox query also returns Malaysia, the Philippines, Timor-Leste and
# PNG; keep only its events within ~55 km (0.5 deg) of an Indonesian region.
# GDACS is already filtered by country, and its flood centroids can sit far
# offshore, so it is exempt.
_UPSERT = """
    INSERT INTO observation (source_id, metric, observed_at, value, attrs, geom)
    SELECT %(src)s, 'disaster', %(when)s, %(value)s, %(attrs)s::jsonb, pt
    FROM (SELECT ST_Centroid(ST_SetSRID(ST_GeomFromGeoJSON(%(geom)s), 4326)) AS pt) p
    WHERE %(src)s = 'gdacs'
       OR EXISTS (SELECT 1 FROM region r
                  WHERE r.level = 'provinsi' AND ST_DWithin(r.geom, p.pt, 0.5))
    ON CONFLICT (source_id, metric, observed_at, geom) DO UPDATE
      SET value = EXCLUDED.value, attrs = EXCLUDED.attrs
"""


def _ts(s: str) -> datetime:
    """GDACS dates carry no offset but are UTC; EONET ends in Z."""
    d = datetime.fromisoformat(s.replace("Z", "+00:00"))
    return d if d.tzinfo else d.replace(tzinfo=timezone.utc)


def _save(rows: list[dict]) -> int:
    """Returns rows actually stored (outside-Indonesia ones are skipped)."""
    n = 0
    with conn() as c, c.cursor() as cur:
        for r in rows:
            cur.execute(_UPSERT, r)
            n += cur.rowcount
    return n


def gdacs_rows(features: list[dict]) -> list[dict]:
    rows = []
    for f in features:
        p, g = f.get("properties") or {}, f.get("geometry")
        if not g or not p.get("fromdate"):
            continue
        rows.append({
            "src": "gdacs", "when": _ts(p["fromdate"]),
            "value": _ALERT.get(p.get("alertlevel"), 0),
            "geom": json.dumps(g),
            "attrs": json.dumps({
                "type": _GDACS_TYPES.get(p.get("eventtype"), "other"),
                "name": p.get("name"), "alertlevel": p.get("alertlevel"),
                "gdacs_ref": f"{p.get('eventtype')}-{p.get('eventid')}",
                "until": p.get("todate"), "current": p.get("iscurrent") == "true",
                "url": (p.get("url") or {}).get("report"),
            }),
        })
    return rows


def eonet_rows(events: list[dict]) -> list[dict]:
    rows = []
    for e in events:
        geoms = e.get("geometry") or []
        if not geoms:
            continue
        first, last = geoms[0], geoms[-1]
        cat = (e.get("categories") or [{}])[0].get("id")
        # EONET re-publishes many GDACS events; keep the GDACS id to match on
        ref = next((f"{m[1]}-{m[2]}" for src in e.get("sources") or []
                    if src.get("id") == "GDACS"
                    and (m := re.search(r"eventtype=(\w+)&eventid=(\d+)", src.get("url", "")))), None)
        rows.append({
            "src": "nasa_eonet", "when": _ts(first["date"]),
            "value": last.get("magnitudeValue"),
            "geom": json.dumps({"type": last["type"], "coordinates": last["coordinates"]}),
            "attrs": json.dumps({
                "type": _EONET_TYPES.get(cat, "other"), "name": e.get("title"),
                "magnitude_unit": last.get("magnitudeUnit"),
                "until": e.get("closed"), "current": e.get("closed") is None,
                "url": e.get("link"), "gdacs_ref": ref,
            }),
        })
    return rows


def ingest_gdacs() -> int:
    with httpx.Client(timeout=HTTP_TIMEOUT, follow_redirects=True) as c:
        r = c.get(GDACS_URL, params={"country": "Indonesia", "limit": 100})
        r.raise_for_status()
    n = _save(gdacs_rows(r.json().get("features", [])))
    log.info("%d kejadian GDACS", n)
    return n


def ingest_eonet(days: int = 90) -> int:
    w, s, e, n = IDN_BBOX
    with httpx.Client(timeout=HTTP_TIMEOUT, follow_redirects=True) as c:
        r = c.get(EONET_URL, params={"bbox": f"{w},{n},{e},{s}", "status": "all", "days": days})
        r.raise_for_status()
    n = _save(eonet_rows(r.json().get("events", [])))
    log.info("%d kejadian EONET", n)
    return n


def dedupe() -> int:
    """Delete EONET rows GDACS already has. GDACS wins: it carries the alert
    level. Match on the shared GDACS id, or, when EONET got the event from
    elsewhere, on same type within 1 degree and 3 days of start."""
    # ponytail: fixed 1 deg / 3 day window; tighten if distinct events merge
    # also clears rows stored before the Indonesia filter existed
    outside = execute(
        """
        DELETE FROM observation o
        WHERE o.metric = 'disaster' AND o.source_id = 'nasa_eonet'
          AND NOT EXISTS (SELECT 1 FROM region r
                          WHERE r.level = 'provinsi' AND ST_DWithin(r.geom, o.geom, 0.5))
        """
    )
    return outside + execute(
        """
        DELETE FROM observation e
        WHERE e.metric = 'disaster' AND e.source_id = 'nasa_eonet'
          AND EXISTS (
            SELECT 1 FROM observation g
            WHERE g.metric = 'disaster' AND g.source_id = 'gdacs'
              AND (g.attrs->>'gdacs_ref' = e.attrs->>'gdacs_ref'
                   OR (g.attrs->>'type' = e.attrs->>'type'
                       AND g.observed_at BETWEEN e.observed_at - interval '3 days'
                                             AND e.observed_at + interval '3 days'
                       AND ST_DWithin(g.geom, e.geom, 1.0))))
        """
    )


if __name__ == "__main__":
    g = gdacs_rows([{"geometry": {"type": "Point", "coordinates": [105.4, -6.1]},
                     "properties": {"eventtype": "VO", "fromdate": "2026-09-04T21:00:00",
                                    "alertlevel": "Orange", "name": "Eruption Krakatau"}}])
    assert g[0]["value"] == 2 and json.loads(g[0]["attrs"])["type"] == "volcano"
    assert g[0]["when"].tzinfo is not None
    e = eonet_rows([{"title": "Wildfire", "closed": None, "categories": [{"id": "wildfires"}],
                     "sources": [{"id": "GDACS", "url": "https://www.gdacs.org/report.aspx?eventtype=WF&eventid=1032457"}],
                     "geometry": [{"date": "2026-09-21T19:00:00Z", "type": "Point",
                                   "coordinates": [139.5, -6.4], "magnitudeValue": 5137.0}]}])
    assert e[0]["value"] == 5137.0 and json.loads(e[0]["attrs"])["current"] is True
    assert json.loads(e[0]["attrs"])["gdacs_ref"] == "WF-1032457"
    assert json.loads(g[0]["attrs"])["gdacs_ref"] == "VO-None"  # no eventid in the fixture
    print("ok")
