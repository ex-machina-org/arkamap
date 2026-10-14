"""Demo IoT data for trying the named, versioned data tables by hand.

    docker compose exec api python seed_iot_demo.py
    IOT_DEMO_PASSWORD=... docker compose exec -e IOT_DEMO_PASSWORD api python seed_iot_demo.py

Creates (or reuses) the account IOT_DEMO_EMAIL (default uji.versi@arkamap.local)
and gives it one device, "Stasiun Uji Versi", filled through the normal ingest
path:
    cuaca            v1.0: suhu, kelembapan (25 readings), v2.0: + angin (20)
    kualitas_udara   v1.0: pm25, pm10 (6)
    Tanpa Nama       1 reading without nama/waktu (the transition warning)
Re-running replaces that device and its data. The password is only set when
the account is created: IOT_DEMO_PASSWORD, else a random one printed once.
"""
import json
import logging
import os
import secrets
import sys
import time
from datetime import datetime, timedelta, timezone

from app.api import users
from app.auth import hash_password
from app.db import apply_schema, close_pool, init_pool, query, query_one
from app.iot import ingest as iot
from app.iot import layout as iot_layout

logging.basicConfig(level=logging.INFO, format="%(levelname)-7s %(message)s")
log = logging.getLogger("seed_iot_demo")

EMAIL = os.getenv("IOT_DEMO_EMAIL", "uji.versi@arkamap.local").lower()
DEVICE = "Stasiun Uji Versi"


def main() -> int:
    init_pool()
    apply_schema()

    user = query_one("SELECT id, email, name, is_admin FROM app_user WHERE email = %s", (EMAIL,))
    password = None
    if not user:
        password = os.getenv("IOT_DEMO_PASSWORD") or secrets.token_urlsafe(9)
        user = query_one("INSERT INTO app_user (email, password_hash, name) VALUES (%s, %s, %s)"
                         " RETURNING id, email, name, is_admin", (EMAIL, hash_password(password), "Uji Versi"))
    for old in query("SELECT id FROM device WHERE user_id = %s AND name = %s", (user["id"], DEVICE)):
        users.delete_device(old["id"], user)        # also drops its MQTT credentials
    dev = users.create_device(users.DeviceIn(name=DEVICE), user)["device"]["id"]

    start = datetime.now(timezone.utc) - timedelta(hours=8)
    waktu = lambda i: (start + timedelta(minutes=5 * i)).isoformat()  # noqa: E731

    def send(payload: dict) -> dict:
        iot._last.clear()                           # the 1/s rate limit is for real senders
        return iot.ingest_device(dev, json.dumps(payload), "http")

    for i in range(25):
        send({"nama": "cuaca", "waktu": waktu(i), "data": {"suhu": round(27 + (i % 6) * 0.4, 1), "kelembapan": 70 + i % 7}})
    for i in range(25, 45):
        send({"nama": "cuaca", "waktu": waktu(i),
              "data": {"suhu": round(28 + (i % 6) * 0.4, 1), "kelembapan": 68 + i % 5, "angin": round(2 + (i % 4) * 0.7, 1)}})
    for i in range(6):
        send({"nama": "Kualitas Udara", "waktu": waktu(40 + i), "data": {"pm25": 12 + i * 1.5, "pm10": 30 + i}})
    send({"data": {"suhu": 26.1}})
    # new fields started the AI layout in a background thread; let it finish
    # (its model timeout is 60 s) instead of killing it mid-query at exit
    deadline = time.monotonic() + 90
    while iot_layout._planning and time.monotonic() < deadline:
        time.sleep(0.5)

    for st in users.list_streams(dev, user):
        log.info("%-16s %3d kiriman  %s", st["name"], st["reading_count"],
                 ", ".join(f"v{v['version']}.0 ({v['reading_count']})" for v in st["versions"]))
    log.info("login: %s", EMAIL)
    if password:
        log.info("password (hanya tampil sekali): %s", password)
    else:
        log.info("akun sudah ada; password tidak diubah")
    close_pool()
    return 0


if __name__ == "__main__":
    sys.exit(main())
