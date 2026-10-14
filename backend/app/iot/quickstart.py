"""Copy-paste examples for one device, filled with its own URL, topic and
key, so a sensor owner never has to assemble a request by hand."""
import json
from urllib.parse import urlsplit

from ..config import PUBLIC_URL
from .broker import topic, username

KEY_PLACEHOLDER = "<API_KEY>"   # the full key is only known right after create/rotate


EXAMPLE_TIME = "2026-10-01T08:00:00+07:00"


def payload(device: dict) -> dict:
    """The template every reading follows: nama + waktu + data. Only the
    values in `data` are the sender's own; the fields are an example."""
    return {"nama": "cuaca", "waktu": EXAMPLE_TIME,
            "data": {"suhu": 29.4, "kelembapan": 71, "baterai": {"volt": 3.9}}}


def build(device: dict, key: str | None = None) -> dict:
    key = key or KEY_PLACEHOLDER
    url = f"{PUBLIC_URL}/api/ingest"
    host = urlsplit(PUBLIC_URL).hostname
    example = payload(device)
    # snippets fill "waktu" with the clock at send time
    data_json = json.dumps(example["data"], ensure_ascii=False)
    user, top = username(device["id"]), topic(device["id"])
    return {
        "url": url,
        "headers": {"X-API-Key": key, "Content-Type": "application/json"},
        "mqtt": {"url": f"wss://{host}/api/mqtt", "username": user, "password": key, "topic": top, "qos": 1},
        "payload": example,
        "rules": [
            'Bentuk wajib: {"nama": "...", "waktu": "...", "data": {...}}; isi "data" bebas',
            '"nama" = nama tabel data. Satu API key boleh banyak nama; data beda jenis beri nama beda (mis. "cuaca", "kualitas_udara")',
            'Nama dibandingkan tanpa beda huruf besar/kecil dan spasi: "Cuaca Luar" = "cuaca_luar". Maksimal 10 nama per perangkat',
            "Nama sama dengan field baru = versi baru tabel itu (riwayat sebelum dan sesudah upgrade tetap terlihat); field yang kadang kosong tidak membuat versi baru",
            '"waktu" = waktu ukur dari sensor, ISO 8601 (tanpa zona = WIB) atau detik Unix',
            'Masa transisi: kiriman tanpa "nama"/"waktu" masih disimpan (tabel "default", waktu diterima) dengan peringatan',
            "Kiriman yang sama persis dengan \"waktu\" yang sama (atau dalam 1 detik bila tanpa waktu) dianggap kiriman ulang: diterima, tidak disimpan dua kali",
            "Isi data bebas: angka, teks, true/false, list; objek bersarang menjadi 'baterai.volt'",
            "Maksimal 16 KB, 100 field, 1 kiriman per detik per perangkat",
            "Uji dulu tanpa menyimpan: tambahkan ?dry_run=true pada URL HTTP",
            "Jangan taruh key di kode yang dibagikan publik; ganti key bila bocor",
        ],
        "snippets": {
            "curl": (f"curl -sS -X POST '{url}' \\\n  -H 'X-API-Key: {key}' -H 'Content-Type: application/json' \\\n"
                     f"  -d '{{\"nama\": \"cuaca\", \"waktu\": \"'\"$(date -Iseconds)\"'\", \"data\": {data_json}}}'"),
            "python": f'''import json, urllib.request
from datetime import datetime, timezone

kiriman = {{"nama": "cuaca", "waktu": datetime.now(timezone.utc).isoformat(), "data": {data_json}}}
req = urllib.request.Request(
    "{url}",
    data=json.dumps(kiriman).encode(),
    headers={{"X-API-Key": "{key}", "Content-Type": "application/json",
             "User-Agent": "sensor/1.0"}},  # User-Agent bawaan Python diblokir firewall
)
print(urllib.request.urlopen(req, timeout=10).read().decode())''',
            "python_mqtt": f'''# pip install paho-mqtt
import json, paho.mqtt.client as mqtt
from datetime import datetime, timezone

c = mqtt.Client(mqtt.CallbackAPIVersion.VERSION2, transport="websockets")
c.ws_set_options(path="/api/mqtt", headers={{"X-API-Key": "{key}"}})
c.tls_set()
c.username_pw_set("{user}", "{key}")
c.connect("{host}", 443, keepalive=60)
c.loop_start()
kiriman = {{"nama": "cuaca", "waktu": datetime.now(timezone.utc).isoformat(), "data": {data_json}}}
c.publish("{top}", json.dumps(kiriman), qos=1).wait_for_publish()''',
            "esp32_arduino": f'''#include <WiFi.h>
#include <WiFiClientSecure.h>
#include <HTTPClient.h>
#include <time.h>

// sekali di setup(), setelah WiFi tersambung: configTime(7 * 3600, 0, "pool.ntp.org");
void kirim(float suhu, float kelembapan) {{
  char waktu[32];
  time_t now = time(nullptr);
  strftime(waktu, sizeof waktu, "%Y-%m-%dT%H:%M:%S+07:00", localtime(&now));
  WiFiClientSecure tls;
  tls.setInsecure();  // untuk produksi: tls.setCACert(<sertifikat root>)
  HTTPClient http;
  http.begin(tls, "{url}");
  http.addHeader("X-API-Key", "{key}");
  http.addHeader("Content-Type", "application/json");
  String body = String("{{\\"nama\\":\\"cuaca\\",\\"waktu\\":\\"") + waktu
    + "\\",\\"data\\":{{\\"suhu\\":" + suhu + ",\\"kelembapan\\":" + kelembapan + "}}}}";
  int code = http.POST(body);   // 202 = diterima
  Serial.println(code);
  http.end();
}}''',
        },
    }
