# Panduan API

Versi **0.6.0**. Ringkasan per bagian dan pembagian issue ada di [kontrak API](../API_CONTRACT.md); dokumen ini menjelaskan konvensi, alur pemakaian, dan contoh. Semua bentuk di bawah dibuat dari kode yang sama:

| Berkas | Untuk |
|---|---|
| [openapi.json](openapi.json) | Kontrak mesin (OpenAPI 3.1); sumber kebenaran |
| [IOT.md](IOT.md) | Akun, perangkat IoT, kirim data sensor, dashboard, komunitas |
| [FRONTEND.md](FRONTEND.md) | Struktur halaman: mode publik vs mode login per bidang |
| [`frontend/src/lib/api/generated.ts`](../../frontend/src/lib/api/generated.ts) | Tipe TypeScript frontend, hasil generate dari `openapi.json` |
| [VIZ.md](VIZ.md) | Bentuk komponen `viz` yang dikirim agen Jev |
| [Infra.md](Infra.md) | Layanan, konfigurasi, dan keamanan |
| Dokumen ini | Konvensi, alur pemakaian, dan contoh |

Dokumentasi interaktif (coba langsung dari browser): `http://localhost:8000/docs`.

## Konvensi

- **Base URL**: `http://localhost:8000/api` saat pengembangan. Di browser, frontend memanggil `/api` di origin-nya sendiri lewat proxy (lihat [integrasi](../integration/README.md)), sehingga alamat API tidak perlu diketahui kode frontend. Semua path di bawah relatif terhadap ini.
- **Autentikasi**: setiap request `/api/*` membawa header **`X-API-Key: <kunci aplikasi>`** yang diterbitkan backend (wajib di produksi, `REQUIRE_API_KEY=1`). Pengecualian: `/api/health` (tanpa kunci) dan `/api/ingest` (memakai API key **perangkat**). Endpoint `/me/*` juga butuh `Authorization: Bearer <token>` dari login.
- **Format**: JSON. Waktu dalam ISO 8601 UTC (`2026-09-29T05:58:53Z`); tanggal periode `YYYY-MM-DD`.
- **Koordinat**: GeoJSON, urutan **`[lon, lat]`**, EPSG:4326.
- **Skor dan `normalised`**: 0-100 dengan arah disamakan, **100 = paling perlu perhatian**. Untuk metrik `high_good` (mis. potensi PLTS), 100 berarti paling sedikit.
- **Kejujuran data**, wajib ditampilkan di UI:
  - `is_modelled: true` → estimasi model, beri label **MODEL**.
  - `confidence` 1-5, `source_id`, `period` ada di setiap nilai indikator.
  - Gempa adalah kejadian tercatat, **bukan prediksi**.
- **Nilai kosong**: `null` berarti belum ada data, bukan nol.
- **Error**: selalu `{"detail": "pesan"}` dengan status HTTP yang sesuai. Error validasi parameter (422) berisi `detail` berupa daftar.

| Status | Arti |
|---|---|
| 400 | Parameter tidak valid (mis. bbox terbalik, metrik tidak dikenal di `/score`) |
| 404 | Wilayah atau metrik tidak ditemukan |
| 401 | Tanpa `X-API-Key` aplikasi yang valid (atau sudah dicabut), `/me/*` tanpa token Bearer valid, `/ingest` dengan key perangkat salah |
| 403 | `/moderation/*` bukan admin |
| 409 | Email sudah terdaftar |
| 422 | Parameter gagal validasi tipe atau rentang |
| 429 | `/agent/chat` melebihi 10 permintaan/menit untuk akun ini (atau IP ini untuk tamu), atau 60/menit untuk semua pengguna digabung. `detail` menyebut yang mana; lihat header `Retry-After` (detik) |
| 503 | Data belum tersedia (mis. `/windgrid` sebelum ingest angin berhasil) |

- **CORS**: diatur server lewat `CORS_ORIGINS`. Minta domain frontend Anda (mis. `http://localhost:5174` untuk dev) ditambahkan bila browser menolak request.

## Endpoint

### Katalog

