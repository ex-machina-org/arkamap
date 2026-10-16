# Akun, Perangkat IoT, dan Dashboard

Untuk: tim frontend dan pembuat sensor. Tipe lengkap ada di [openapi.json](openapi.json) dan [`frontend/src/lib/api/generated.ts`](../../frontend/src/lib/api/generated.ts) (tag **users & iot**); konvensi umum (base URL, error, koordinat) ada di [API.md](API.md).

## Alur

```
daftar/masuk ─► isi profil ("saya siapa", wilayah) ─► AI pilih data kita yang relevan
ambil API key (satu klik; nama/kategori/lokasi opsional) ─► key + contoh kode (sekali tampil)
sensor kirim JSON (HTTP / MQTT / MQTT-wss) ─► server kelompokkan per bentuk data, buang kiriman ulang
AI beri kategori tetap per field ─► halaman kelola data: satu tabel per kelompok
buka dashboard ─► AI menata field baru jadi widget ─► frontend render per `widget`
(opsional) ajukan ke komunitas ─► admin setujui ─► tampil publik
```

## 1. Akun

| Method & path | Body | Respons |
|---|---|---|
| `POST /auth/signup` | `{email, password (≥8), name}` | `AuthOut`: `{token, user}` (201; 409 email sudah ada) |
| `POST /auth/login` | `{email, password}` | `AuthOut` (401 salah) |
| `GET /me` | – | `MeOut`: `{user, profile, profiles, max_profiles}`; `profile` = profil aktif, `null` = belum punya profil |
| `POST /me/password` | `{old_password, new_password (≥8)}` | `AuthOut` berisi **token baru**; semua sesi lain otomatis keluar (400 = password lama salah) |
| `POST /moderation/users/{id}/reset-password` (admin) | – | `{temporary_password}` sekali tampil; semua sesi user itu keluar |
| `GET /moderation/users?q=` (admin) | – | Cari user berdasarkan email/nama untuk mendapatkan `id` |

- Semua endpoint `/me/*` dan `/moderation/*` butuh header **`Authorization: Bearer <token>`**.
- Token berlaku 7 hari, dan langsung tidak berlaku bila password diganti atau di-reset. Setelah 401, arahkan user ke halaman masuk.
- **Lupa password:** belum ada reset lewat email. User menghubungi admin; admin me-reset dan memberikan password sementara; user masuk lalu menggantinya di halaman profil (`POST /me/password`).
- Signup dan login dibatasi 10 percobaan per 5 menit per IP (429).
- Admin: email yang tercantum di `ADMIN_EMAILS` server otomatis menjadi admin saat mendaftar.

## 2. Profil dan mode: "saya siapa"

Satu user punya **hingga 3 profil**, dengan mode yang sama maupun berbeda. Satu profil aktif pada satu waktu dan menentukan isi dashboard.

**Mode** adalah sudut pandang waktu (`GET /modes`):

| Mode | Untuk | Isi dashboard |
|---|---|---|
| `protected` | Tim yang turun ke lapangan saat kejadian (Basarnas, BPBD, damkar) | Panel **dampak**: gempa M5+ (atau berstatus darurat/siaga tsunami) 3 hari terakhir beserta kab/kota dalam radius terasa dan jumlah penduduknya, laporan "dirasakan" BMKG, dan peringatan cuaca aktif beserta kab/kota yang tercakup. Kejadian 2-14 hari. |
| `responden` | Yang mencegah sebelum terjadi | Tingkat risiko, prakiraan 1-3 hari, peringkat wilayah yang perlu perhatian. Kejadian 7-90 hari. |
| `plan` | Perencanaan ke depan | Prakiraan hujan 30 hari, kerawanan jangka panjang, panel **riwayat** kejadian per bulan setahun terakhir. |

Bidang (pemadam, pertanian, kesehatan, ...) tetap dipilih AI dari penjelasan user; mode mengatur rentang waktu, panel, dan urutan metrik. `view.mode.panels` memberi urutan panel yang disarankan.

