"""Load Indonesian province boundaries from geoBoundaries (gbOpen, ADM1).

Real polygons, not invented ones — every aggregate the platform reports is
tied to an actual administrative area.
"""
import csv
import io
import json
import logging

import httpx

from ..config import HTTP_TIMEOUT
from ..db import conn

log = logging.getLogger(__name__)

GB_META = "https://www.geoboundaries.org/api/current/gbOpen/IDN/ADM1/"
GB_META_ADM2 = "https://www.geoboundaries.org/api/current/gbOpen/IDN/ADM2/"

# Province populations (BPS 2023, thousands rounded to whole people).
# Held here because the boundary file carries geometry only; used for
# per-capita indicators like water stress.
POP = {
    "Aceh": 5407000, "North Sumatra": 15180000, "West Sumatra": 5640000,
    "Riau": 6614000, "Jambi": 3679000, "South Sumatra": 8660000,
    "Bengkulu": 2060000, "Lampung": 9176000,
    "Bangka Belitung Islands": 1520000, "Bangka-Belitung Islands": 1520000, "Riau Islands": 2140000,
    "Jakarta Special Capital Region": 10680000, "West Java": 49400000,
    "Central Java": 37540000, "Special Region of Yogyakarta": 3760000,
    "East Java": 41150000, "Banten": 12250000, "Bali": 4320000,
    "West Nusa Tenggara": 5590000, "East Nusa Tenggara": 5610000,
    "West Kalimantan": 5570000, "Central Kalimantan": 2740000,
    "South Kalimantan": 4180000, "East Kalimantan": 3910000,
    "North Kalimantan": 720000, "North Sulawesi": 2650000,
    "Central Sulawesi": 3060000, "South Sulawesi": 9200000,
    "Southeast Sulawesi": 2750000, "Gorontalo": 1190000,
    "West Sulawesi": 1450000, "Maluku": 1880000, "North Maluku": 1310000,
    "West Papua": 1140000, "Papua": 4400000,
}

# Indonesian names for provinces the boundary file labels in English.
NAME_ID = {
    "Aceh": "Aceh", "North Sumatra": "Sumatera Utara", "West Sumatra": "Sumatera Barat",
    "Riau": "Riau", "Jambi": "Jambi", "South Sumatra": "Sumatera Selatan",
    "Bengkulu": "Bengkulu", "Lampung": "Lampung",
    "Bangka Belitung Islands": "Kepulauan Bangka Belitung",
    "Bangka-Belitung Islands": "Kepulauan Bangka Belitung",
    "Riau Islands": "Kepulauan Riau",
    "Jakarta Special Capital Region": "DKI Jakarta", "West Java": "Jawa Barat",
    "Central Java": "Jawa Tengah", "Special Region of Yogyakarta": "DI Yogyakarta",
    "East Java": "Jawa Timur", "Banten": "Banten", "Bali": "Bali",
    "West Nusa Tenggara": "Nusa Tenggara Barat", "East Nusa Tenggara": "Nusa Tenggara Timur",
    "West Kalimantan": "Kalimantan Barat", "Central Kalimantan": "Kalimantan Tengah",
    "South Kalimantan": "Kalimantan Selatan", "East Kalimantan": "Kalimantan Timur",
    "North Kalimantan": "Kalimantan Utara", "North Sulawesi": "Sulawesi Utara",
    "Central Sulawesi": "Sulawesi Tengah", "South Sulawesi": "Sulawesi Selatan",
    "Southeast Sulawesi": "Sulawesi Tenggara", "Gorontalo": "Gorontalo",
    "West Sulawesi": "Sulawesi Barat", "Maluku": "Maluku", "North Maluku": "Maluku Utara",
    "West Papua": "Papua Barat", "Papua": "Papua",
}


def _slug(name: str) -> str:
    return "idn." + "".join(c.lower() if c.isalnum() else "_" for c in name).strip("_")


def fetch_boundaries(meta_url: str = GB_META) -> dict:
    with httpx.Client(timeout=HTTP_TIMEOUT, follow_redirects=True) as client:
        meta = client.get(meta_url).json()
        url = meta.get("simplifiedGeometryGeoJSON") or meta["gjDownloadURL"]
        log.info("mengunduh batas wilayah: %s", url)
        return client.get(url).json()


def load_regions() -> int:
    """Insert or refresh province polygons. Idempotent."""
    gj = fetch_boundaries()
    rows = 0
    with conn() as c, c.cursor() as cur:
        for feat in gj["features"]:
            en = feat["properties"]["shapeName"]
            name = NAME_ID.get(en, en)
            rid = _slug(en)
            geom = json.dumps(feat["geometry"])
            cur.execute(
                """
                INSERT INTO region (id, name, level, population, geom, area_km2)
                VALUES (
                  %s, %s, 'provinsi', %s,
                  ST_Multi(ST_CollectionExtract(ST_MakeValid(ST_GeomFromGeoJSON(%s)), 3)),
                  ST_Area(ST_GeomFromGeoJSON(%s)::geography) / 1e6
                )
                ON CONFLICT (id) DO UPDATE
                  SET name = EXCLUDED.name,
                      population = EXCLUDED.population,
                      geom = EXCLUDED.geom,
                      area_km2 = EXCLUDED.area_km2
                """,
                (rid, name, POP.get(en), geom, geom),
            )
            rows += 1
    log.info("%d wilayah dimuat", rows)
    return rows