| Method & path | Parameter | Respons |
|---|---|---|
| `GET /health` | – | `HealthReport`: status DB, jumlah data, status & kesegaran tiap sumber |
| `GET /metrics` | `aspect?` = `urban`\|`lingkungan`\|`energi` | `MetricDef[]`: daftar metrik untuk membangun layer |
| `GET /sources` | – | `SourceInfo[]`: sumber, lisensi, `last_ok_at`, `last_error` |
| `GET /levels` | – | `LevelInfo[]`: level wilayah dan jumlahnya |

### Semua data (tabel, dashboard, Agent)

Mulai dari `GET /catalog`: ia mendaftar setiap data di database dan endpoint yang menyajikannya, jadi pilihan tabel atau dashboard bisa dibangun tanpa daftar yang ditulis tangan.

| Method & path | Parameter | Respons |
|---|---|---|
| `GET /catalog` | – | `Catalog`: `indicators` (tiap metrik: label, satuan, jumlah provinsi dan kab/kota yang punya datanya, jumlah periode, `internal` bila bukan layer peta), `observations` (tiap lapisan titik: sumber, jumlah, rentang waktu), `datasets` (dataset lain beserta endpoint-nya) |
| `GET /indicators` | `level?` (`provinsi` default \| `kabkota`), `parent?` (id provinsi), `metrics?` (dipisah koma; kosong = semua yang ada datanya), `q?` (cari nama), `sort?` (`name` atau nama metrik), `order?` (`asc`\|`desc`), `limit?` (≤1000, default 100), `offset?`, `format?` (`json`\|`csv`) | `IndicatorTable`: satu baris per wilayah dengan nilai terbaru tiap metrik sebagai kolom datar, `columns` untuk label/satuan, `total` untuk paginasi. `format=csv` mengunduh tabel yang sama |
| `GET /indicators/history` | `region_id` (satu atau beberapa dipisah koma, maks. 20), `metrics?`, `since?`, `until?` (tanggal) | `IndicatorHistory`: satu seri per wilayah dan metrik, titik per periode dari yang terlama; untuk grafik garis |
| `GET /observations` | `metric` (mis. `power_plant`, `transit_stop`, `hotspot`, `quake`, `disaster`), `source_id?`, `since?`, `until?`, `region_id?`, `bbox?` (`minlon,minlat,maxlon,maxlat`), `min_value?`, `limit?` (≤5000, default 1000) | `ObservationCollection`: GeoJSON titik terbaru dulu; `properties.attrs` berisi atribut asli sumbernya (mis. nama dan bahan bakar pembangkit). `count == limit` berarti masih ada titik lain |

Metrik `humidity_mean`, `wind_max` dan `wind_direction` tersimpan tetapi bukan layer peta, jadi tidak ada di `/metrics` dan `/map`. Di keempat endpoint ini mereka tetap muncul dengan `internal: true`.

### Halaman publik

| Method & path | Respons |
|---|---|
| `GET /public/overview` | `PublicOverview`: ringkasan nasional untuk beranda (cache 5 menit) |
| `GET /fields` | `FieldInfo[]`: template tampilan per bidang (dipakai AI; bukan pilihan wajib user) |
| `GET /modes` | `ModeInfo[]`: mode profil (protected / responden / plan) untuk layar profil |

### Wilayah

| Method & path | Parameter | Respons |
|---|---|---|
| `GET /regions` | `q?` (min 2 huruf), `level?`, `parent_id?`, `limit?` (≤600) | `RegionRef[]`: untuk autocomplete dan dropdown; nama persis muncul pertama |
| `GET /regions/{region_id}` | – | `RegionSummary`: semua indikator satu wilayah |
| `GET /reports/{region_id}` | `days?` (1-365, default 30) | `RegionReport`: laporan satu panggilan (lihat di bawah) |

### Peta