| Method & path | Body | Respons |
|---|---|---|
| `GET /me/profiles` | – | `MeOut` |
| `POST /me/profiles` | `{role, goals?, region_id?, mode?}` | `MeOut` (201); profil baru langsung aktif; 409 bila sudah 3 |
| `PUT /me/profiles/{id}` | sama | `MeOut`; AI membaca ulang penjelasannya |
| `POST /me/profiles/{id}/activate` | – | `MeOut`; **tanpa AI dan tanpa pertanyaan**, data profil itu dipakai apa adanya |
| `DELETE /me/profiles/{id}` | – | `MeOut`; bila yang dihapus aktif, profil tertua yang tersisa menjadi aktif |
| `PUT /me/profile` | sama | Mengubah profil aktif (membuat yang pertama bila belum ada) |

```json
{"role": "anggota Basarnas Kantor SAR Palu",
 "goals": "gempa dan tsunami, lokasi korban",
 "region_id": "idn2.palu",
 "mode": "protected"}
```

- `role` dan `goals` **teks bebas**; user tidak memilih bidang dari daftar. `region_id` opsional, dari `GET /regions?q=...`.
- `mode` opsional. Kosong = AI memilih dari penjelasan (`mode_by: "ai"`, atau `"rule"` tanpa AI); diisi = pilihan user (`mode_by: "user"`).
- AI membaca penjelasan itu dan mengisi:
  - `field` dan `field_label`: tampilan terdekat.
  - `fit`: `cocok` / `sebagian` / `tidak_cocok`.
  - `metrics`: metrik kita yang relevan untuk bidang **dan mode** itu, beserta alasan.
  - `unsupported`: kebutuhan yang belum ada datanya.
  - `ai_message`: penjelasan jujur untuk user.
- Tanpa AI, kata kunci dipakai sebagai cadangan (`metrics_by: "rule"`, `fit: null`).
- Radius terasa gempa di panel dampak diperkirakan dari magnitudo (`10^(0,5 M − 0,6)` km, maks. 500 km), bukan peta guncangan resmi; `population` adalah penduduk kab/kota yang tercakup, bukan jumlah korban.
- Riwayat mode `plan` hanya mencakup data yang tersimpan; titik panas disimpan dalam rentang pendek, jadi riwayatnya lebih pendek dari setahun.
- Cara menampilkannya di frontend ada di [FRONTEND.md](FRONTEND.md).

## 3. Perangkat

| Method & path | Body | Respons |
|---|---|---|
| `POST /me/devices` | `{name?, category?, location?: {lat, lon}}`; boleh `{}` | `DeviceCreated`: `{device, api_key, quickstart}` |
| `GET /me/devices` | – | `DeviceOut[]` |
| `PATCH /me/devices/{id}` | `{name?, category?, location?}` | `DeviceOut` |
| `DELETE /me/devices/{id}` | – | 204; perangkat dan semua datanya dihapus |
| `POST /me/devices/{id}/key` | – | `{api_key, key_prefix, quickstart}`; key lama langsung tidak berlaku |
| `GET /me/devices/{id}/quickstart` | – | `Quickstart`: contoh siap tempel, dengan `<API_KEY>` di tempat key |
| `GET /me/devices/{id}/readings` | `?stream=&version=&field=&hours=24&limit=500&before=` | `Readings`, terbaru dulu; `next_before` untuk halaman berikutnya. `version` = `Stream.versions[].id`; `field` = key widget `<nama>/<field>` |
| `POST /me/devices/{id}/readings/delete` | `{ids?, stream_id?, since?, until?}` (minimal satu) | `{deleted}`; tidak bisa dibatalkan |
| `GET /me/devices/{id}/streams` | – | `Stream[]`: satu tabel per `nama`, dengan kolom (field), kategori, dan `versions` |
| `PATCH /me/devices/{id}/streams/{sid}` | `{name?, category?}` | `Stream[]` |
| `POST /me/devices/{id}/streams/{sid}/merge` | `{into}` | `Stream[]`; tabel `sid` dilebur ke `into`; nama `sid` menjadi alias, jadi pengirimnya tetap masuk ke `into` |

- **`api_key` hanya dikembalikan sekali**, saat dibuat atau dirotasi. Tampilkan dengan tombol salin dan peringatan "simpan sekarang". Setelah itu frontend hanya punya `key_prefix`.
- **Lokasi**: frontend menyediakan dua pilihan yang menghasilkan `{lat, lon}` yang sama:
  - "Lokasi saat ini": `navigator.geolocation.getCurrentPosition` di browser.
  - "Pilih di peta": klik pada peta.

  Lokasi bisa diganti kapan saja lewat `PATCH`. Server memetakan titik ke kabupaten/kota (`region_id`, `region_name`); titik di luar Indonesia → 400.
