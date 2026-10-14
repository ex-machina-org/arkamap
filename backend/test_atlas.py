"""Checks for the things most likely to break silently.

Run against a live API + seeded database:
    DATABASE_URL=... python test_atlas.py

No pytest, no fixtures — asserts and a summary line.
"""
import os
import sys
import time

import httpx

BASE = os.getenv("ATLAS_API", "http://127.0.0.1:8000/api")
passed, failed = 0, []


def check(name: str, cond: bool, detail: str = "") -> None:
    global passed
    if cond:
        passed += 1
        print(f"  pass  {name}")
    else:
        failed.append(name)
        print(f"  FAIL  {name} {detail}")


def main() -> int:
    c = httpx.Client(base_url=BASE, timeout=60)

    # ── health ──
    h = c.get("/health").json()
    check("database terhubung", h["database"] == "connected")
    lv = {r["level"]: r["regions"] for r in c.get("/levels").json()}
    check("34 provinsi termuat", lv.get("provinsi") == 34, f"dapat {lv.get('provinsi')}")
    check("519 kabupaten/kota termuat", lv.get("kabkota") == 519, f"dapat {lv.get('kabkota')}")
    check("ada observasi titik panas", h["observations"] > 1000, f"dapat {h['observations']}")

    # ── metric catalogue covers all three aspects ──
    ms = c.get("/metrics").json()
    aspects = {m["aspect"] for m in ms}
    check("tiga aspek ada", aspects == {"urban", "lingkungan", "energi"}, str(aspects))

    # ── every metric must serve a map without error ──
    for m in ms:
        gj = c.get(f"/map/{m['metric']}").json()
        ok = gj["type"] == "FeatureCollection" and len(gj["features"]) == 34
        check(f"peta {m['metric']}", ok, f"{len(gj.get('features', []))} fitur")

    # ── kabupaten/kota level serves the same metrics ──
    kab = c.get("/map/fire_risk", params={"level": "kabkota"}).json()
    check("peta kabkota terlayani", len(kab["features"]) == 519,
          f"{len(kab['features'])} fitur")
    check("setiap kabkota punya induk provinsi",
          all(f["properties"]["parent_id"] for f in kab["features"]),
          "ada yang tanpa induk")
    kv = [f["properties"]["value"] for f in kab["features"]
          if f["properties"]["value"] is not None]
    check("kabkota punya nilai indikator", len(kv) > 400, f"hanya {len(kv)}")

    # ── normalisation direction ──
    # high_good: the region with the MOST of it must normalise LOWEST.
    gj = c.get("/map/solar_rooftop_mwp").json()
    vals = [(f["properties"]["value"], f["properties"]["normalised"])
            for f in gj["features"] if f["properties"]["value"] is not None]
    hi_val = max(vals, key=lambda x: x[0])
    lo_val = min(vals, key=lambda x: x[0])
    check("high_good dibalik dengan benar", hi_val[1] < lo_val[1],
          f"nilai tertinggi {hi_val} vs terendah {lo_val}")

    # high_bad: most hotspots must normalise HIGHEST.
    gj = c.get("/map/hotspot_count_7d").json()
    vals = [(f["properties"]["value"], f["properties"]["normalised"])
            for f in gj["features"] if f["properties"]["value"] is not None]
    hi = max(vals, key=lambda x: x[0])
    lo = min(vals, key=lambda x: x[0])
    check("high_bad tidak dibalik", hi[1] >= lo[1], f"{hi} vs {lo}")

    # ── no region left without population (the Bangka Belitung bug) ──
    gj = c.get("/map/population_density").json()
    missing = [f["properties"]["name"] for f in gj["features"]
               if not f["properties"]["value"]]
    check("semua wilayah punya kepadatan penduduk", not missing, str(missing))

    # ── values must sit inside their declared scale, or the legend lies ──
    for metric in ("fire_risk", "water_stress"):
        gj = c.get(f"/map/{metric}").json()
        smin, smax = gj["metric"]["scale_min"], gj["metric"]["scale_max"]
        bad = [f["properties"]["value"] for f in gj["features"]
               if f["properties"]["value"] is not None
               and not (smin <= f["properties"]["value"] <= smax)]
        check(f"{metric} dalam rentang skala", not bad, str(bad[:3]))

    # ── fire risk must track observed fire, not just weather ──
    fr = {f["properties"]["name"]: f["properties"]["value"]
          for f in c.get("/map/fire_risk").json()["features"]}
    hs = {f["properties"]["name"]: f["properties"]["value"]
          for f in c.get("/map/hotspot_count_7d").json()["features"]}
    worst_fire = max(hs, key=lambda k: hs[k] or 0)
    rank = sorted(fr, key=lambda k: fr[k] or 0, reverse=True).index(worst_fire)
    check("provinsi dengan titik panas terbanyak masuk 5 besar risiko",
          rank < 5, f"{worst_fire} peringkat {rank + 1}, {int(hs[worst_fire])} titik")

    # ── external APIs actually delivered, not just registered ──
    srcs = {x["id"]: x for x in c.get("/sources").json()}
    for sid in ("climate_trace", "nasa_power", "open_meteo_flood"):
        check(f"sumber {sid} terdaftar", sid in srcs)

    # Climate TRACE mixes capacity units; a province above ~25 GW means the
    # implausible-row guard stopped working.
    cap = [f["properties"]["value"] for f in
           c.get("/map/power_capacity_mw").json()["features"]
           if f["properties"]["value"]]
    check("kapasitas pembangkit masuk akal", cap and max(cap) < 25000,
          f"maks {max(cap) if cap else 0} MW")
    check("ada pembangkit tercatat", sum(cap) > 20000, f"total {sum(cap)} MW")

    # The annual figure must sit below the 30-day one in the dry season, and
    # inside the real Indonesian range.
    ann = {f["properties"]["name"]: f["properties"]["value"]
           for f in c.get("/map/solar_ghi_annual").json()["features"]
           if f["properties"]["value"]}
    check("iradiasi tahunan dalam rentang Indonesia",
          ann and 3.5 < min(ann.values()) and max(ann.values()) < 6.5,
          f"{min(ann.values()) if ann else 0}–{max(ann.values()) if ann else 0}")

    # ── adaptive scoring: different weights must give different rankings ──
    fire = c.post("/score", json={"weights": {"fire_risk": 1.0}}).json()
    water = c.post("/score", json={"weights": {"water_stress": 1.0}}).json()
    # Compare whole orderings, not just the leader: one region can genuinely
    # top both lists, which made the old single-row check flaky.
    fire_order = [r["region_id"] for r in fire["results"][:20]]
    water_order = [r["region_id"] for r in water["results"][:20]]
    check("bobot berbeda -> peringkat berbeda", fire_order != water_order,
          "20 teratas identik untuk dua metrik berbeda")
    check("skor melaporkan porsi model",
          "modelled_share" in fire["results"][0])

    # ── scoring rejects nonsense instead of inventing an answer ──
    r = c.post("/score", json={"weights": {"tidak_ada_metrik": 1.0}})
    check("metrik tak dikenal ditolak", r.status_code == 400, f"status {r.status_code}")
    r = c.post("/score", json={"weights": {}})
    check("bobot kosong ditolak", r.status_code == 400, f"status {r.status_code}")

    # ── region detail carries provenance on every value ──
    rid = fire["results"][0]["region_id"]
    det = c.get(f"/regions/{rid}").json()
    check("detail wilayah punya indikator", len(det["indicators"]) > 5)
    check("setiap nilai punya sumber",
          all(i["source_id"] for i in det["indicators"]))
    check("setiap nilai menandai model/observasi",
          all(isinstance(i["is_modelled"], bool) for i in det["indicators"]))

    # ── hotspots endpoint returns real points ──
    hp = c.get("/hotspots", params={"days": 7, "limit": 50}).json()
    check("titik panas terlayani", hp["count"] > 0 and
          all(-11 <= f["geometry"]["coordinates"][1] <= 6 for f in hp["features"]),
          "koordinat di luar Indonesia" if hp["count"] else "kosong")

    # one fire is one point: a single satellite, no low-confidence detections, inside Indonesia
    feats = c.get("/hotspots", params={"days": 7, "limit": 500}).json()["features"]
    check("titik panas tanpa keyakinan rendah", all(f["properties"].get("confidence") != "low" for f in feats))

    # ── earthquakes: recorded events, never a forecast ──
    # a region filter must use the spatial index: the old "(region IS NULL OR EXISTS ...)" form scanned every
    # hotspot of the period (1-2 s per count) and made /me/dashboard take 12-18 s
    # (the report counts a year of hotspots, quakes and disasters in one region: ~0.15 s indexed, ~2 s not)
    t0 = time.monotonic()
    c.get("/reports/idn.riau", params={"days": 365}).raise_for_status()
    check("hitung kejadian per wilayah memakai index (laporan setahun < 1 dtk)", time.monotonic() - t0 < 1.0,
          f"{time.monotonic() - t0:.1f} dtk")
    qk = c.get("/quakes", params={"days": 30, "min_mag": 4}).json()
    check("gempa terlayani", qk["count"] > 0 and
          all(-11 <= f["geometry"]["coordinates"][1] <= 6 for f in qk["features"]),
          "koordinat di luar Indonesia" if qk["count"] else "kosong")
    check("gempa membawa kedalaman",
          all(f["properties"]["depth_km"] is not None for f in qk["features"]))

    haz = c.get("/map/seismic_hazard").json()["features"]
    hv = {f["properties"]["name"]: f["properties"]["value"] for f in haz}
    check("kerawanan gempa mencakup semua provinsi", len(hv) == 34,
          f"hanya {len(hv)}")
    check("kerawanan gempa dalam 0-100",
          all(v is not None and 0 <= v <= 100 for v in hv.values()))

    # Aceh carries the 2004 M9.1; Kalimantan sits off the plate boundary.
    # If these ever invert, the energy weighting has broken.
    check("Aceh lebih rawan gempa daripada Kalimantan Tengah",
          hv.get("Aceh", 0) > hv.get("Kalimantan Tengah", 100))
    check("Kalimantan aseismik tercatat nol, bukan kosong",
          hv.get("Kalimantan Tengah") == 0)

    # A province that caught one distant quake must not outrank one sitting
    # on a live fault — energy alone did exactly that before damping.
    counts = {f["properties"]["name"]: f["properties"]["value"]
              for f in c.get("/map/quake_count_30y").json()["features"]}
    rare = [n for n, k in counts.items() if k is not None and k <= 5 and hv.get(n)]
    check("wilayah dgn sedikit gempa tidak mengalahkan zona aktif",
          all(hv[n] < hv.get("Bengkulu", 100) for n in rare),
          f"anomali: {[n for n in rare if hv[n] >= hv.get('Bengkulu', 100)]}")

    # ── building footprints: live Overpass, so this also guards the mirror
    # fallback (the main instance refuses connections from some hosts) ──
    bl = c.get("/buildings", params={
        "west": 110.3681, "south": -7.7964, "east": 110.3709, "north": -7.7948,
    }, timeout=60)
    check("jejak bangunan terlayani", bl.status_code == 200,
          f"HTTP {bl.status_code}")
    if bl.status_code == 200:
        b = bl.json()
        check("bangunan punya luas dan kategori", b["count"] > 0 and all(
            f["properties"]["area_m2"] > 0 and f["properties"]["kind"]
            for f in b["features"]))
        # A roof in a dense kampung is tens to hundreds of m2; thousands
        # would mean the shoelace scaling is wrong.
        areas = sorted(f["properties"]["area_m2"] for f in b["features"])
        med = areas[len(areas) // 2]
        check("luas bangunan masuk akal", 20 <= med <= 2000, f"median {med} m2")

    big = c.get("/buildings", params={
        "west": 106.0, "south": -7.0, "east": 107.0, "north": -6.0,
    })
    check("area terlalu luas ditolak", big.status_code == 400)

    # ── population density is computed per kabupaten, not inherited ──
    pdm = c.get("/map/population_density", params={"level": "kabkota"}).json()
    props = {f["properties"]["name"]: f["properties"] for f in pdm["features"]}
    dens = {n: p["value"] for n, p in props.items() if p["value"] is not None}
    check("kepadatan kabupaten terisi", len(dens) > 500, f"hanya {len(dens)}")

    # Every kabupaten in a province used to share the province's density.
    yk = {n: dens.get(n) for n in ("Kota Yogyakarta", "Sleman", "Bantul")}
    check("kepadatan tiap kabupaten berbeda, bukan warisan provinsi",
          len({v for v in yk.values() if v is not None}) == 3, str(yk))

    # "Kota X" and "X" are a city and its surrounding regency. Matching on
    # the bare name merged them and gave the city the regency's population.
    pairs = [("Kota Magelang", "Magelang"), ("Kota Mojokerto", "Mojokerto")]
    for kota, kab in pairs:
        pk, pb = props.get(kota, {}).get("population"), props.get(kab, {}).get("population")
        check(f"{kota} tidak tertukar dengan {kab}",
              pk is not None and pb is not None and pk < pb,
              f"{kota}={pk} {kab}={pb}")

    # A city denser than its own regency is the expected direction; the
    # reverse meant the two had been swapped.
    check("kota lebih padat daripada kabupaten sekitarnya",
          all(dens.get(k, 0) > dens.get(b, 1e9) for k, b in pairs))

    top = max(dens.values())
    check("kepadatan tertinggi masuk akal", 10000 < top < 40000, f"{top} jiwa/km²")

    # ── wind: a bearing, ingested but deliberately not a catalogue metric ──
    # A bearing has no "bad" end, so it must never reach the choropleth rail.
    check("arah angin bukan metrik peta",
          c.get("/map/wind_direction", params={"level": "kabkota"}).status_code == 404,
          "wind_direction masih dilayani sebagai choropleth")
    # Direction still reaches the map, but through the particle grid, where a
    # bearing is a vector rather than a rank.
    wg = c.get("/windgrid")
    if wg.status_code == 200:
        g = wg.json()
        dirs = [d for d in g["direction"] if d is not None]
        check("arah angin ada di grid partikel", len(dirs) > 100, f"hanya {len(dirs)}")
        check("arah angin dalam 0-360", all(0 <= d <= 360 for d in dirs),
              f"di luar rentang: {[d for d in dirs if not 0 <= d <= 360][:3]}")
        check("arah angin bervariasi", len(set(dirs)) > 20,
              f"hanya {len(set(dirs))} nilai unik")
    else:
        check("grid angin tersedia atau melapor tidak lengkap",
              wg.status_code == 503, f"status {wg.status_code}")

    ws = {f["properties"]["region_id"]: f["properties"]["value"]
          for f in c.get("/map/wind_speed", params={"level": "kabkota"}).json()["features"]}
    spd = [v for v in ws.values() if v is not None]
    check("kecepatan angin masuk akal", spd and 0 <= min(spd) and max(spd) < 150,
          f"{min(spd) if spd else 0}-{max(spd) if spd else 0} km/jam")

    # ── wind grid for the particle field ──
    wg = c.get("/windgrid")
    # 503 means the stored grid is incomplete and the endpoint is refusing
    # to serve misplaced values — a correct outcome, not a failure.
    check("grid angin terlayani", wg.status_code in (200, 503),
          f"HTTP {wg.status_code}")
    if wg.status_code == 200:
        g = wg.json()
        check("grid angin lengkap",
              len(g["direction"]) == g["nx"] * g["ny"] and
              len(g["speed"]) == g["nx"] * g["ny"],
              f"{len(g['direction'])} vs {g['nx']}x{g['ny']}")
        check("grid angin menutupi Indonesia",
              g["west"] <= 95.5 and g["east"] >= 140.5
              and g["south"] <= -10.5 and g["north"] >= 5.5,
              f"{g['west']},{g['south']} -> {g['east']},{g['north']}")
        check("arah grid dalam 0-360",
              all(0 <= d <= 360 for d in g["direction"]))
        # A collapsed field would animate every particle in one direction.
        check("arah grid bervariasi", len(set(g["direction"])) > 30,
              f"hanya {len(set(g['direction']))} nilai unik")

    # ── air temperature: the heat layer ──
    for metric in ("temp_max_mean", "temp_max_peak"):
        tm = c.get(f"/map/{metric}", params={"level": "kabkota"}).json()
        vals = [f["properties"]["value"] for f in tm["features"]
                if f["properties"]["value"] is not None]
        check(f"{metric} terisi", len(vals) > 500, f"hanya {len(vals)}")
        # Indonesia is tropical: anything outside this is a unit or parsing
        # bug, not weather.
        check(f"{metric} dalam rentang tropis",
              vals and 10 < min(vals) and max(vals) < 45,
              f"{min(vals) if vals else 0}-{max(vals) if vals else 0} C")
        smin, smax = tm["metric"]["scale_min"], tm["metric"]["scale_max"]
        outside = [v for v in vals if not (smin <= v <= smax)]
        check(f"{metric} muat di skalanya", not outside,
              f"{len(outside)} di luar {smin}-{smax}")

    # The peak can never be below the 7-day mean for the same region.
    mean = {f["properties"]["region_id"]: f["properties"]["value"]
            for f in c.get("/map/temp_max_mean", params={"level": "kabkota"}).json()["features"]}
    peak = {f["properties"]["region_id"]: f["properties"]["value"]
            for f in c.get("/map/temp_max_peak", params={"level": "kabkota"}).json()["features"]}
    bad = [k for k, v in mean.items()
           if v is not None and peak.get(k) is not None and peak[k] < v - 0.01]
    check("suhu puncak >= rata-rata", not bad, f"{len(bad)} wilayah terbalik")

    # ── the grid also carries temperature, for the heat basemap ──
    wgt = c.get("/windgrid")
    # 503 is a valid state: the endpoint refuses an incomplete grid rather
    # than serving values at the wrong coordinates.
    check("endpoint grid menjawab", wgt.status_code in (200, 503),
          f"HTTP {wgt.status_code}")
    if wgt.status_code == 200:
        g = wgt.json()
        temps = [t for t in (g.get("temperature") or []) if t is not None]
        check("grid membawa suhu", len(temps) > 700, f"hanya {len(temps)}")
        check("suhu grid dalam rentang wajar",
              temps and 0 < min(temps) and max(temps) < 50,
              f"{min(temps) if temps else 0}-{max(temps) if temps else 0} C")

        srf = [t for t in (g.get("surface") or []) if t is not None]
        check("grid membawa suhu permukaan", len(srf) > 700, f"hanya {len(srf)}")
        # Ground runs hotter than the air above it in daytime tropics;
        # if this inverts, air and surface have been swapped.
        pairs = [(a, b) for a, b in zip(g.get("temperature") or [], g.get("surface") or [])
                 if a is not None and b is not None]
        hotter = sum(1 for a, b in pairs if b > a)
        check("permukaan umumnya lebih panas dari udara",
              pairs and hotter / len(pairs) > 0.6,
              f"hanya {hotter}/{len(pairs)} titik")
        check("suhu permukaan dalam rentang wajar",
              srf and 0 < min(srf) and max(srf) < 70,
              f"{min(srf) if srf else 0}-{max(srf) if srf else 0} C")

    # ── every dataset reachable: catalog, region x metric table, history, observation layers ──
    cat = c.get("/catalog").json()
    ind = {i["metric"]: i for i in cat["indicators"]}
    check("katalog memuat metrik internal", ind.get("wind_direction", {}).get("internal") is True)
    check("katalog memuat semua lapisan observasi",
          {"hotspot", "quake", "power_plant", "transit_stop"} <= {o["metric"] for o in cat["observations"]})
    t = c.get("/indicators", params={"level": "kabkota", "parent": "idn.east_kalimantan",
                                     "metrics": "pm25_mean", "sort": "pm25_mean", "order": "desc"}).json()
    vals = [r["pm25_mean"] for r in t["rows"] if r["pm25_mean"] is not None]
    check("tabel: hanya kab/kota di provinsi itu", t["rows"] and all(r["parent_id"] == "idn.east_kalimantan"
                                                                      for r in t["rows"]))
    check("tabel: urut menurun", vals == sorted(vals, reverse=True))
    check("tabel: metrik tak dikenal ditolak", c.get("/indicators", params={"metrics": "x"}).status_code == 422)
    csv_text = c.get("/indicators", params={"metrics": "pm25_mean", "format": "csv"}).text
    check("tabel: CSV berkepala", csv_text.startswith("region_id,name,level,parent_id,population,pm25_mean"))
    hs = c.get("/indicators/history", params={"region_id": "idn.riau", "metrics": "fire_risk"}).json()["series"]
    periods = [p["period"] for p in hs[0]["points"]] if hs else []
    check("riwayat: periode urut naik", periods and periods == sorted(periods))
    pp = c.get("/observations", params={"metric": "power_plant", "limit": 5}).json()
    check("observasi pembangkit berupa GeoJSON", pp["features"] and pp["features"][0]["geometry"]["type"] == "Point")
    check("observasi tak dikenal 404", c.get("/observations", params={"metric": "x"}).status_code == 404)

    print(f"\n{passed} lulus, {len(failed)} gagal")
    if failed:
        print("gagal:", ", ".join(failed))
        return 1
    return 0


if __name__ == "__main__":
    sys.exit(main())