| Method & path | Parameter | Respons |
|---|---|---|
| `GET /map/{metric}` | `level?` = `provinsi`\|`kabkota`, `simplify?` (0-0.5, default 0.01) | `MapLayer`: FeatureCollection poligon untuk choropleth |
| `GET /hotspots` | `days?` (1-30), `limit?`, `min_frp?`, `region_id?` | `HotspotCollection`: titik panas, semua satelit |
| `GET /quakes` | `days?` (1-365), `limit?`, `min_mag?`, `region_id?` | `QuakeCollection`: gempa BMKG + USGS + EMSC (duplikat dihapus, BMKG diutamakan); BMKG menambah `felt` dan `potensi` |
| `GET /disasters` | `days?`, `limit?`, `type?`, `min_alert?` (0-3), `region_id?` | `DisasterCollection`: bencana GDACS + EONET |
| `GET /warnings` | `region_id?` | `WarningCollection`: peringatan dini cuaca BMKG yang masih berlaku, poligon area (layer `areas`) |
| `GET /marine` | `lat`, `lon` | `MarineForecast`: 3 hari tinggi & periode gelombang, arah, suhu muka laut; 404 bila titik jauh dari laut |
| `GET /solar-forecast` | `lat`, `lon`, `kwp?` (default 1), `tilt?` (derajat, default 15), `azimuth?` (0 = selatan, -90 = timur, 90 = barat) | `SolarForecast`: perkiraan produksi PLTS atap per jam dan per hari (kWh), 2 hari |
| `GET /buildings` | `west`, `south`, `east`, `north` (wajib; maks 0,05° per sisi) | `BuildingCollection`: jejak bangunan; panggil saat zoom dekat |
| `GET /windgrid` | – | `WindGrid`: grid angin untuk animasi partikel (503 bila belum ada) |
| `GET /isochrone` | `lat`, `lon`, `minutes?` (1-60, default 15), `mode?` = `auto`\|`pedestrian`\|`bicycle` | `Isochrone`: poligon area terjangkau + `area_km2`; titik di luar Indonesia → 400, layanan routing gagal → 502 |

`region_id` pada titik memakai margin: gempa 1° (termasuk lepas pantai), bencana 0,5°, titik panas tepat di dalam batas wilayah.

### Analisis dan histori

| Method & path | Parameter / body | Respons |
|---|---|---|
| `POST /score` | `{"weights": {"fire_risk": 2, "pm25_mean": 1}}` | `ScoreResponse`: peringkat berbobot semua wilayah |
| `GET /history/events` | `metric` = `quake`\|`hotspot`\|`disaster`, `days?`, `bucket?` = `day`\|`week` | `EventHistory`: deret waktu untuk grafik |
| `GET /notifications?region_id=` | – | `Notifications`: gempa darurat, peringatan cuaca BMKG, bencana Orange/Red, wilayah kritis, sumber bermasalah. `region_id` (opsional) membatasi semuanya kecuali kesehatan sumber ke wilayah itu: gempa dalam 1°, bencana dalam 0,5°, indikator wilayah itu dan anak-anaknya, peringatan cuaca yang menyentuhnya. `fire_alerts`: kemungkinan kebakaran per kab/kota (48 jam), yaitu klaster titik panas FIRMS non-low yang terdeteksi minimal 2 lintasan, di luar sel panas statis (sel ~400 m yang panas berulang di 5+ hari dan 4+ bulan) dan di luar radius ~1 km pembangkit termal; `confirmed` bila ada kebakaran hutan GDACS dalam 0,5° |
| `GET /stats/classification` | – | `ClassificationStats`: distribusi kelas bangunan dan urgensi gempa |

### Agent (butuh `X-API-Key`)

| Method & path | Parameter / body | Respons |
|---|---|---|
| `POST /agent/chat` | `{"question": "...", "session_id": "…"?}` | `ChatResponse`: jawaban, komponen `viz`, sumber, token |
| `POST /agent/chat/stream` | sama | Server-Sent Events: `start`, `step`, `viz`, `token`, `reset`, `replace`, `done`, `error` (cara baca di [FRONTEND.md](FRONTEND.md)) |
| `GET /agent/sessions/{session_id}` | – | `SessionState`: riwayat, konteks, pemakaian token |
| `GET /agent/tools` | – | Kontrak tool dan skill Agent (JSON Schema) |

### Akun, perangkat IoT, dashboard, komunitas

Detail lengkap, contoh, dan kontrak widget: [IOT.md](IOT.md).