- **Kesehatan kiriman** di `DeviceOut`: `dup_count` (kiriman ulang yang diabaikan), `rejected_count`, `last_error` dan `last_error_at` (alasan penolakan terakhir), `warning_count`, `last_warning` dan `last_warning_at` (kiriman diterima tetapi tanpa `nama`/`waktu`). Tampilkan `last_error` dan `last_warning` di halaman perangkat supaya pemilik tahu kenapa data tidak masuk atau belum rapi; ini satu-satunya umpan balik untuk MQTT.

### Halaman kelola data

**Tabel per `nama` (stream).** Setiap kiriman membawa `nama`; nama itu menentukan tabelnya. Satu key boleh mengirim banyak nama (mis. `cuaca` dan `kualitas_air`), masing-masing jadi tabel sendiri, maksimal 10 nama per perangkat. Wajarnya satu key cukup satu nama; nama lain biasanya salah ketik dan bisa digabung di halaman perangkat:
- nama dibandingkan setelah dinormalkan (`Stream.slug`): huruf kecil, selain huruf/angka/`.`/`-` menjadi `_`. `"Cuaca Luar"` = `"cuaca_luar"`;
- nama sama dan field sama, atau sebagian field (mis. GPS kadang tidak terkirim) → versi tabel yang sama;
- nama sama tetapi membawa field yang belum pernah ada → **versi baru** tabel itu (`Stream.versions`, dengan `added` = field yang ditambahkan). Riwayat sebelum dan sesudah upgrade alat tetap terpisah per versi dan bisa digabung;
- nama berbeda → tabel berbeda, walaupun field-nya sama. Field didaftarkan per tabel (`<slug>/<field>`, mis. `cuaca/suhu`), jadi `suhu` di dua tabel tidak tercampur.

Render **satu tabel per `nama`**: kolom dari `fields` (gabungan semua versi), baris dari `GET …/readings?stream={id}`; pilihan versi memakai `&version={versions[].id}` dengan kolom `versions[].keys`. Widget dashboard dikelompokkan per tabel (`group` = nama tabel). Mengganti nama tampilan (`PATCH …/streams/{sid}`) tidak mengubah `slug`, jadi sensor tetap mengirim dengan nama lamanya. Dua tabel bisa **digabung**; nama tabel yang digabung tetap diterima sebagai alias.

**Masa transisi.** Selama `IOT_STRICT_PAYLOAD=0` (bawaan), kiriman tanpa `nama` masuk ke tabel `default` dan tanpa `waktu` memakai waktu diterima; keduanya tetap disimpan, dengan `warnings` di respons dan `last_warning` di perangkat. Dengan `IOT_STRICT_PAYLOAD=1` keduanya ditolak 400. Data sebelum aturan ini menjadi versi 1 tabelnya; kelompok lama tanpa nama menjadi `default`.

**Kategori tetap per field**: `cuaca`, `kualitas_udara`, `air`, `tanah`, `energi`, `laut`, `kebencanaan`, `kesehatan`, `lokasi`, `perangkat` (baterai, sinyal, uptime), `lainnya`. Daftarnya tidak bisa bertambah dari luar, sehingga data semua user bisa dianalisis bersama. Kategori kelompok = kategori terbanyak di antara field-nya (`perangkat` dan `lokasi` tidak dihitung kecuali hanya itu isinya), kecuali user memilih sendiri.

| `category_by` | Arti | Tampilan |
|---|---|---|
| `rule` | Sementara, dari nama field (AI sedang tidak tersedia). AI menilai ulang otomatis tiap 30 menit | Tanda "belum dipastikan" |
| `ai` | Dipilih AI dari daftar tetap | Normal |
| `user` | Dikoreksi user; tidak pernah ditimpa AI | Normal |

`Stream.confirmed = false` bila masih ada field berstatus `rule`. Koreksi kategori field lewat `PUT /me/devices/{id}/layout` dengan `{"field": "...", "category": "air"}`. Untuk ML, ambil data dengan `category_by` `ai` atau `user` saja.

## 4. Mengirim data (sensor)