def load_kabkota() -> int:
    """Load the 519 kabupaten/kota (ADM2) and link each to its province.

    Parent is resolved spatially — whichever province polygon contains the
    kabupaten's centroid — because the boundary file carries no parent key.
    Population is filled separately by `load_kabkota_population()`, which is
    why the upsert below deliberately leaves that column alone.
    """
    gj = fetch_boundaries(GB_META_ADM2)
    rows = 0
    with conn() as c, c.cursor() as cur:
        for feat in gj["features"]:
            name = feat["properties"]["shapeName"]
            rid = "idn2." + "".join(
                ch.lower() if ch.isalnum() else "_" for ch in name
            ).strip("_")
            geom = json.dumps(feat["geometry"])
            cur.execute(
                """
                INSERT INTO region (id, name, level, parent_id, geom, area_km2)
                VALUES (
                  %(id)s, %(name)s, 'kabkota',
                  -- Nearest province, not strict containment: island
                  -- kabupaten like Kepulauan Seribu sit outside every
                  -- mainland polygon and would otherwise have no parent.
                  (SELECT r.id FROM region r
                    WHERE r.level = 'provinsi'
                    ORDER BY r.geom <-> ST_PointOnSurface(
                      ST_CollectionExtract(
                        ST_MakeValid(ST_GeomFromGeoJSON(%(geom)s)), 3))
                    LIMIT 1),
                  ST_Multi(ST_CollectionExtract(
                    ST_MakeValid(ST_GeomFromGeoJSON(%(geom)s)), 3)),
                  ST_Area(ST_GeomFromGeoJSON(%(geom)s)::geography) / 1e6
                )
                ON CONFLICT (id) DO UPDATE
                  SET name = EXCLUDED.name,
                      parent_id = EXCLUDED.parent_id,
                      geom = EXCLUDED.geom,
                      area_km2 = EXCLUDED.area_km2
                """,
                {"id": rid, "name": name, "geom": geom},
            )
            rows += 1
    log.info("%d kabupaten/kota dimuat", rows)
    return rows


# UN OCHA Common Operational Dataset for Indonesia, sourced from UNFPA and
# built on the 2020 census. Tabular per-kabupaten totals — the boundary
# files carry geometry only, and WorldPop publishes rasters that would need
# zonal statistics to use.
HDX_PKG = "https://data.humdata.org/api/3/action/package_show?id=cod-ps-idn"
HDX_RES = "idn_admpop_adm2_2020_v3.csv"


def _match_key(name: str) -> str:
    """Normalise a region name for matching across the two sources.

    The "Kota" prefix is deliberately KEPT. Both sources distinguish a city
    from the surrounding regency by that word alone — "Kota Magelang" has
    121k people, "Magelang" has 1.29M — so stripping it collapses the pair
    onto one key and silently gives the city the regency's population.
    Only punctuation and spacing are normalised.
    """
    s = name.lower().replace("-", " ").replace(".", "")
    return " ".join(
        "".join(ch for ch in s if ch.isalnum() or ch == " ").split()
    )


def load_kabkota_population() -> int:
    """Fill per-kabupaten population so density is computed, not inherited.

    Without this every kabupaten in a province reported the same density —
    Kota Yogyakarta (32 km2) and Sleman (575 km2) both read 1181 jiwa/km2,
    which is the province figure rather than their own.
    """
    with httpx.Client(timeout=HTTP_TIMEOUT, follow_redirects=True) as client:
        meta = client.get(HDX_PKG).json()
        url = next(
            (r["url"] for r in meta["result"]["resources"] if r["name"] == HDX_RES),
            None,
        )
        if not url:
            raise RuntimeError(f"resource {HDX_RES} tidak ada di paket HDX")
        # utf-8-sig: the file carries a BOM, which otherwise corrupts the
        # first column name and silently breaks every lookup.
        text = client.get(url).text

    reader = csv.DictReader(io.StringIO(text))
    pops = {}
    for row in reader:
        name = (row.get("ADM2_EN") or "").strip().lstrip("﻿")
        total = (row.get("T_TL") or "").strip()
        if not name or not total:
            continue
        try:
            pops[_match_key(name)] = int(float(total))
        except ValueError:
            continue

    if not pops:
        raise RuntimeError("tabel penduduk kabupaten kosong")

    updated = 0
    with conn() as c, c.cursor() as cur:
        cur.execute("SELECT id, name FROM region WHERE level = 'kabkota'")
        regions = cur.fetchall()
        for r in regions:
            p = pops.get(_match_key(r["name"]))
            if p is None:
                continue
            cur.execute(
                "UPDATE region SET population = %s WHERE id = %s", (p, r["id"])
            )
            updated += 1

    log.info("penduduk kabupaten/kota: %d dari %d wilayah", updated, len(regions))
    return updated