| Method & path | Auth | Respons |
|---|---|---|
| `POST /auth/signup`, `/auth/login` | – | `AuthOut` (`token` JWT) |
| `GET /me`, `PUT /me/profile` | Bearer | `MeOut` |
| `GET/POST /me/profiles`, `PUT/DELETE /me/profiles/{id}`, `POST /me/profiles/{id}/activate` | Bearer | `MeOut`; maks. 3 profil, masing-masing dengan mode |
| `POST/GET /me/devices`, `PATCH/DELETE /me/devices/{id}` | Bearer | `DeviceCreated` / `DeviceOut` |
| `POST /me/devices/{id}/key`, `/share`; `PUT /me/devices/{id}/layout` | Bearer | kunci baru / status komunitas / layout |
| `GET /me/devices/{id}/readings`, `GET /me/dashboard` | Bearer | `Readings` / `Dashboard` |
| `GET /me/devices/{id}/streams`, `PATCH …/streams/{sid}`, `POST …/streams/{sid}/merge`, `POST …/readings/delete` | Bearer | kelola data sensor ([IOT.md](IOT.md)) |
| `GET /me/alerts` | Bearer | `DeviceAlert[]`: status `alert` terakhir per alat dan `nama` (`aman`/`bahaya`, plus `category` bila dikirim), `bahaya` lebih dulu ([IOT.md](IOT.md#4-mengirim-data-sensor)) |
| `GET /me/test-device`, `POST /me/test-device`, `GET /me/devices/{id}/events` | Bearer | alat uji: `DeviceOut \| null` / `DeviceCreated` / `DeviceEvent[]`. Alat uji = alat biasa dengan `test_expires_at` (2 jam), tidak tampil di daftar alat, dashboard, komunitas, dan agen; terhapus otomatis bersama datanya. Hanya alat uji yang mencatat event |
| `POST /ingest` | `X-Device-Key` | `IngestOut` (202) |
| `GET /community/devices`, `/community/devices/{id}/readings` | – | perangkat komunitas yang disetujui |
| `GET/POST /moderation/community…` | Bearer admin | antrean dan keputusan moderasi |
| `POST /me/password` | Bearer | ganti password sendiri; mengembalikan token baru, sesi lain keluar |
| `GET /moderation/users`, `POST /moderation/users/{id}/reset-password` | Bearer admin | cari user; reset password ke password sementara |

### Kunci aplikasi (admin)

| Method & path | Respons |
|---|---|
| `POST /clients` `{name, note?}` | `ClientCreated`: kunci baru (`api_key` hanya sekali tampil) |
| `GET /clients` | `ClientOut[]`: daftar kunci, prefix, terakhir dipakai, status dicabut |
| `POST /clients/{id}/rotate` | Kunci baru; kunci lama berhenti ≤1 menit |
| `POST /clients/{id}/revoke` | Cabut kunci |

Butuh token admin. Kunci pertama (sebelum ada admin) dibuat di server: `docker compose exec api python -m app.clients create "frontend web"`.

### Admin (bukan untuk UI publik)

| Method & path | Fungsi |
|---|---|
| `POST /admin/refresh?with_regions=false` | Jalankan ingest sekarang |
| `POST /admin/refresh-buildings` | Mulai ulang prewarm bangunan |

## Alur pemakaian

**Halaman peta**
1. `GET /metrics` → bangun daftar layer (kelompokkan per `aspect`).
2. Saat layer dipilih: `GET /map/{metric}?level=provinsi`. Warnai dari `properties.normalised`, tampilkan `value` + `unit`, tandai `is_modelled`.
3. Layer titik: `/hotspots`, `/quakes`, `/disasters`. Bangunan hanya saat zoom dekat (`/buildings` dengan bbox layar).
4. Lonceng notifikasi: `GET /notifications` (hitung dari `count`).

**Halaman wilayah**
1. Cari: `GET /regions?q=riau`.
2. Satu panggilan untuk seluruh halaman: `GET /reports/{region_id}`.
   - `region.indicators`: kartu indikator.
   - `events.{quake,hotspot,disaster}`: `count` dan `max_value` (magnitudo terbesar / FRP tertinggi).
   - `disasters`: daftar bencana di wilayah ini.
   - `alerts`: indikator di atas ambang perhatian (normalised > 80).
   - `sources[].stale: true` → tampilkan peringatan "data belum diperbarui".
3. Grafik tren: `GET /history/events?metric=hotspot&days=90&bucket=week`.

**Chat Agent**
1. Kirim `POST /agent/chat` tanpa `session_id` untuk percakapan baru; simpan `session_id` dari respons dan kirim ulang di pesan berikutnya.
2. Tampilkan `answer` (Markdown).
3. Render tiap item `viz` sesuai `viz[].type`; bentuk lengkapnya di [VIZ.md](VIZ.md):

| `viz.type` | Komponen yang disarankan |
|---|---|
| `ranking` | Bar chart / tabel peringkat |
| `region_card` | Kartu indikator wilayah |
| `event_map` | Peta titik (`geojson`) + ringkasan |
| `alerts` | Daftar peringatan |

4. `fallback` bukan `null` → jawaban dibuat dari template (LLM gagal, kuota habis, atau angka ditolak). Tetap valid; boleh diberi tanda kecil.
5. `tokens.input + tokens.output ≥ tokens.budget` → sesi berikutnya hanya menjawab dari template; tawarkan "mulai percakapan baru".
6. Tangani 429: tunggu `Retry-After` detik. Tangani 401: kunci salah atau belum dikirim.
7. Jangan taruh kunci di kode frontend publik untuk produksi; panggil `/agent/chat` lewat server Anda sendiri (mis. route API Next.js) yang menyimpan kuncinya.

## Contoh

```bash
# cari wilayah
curl "localhost:8000/api/regions?q=kalimantan&level=provinsi"

# laporan satu wilayah, 30 hari
curl "localhost:8000/api/reports/idn.central_kalimantan?days=30"

# gempa M≥5 di Sulawesi Tengah, 90 hari
curl "localhost:8000/api/quakes?days=90&min_mag=5&region_id=idn.central_sulawesi"

# area yang terjangkau 15 menit jalan kaki dari Tugu Yogyakarta
curl "localhost:8000/api/isochrone?lat=-7.7829&lon=110.3671&minutes=15&mode=pedestrian"

# peringkat gabungan kebakaran + udara
curl -X POST localhost:8000/api/score -H 'content-type: application/json' \
  -d '{"weights": {"fire_risk": 2, "pm25_mean": 1}}'

# chat, lalu pertanyaan lanjutan dalam sesi yang sama
curl -X POST localhost:8000/api/agent/chat -H 'content-type: application/json' -H 'X-API-Key: <kunci>' \
  -d '{"question": "kondisi Riau"}'
curl -X POST localhost:8000/api/agent/chat -H 'content-type: application/json' -H 'X-API-Key: <kunci>' \
  -d '{"question": "bagaimana titik panasnya di sana?", "session_id": "<dari respons sebelumnya>"}'
```

Cuplikan respons `GET /reports/idn.central_kalimantan`:

```json
{
  "generated_at": "2026-09-29T05:58:53Z",
  "days": 30,
  "region": {"id": "idn.central_kalimantan", "name": "Kalimantan Tengah", "level": "provinsi",
             "population": 2740000, "indicators": [{"metric": "fire_risk", "value": 74.5,
             "unit": "indeks 0-100", "normalised": 74.5, "is_modelled": true, "…": "…"}]},
  "events": {"quake": {"count": 0, "max_value": null},
             "hotspot": {"count": 47708, "max_value": 792.28},
             "disaster": {"count": 23, "max_value": null}},
  "disasters": [{"type": "wildfire", "name": "Wildfire in Indonesia 1032349",
                 "source_id": "nasa_eonet", "value": 6135.0, "magnitude_unit": "hectare", "…": "…"}],
  "alerts": [{"metric": "hotspot_count_7d", "label": "Titik panas 7 hari", "value": 13562.0, "normalised": 100.0, "…": "…"}],
  "sources": [{"id": "firms_viirs", "cadence": "harian", "last_ok_at": "2026-09-29T01:40:21Z", "stale": false, "…": "…"}]
}
```

## Memperbarui kontrak

Setelah mengubah endpoint atau model di `backend/app/api/schemas.py`, dari `frontend/`:

```bash
npm run api:generate   # menulis docs/backend/openapi.json dan src/lib/api/generated.ts
npm run api:check      # dijalankan CI: gagal bila keduanya tidak sesuai kode
```

Perbarui juga bagian terkait di [kontrak API](../API_CONTRACT.md).

Menambah field ke respons tidak merusak klien. Mengganti nama, menghapus field, atau mengubah tipe adalah perubahan yang merusak: naikkan versi di `backend/app/main.py` dan beri tahu tim frontend.