**Setelah mengambil key, user tidak perlu merakit request sendiri.** `quickstart` di respons `POST /me/devices` (dan rotasi key) sudah berisi URL, topik, key asli, contoh JSON yang valid, aturan singkat, dan kode siap tempel: `snippets.curl`, `snippets.python` (tanpa library tambahan), `snippets.python_mqtt`, `snippets.esp32_arduino`. Tampilkan sebagai tab dengan tombol salin di layar "simpan key sekarang". Setelah itu, `GET /me/devices/{id}/quickstart` mengembalikan isi yang sama dengan `<API_KEY>` sebagai pengganti key.

Alur untuk pemilik sensor:
1. Buat perangkat, lalu salin key dan contoh kode.
2. Uji tanpa menyimpan: `POST /ingest?dry_run=true`. Hasilnya menunjukkan key valid atau tidak, field apa saja yang terbaca (`keys`), dan berapa yang baru.
3. Pasang kode di sensor, lalu data mulai tampil di dashboard.

Mikrokontroler (ESP32/ESP8266) sebaiknya memakai HTTP. MQTT lewat WebSocket + TLS lebih cocok untuk Raspberry Pi atau laptop.

Template sama untuk semua protokol; tiga bagian wajib:

```json
{"nama": "sawah", "waktu": "2026-10-01T08:00:00+07:00",
 "data": {"suhu": 29.4, "kelembapan_tanah": 41, "tanah": {"nitrogen": 12}, "pompa_aktif": false}}
```

- **`nama` (wajib)**: nama tabel data. Data beda jenis beri nama beda; data yang sama selalu dengan nama yang sama.
- **`waktu` (wajib)**: waktu ukur dari sensor, ISO 8601 (tanpa zona dianggap WIB) atau detik/milidetik Unix. Waktu lebih dari 10 menit di masa depan ditolak, begitu juga waktu sebelum 2020 (tanda jam perangkat belum sinkron lewat NTP, mis. ESP32 yang mengirim 1970).
- **`data` (wajib, isinya bebas)**: nama field, jumlah, dan tipe apa saja. Objek bersarang diratakan (`tanah.nitrogen`).
- `kategori` (opsional) hanya petunjuk bila nama field tidak jelas; tanpa itu, `nama` dipakai sebagai petunjuk.
- `alert` (opsional): penilaian alat sendiri atas kiriman ini, `"aman"` atau `"bahaya"`, atau `{"status": "bahaya", "pesan": "Asap terdeteksi", "kategori": "kebakaran"}` (pesan maks. 200 karakter). `kategori` opsional: `kebakaran`, `cuaca`, `gempa`, `bencana`, atau `panas` menaruh alert di kategori itu (tetap berlabel Alat IoT); kosong atau `"none"` = alert alat umum, nilai lain ditolak. Hanya status terakhir per alat dan `nama` yang disimpan (`GET /me/alerts`) dan tampil sebagai kartu di halaman Pemantauan & Peringatan; hanya `bahaya` yang memunculkan notifikasi. Nilai lain ditolak 400. Respons ingest memuat `alert` bila dikirim.
- **Kiriman ulang**: `nama`, data, dan `waktu` yang sama (atau data sama dalam 1 detik bila tanpa `waktu`) dijawab 202 dengan `duplicate: true` dan tidak disimpan lagi. Jangan anggap itu error.
- Perangkat dikenali dari **API key**, bukan dari `nama`.
- Batas: 16 KB per pesan, 100 field, 1 kiriman per detik per perangkat.

**HTTP**

```bash
curl -X POST http://localhost:8000/api/ingest \
  -H "X-API-Key: dev_xxx" -H "Content-Type: application/json" \
  -d '{"nama":"sawah","waktu":"2026-10-01T08:00:00+07:00","data":{"suhu":29.4}}'
```

Respons 202 `{device_id, fields, new_fields, stream_id, nama, version, warnings, duplicate}`; dengan `?dry_run=true` ditambah `dry_run: true` dan `keys`, dan tidak ada yang disimpan. Error: 400 format, 401 key salah atau dicabut, 429 terlalu cepat.

**MQTT**: login dengan kredensial perangkat, lalu publish ke topiknya sendiri. Semua nilainya ada di respons `POST /me/devices`:

| Pengaturan | Nilai |
|---|---|
| Username | `mqtt_username`, mis. `dev42` |
| Password | `api_key` perangkat |
| Topik publish | `mqtt_topic`, mis. `ingest/dev42` (satu-satunya topik yang diizinkan) |
| QoS | 1 disarankan |
| Keepalive | **60 detik** (proxy di depan WebSocket biasanya memutus koneksi yang diam ±100 detik) |

| Jalur | Alamat | Kapan dipakai |
|---|---|---|
| TCP | `mqtt://localhost:1883` | Pengembangan lokal (`docker compose`) |
| WebSocket + TLS | `wss://<domain>/api/mqtt` (tambahkan header `X-API-Key: <api_key>` bila klien mendukung) | Deploy publik: proxy meneruskan `/api/mqtt` ke listener WebSocket broker (port 9001); port 1883 tidak dibuka ke internet |

```python
# paho-mqtt 2.x lewat WebSocket + TLS; DOMAIN = alamat deploy Anda
import json, paho.mqtt.client as mqtt
c = mqtt.Client(mqtt.CallbackAPIVersion.VERSION2, transport="websockets")
c.ws_set_options(path="/api/mqtt", headers={"X-API-Key": API_KEY})
c.tls_set()
c.username_pw_set("dev42", API_KEY)
c.connect(DOMAIN, 443, keepalive=60)
c.loop_start()
c.publish("ingest/dev42", json.dumps({"nama": "sawah", "waktu": "2026-10-01T08:00:00+07:00",
                                      "data": {"suhu": 29.4}}), qos=1).wait_for_publish()
```

Aturan broker:
- Koneksi tanpa kredensial, atau dengan password salah, ditolak saat CONNECT ("not authorised").
- Perangkat hanya boleh publish ke topiknya sendiri. Publish ke topik lain dan subscribe apa pun ditolak, jadi perangkat tidak bisa memalsukan data perangkat lain atau membaca data orang lain.
- Rotasi key (`POST /me/devices/{id}/key`) langsung mengganti password MQTT; menghapus perangkat menghapus login MQTT-nya.

Pesan dengan format salah tidak dibalas lewat MQTT. Uji payload lewat HTTP dulu, lalu cek hasilnya di dashboard.

## 5. Dashboard

`GET /me/dashboard?hours=24` → `Dashboard`

```jsonc
{
  "profile_needed": false,          // true → arahkan ke form profil dulu
  "ours": {                         // data kita yang relevan dengan profil
    "role": "petani padi di Klaten", "metrics_by": "ai",
    "region": {"id": "idn2.klaten", "name": "Klaten",
               "indicators": [{"metric": "dry_days", "value": 2.0, "unit": "hari",
                               "is_modelled": false, "reason": "…", "…": "…"}],
               "missing": []}
  },
  "devices": [{
    "device": {"id": 1, "name": "Sensor Sawah 1", "layout_by": "ai", "…": "…"},
    "widgets": [
      {"field": "suhu", "label": "Suhu Udara", "unit": "°C", "semantic": "suhu_udara",
       "widget": "line", "group": "Udara", "compare_metric": "temp_max_mean",
       "latest": 31.2, "latest_at": "…", "series": [{"t": "…", "v": 29.4}],
       "compare": {"metric": "temp_max_mean", "value": 36.0, "unit": "°C", "region_name": "Klaten", "…": "…"}}
    ]
  }]
}
```

**Komponen yang disediakan frontend**, satu per nilai `widget`:

| `widget` | Isi | Data yang dipakai |
|---|---|---|
| `line` | Grafik garis deret waktu | `series`, `latest`, `unit` |
| `gauge` | Meteran | `latest`, `unit` (rentang wajar ditentukan komponen) |
| `stat` | Angka besar | `latest`, `unit` |
| `bar` | Batang | `series` |
| `status` | Indikator on/off atau teks status | `latest` |
| `map` | Titik di peta | `latest` = latitude, `pair_latest` = longitude (field `pair_field`); tanpa pasangan, pakai lokasi perangkat |
| `table` | Nilai apa adanya (teks, array) | `latest` |

Aturan tampilan:
- Kelompokkan widget per `group`.
- Bila ada `compare`, tampilkan "sensor Anda vs wilayah" (mis. PM2.5 38,5 vs 55,0 µg/m³ di Klaten); tandai MODEL bila `compare.is_modelled`.
- Field `hidden: true` (id, rssi, versi firmware) tidak dikirim di dashboard.
- **AI hanya menentukan tampilan** (label, satuan, widget, pembanding). Semua angka berasal dari database.
- **AI menata sekali per field baru, di latar belakang saat data pertama masuk.** Dashboard tidak pernah menunggu AI. Sebelum AI selesai (biasanya beberapa detik), field baru tampil dengan widget sementara berbasis tipe data dan `device.layout_by` masih `null`/`rule`. Setelah itu `layout_by: "ai"`, dan hasilnya disimpan serta dipakai ulang. Field lama dan koreksi user tidak berubah.
- **Pembanding wilayah (`compare`) hanya bila besaran dan satuannya sama**, mis. PM2.5 sensor vs PM2.5 wilayah (µg/m³), suhu udara vs suhu wilayah (°C). Total periode (hujan 30 hari, jumlah titik panas) dan indeks 0-100 tidak pernah dijadikan pembanding.
- Array ditampilkan sebagai `table`. Field teknis (`device_id`, `rssi`, `fw`, …) disembunyikan.

### Contoh data sensor dan tampilan yang dipilih AI

Hasil nyata dari uji; `data` bisa berisi apa saja.

| Perangkat | `data` yang dikirim | Tampilan hasil AI |
|---|---|---|
| Kualitas air sungai | `{"ph": 7.2, "do_mgL": 5.8, "tds": 312, "turbidity_ntu": 14.5, "suhu_air": 27.9, "level_air_cm": 143}` | pH (gauge), Oksigen Terlarut mg/L, TDS, Kekeruhan NTU, Suhu Air, Tinggi Muka Air (line), grup "Air" |
| Stasiun cuaca | `{"temperature": 30.4, "humidity": 74, "rain_mm": 2.4, "wind": {"speed_kmh": 12.1, "dir_deg": 225}, "pm25": 35}` | Suhu Udara (vs suhu wilayah), PM2.5 (vs PM2.5 wilayah), Kecepatan Angin (vs angin wilayah), Kelembapan (gauge), Curah Hujan (bar), Arah Angin (stat) |
| Kebun | `{"soil": {"moisture_pct": 38, "temp_c": 26.1, "npk": {"n": 42, "p": 18, "k": 55}}, "pompa": true, "mode": "otomatis"}` | Kelembapan Tanah (gauge), Suhu Tanah, N/P/K mg/kg (stat), Status Pompa & Mode (status) |
| Meter PLTS | `{"pv_power_w": 1840, "energy_today_kwh": 7.6, "battery_soc": 81, "inverter_status": "normal"}` | Daya PV W (line), Energi Hari Ini kWh (stat), Baterai % (gauge), Status Inverter (status) |
| Pelacak kendaraan | `{"lat": -6.914, "lon": 107.609, "speed_kmh": 42, "sirene": false}` | **satu** peta "Lokasi" (lat + lon), Kecepatan (gauge), Sirene (status) |
| Node serbaguna | `{"device_id": "ESP32-A1", "rssi": -67, "samples": [21.1, 21.4], "alarm": "asap terdeteksi", "count_orang": 12}` | Status Alarm, Jumlah Orang (stat), Sampel (table); `device_id`/`rssi` disembunyikan |

**Koreksi tata letak oleh user**: `PUT /me/devices/{id}/layout`

```json
[{"field": "ph", "label": "pH Tanah", "widget": "gauge"}, {"field": "suhu", "hidden": true}]
```

## 6. Komunitas

| Method & path | Siapa | Fungsi |
|---|---|---|
| `POST /me/devices/{id}/share` `{share: true}` | pemilik | Ajukan ke komunitas → `community_status: "pending"`. Butuh lokasi. `{share: false}` = kembali privat |
| `GET /community/devices?category=&region_id=` | publik | Perangkat yang **disetujui**: lokasi, layout, nilai terakhir per field |
| `GET /community/devices/{id}/readings` | publik | Riwayat perangkat komunitas |
| `GET /moderation/community?status=pending` | admin | Antrean peninjauan: pemilik, jumlah data, nilai terakhir |
| `POST /moderation/community/{id}` `{approve, note?}` | admin | Setujui/tolak; `note` terlihat oleh pemilik di `community_note` |

Default semua perangkat **privat**. Data yang ditolak tetap bisa dilihat pemiliknya.
