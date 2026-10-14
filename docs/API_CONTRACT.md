# Kontrak API

Kontrak antara frontend (`frontend/`) dan backend (`backend/`) Arkamap untuk rilis `v0.1.0`. Dokumen ini membagi API per bagian. Setiap bagian punya pemilik di backend dan pengguna di frontend, sehingga keduanya bisa dikerjakan berdampingan.

Sumber kebenaran mesin adalah [`docs/backend/openapi.json`](backend/openapi.json) (OpenAPI 3.1). Tipe TypeScript frontend dibuat dari file itu (`npm run api:generate`), dan `npm run api:check` memastikan keduanya tidak menyimpang dari backend. Bila dokumen ini dan `openapi.json` berbeda, `openapi.json` yang dipakai. Setelah itu dokumen ini diperbaiki.

| Bagian | Backend | Frontend |
|---|---|---|
| [Konvensi](#konvensi) dan [Sistem](#sistem) | #26 | #45 |
| [Kunci aplikasi dan admin](#kunci-aplikasi-dan-admin) | #27 | #45 |
| [Akun dan profil](#akun-dan-profil) | #28 | #38 |
| [Data publik dan peta](#data-publik-dan-peta) | #29 | #39, #40 |
| [Analisis dan laporan](#analisis-dan-laporan) | #30 | #39, #40 |
| [Perangkat IoT](#perangkat-iot) | #31 | #42 |
| [Kirim data sensor](#kirim-data-sensor) dan [Tabel data dan pembacaan](#tabel-data-dan-pembacaan) | #32 | #42 |
| [Alat uji](#alat-uji) | #33 | #43 |
| [Dashboard pengguna](#dashboard-pengguna) | #34 | #41 |
| [Komunitas dan moderasi](#komunitas-dan-moderasi) | #35 | #39 |
| [Agen Jev](#agen-jev) | #36 | #44 |

## Konvensi

- **Base URL**: semua path diawali `/api`. Saat pengembangan: `http://localhost:8000/api`. Di browser, frontend memanggil `/api/*` lewat proxy di sisi server (Vite saat dev, fungsi `frontend/api/[...path].ts` saat hosted).
- **Format**: JSON. Waktu memakai ISO 8601 UTC, periode memakai `YYYY-MM-DD`, koordinat memakai GeoJSON `[lon, lat]` EPSG:4326.
- **Nilai kosong**: `null` berarti belum ada data, bukan nol. UI menampilkannya sebagai belum ada data.
- **Kejujuran data**: `is_modelled: true` ditampilkan dengan label **MODEL**. Setiap nilai indikator membawa `confidence` (1–5), `source_id`, dan `period`. Gempa adalah kejadian tercatat, bukan prediksi.
- **Skor**: 0–100 dengan arah yang disamakan, 100 = paling perlu perhatian.

### Autentikasi

Ada tiga lapis kunci. Kolom **Akses** di setiap tabel memakai singkatan berikut.

| Akses | Header | Keterangan |
|---|---|---|
| **Aplikasi** | `X-API-Key: <kunci aplikasi>` | Wajib di semua `/api/*` bila `REQUIRE_API_KEY=1`, kecuali `/api/health` dan `/api/ingest`. Proxy frontend yang menambahkannya. Kunci ini tidak pernah sampai ke browser atau variabel `VITE_` |
| **Pengguna** | `Authorization: Bearer <token>` | Token dari login atau daftar, disimpan frontend di `sessionStorage`. Wajib di `/api/me/*` |
| **Opsional** | Bearer bila ada | Tamu mendapat data publik saja; pengguna yang masuk mendapat data miliknya juga |
| **Admin** | Bearer milik akun admin | Akun selain admin → 403 |
| **Perangkat** | `X-API-Key: <API key perangkat>` | Hanya `/api/ingest`. Di MQTT, kunci yang sama dipakai sebagai password |

### Error

Bentuknya selalu `{"detail": "pesan"}`. Error validasi (422) berisi `detail` berupa daftar.

| Status | Kapan |
|---|---|
| 400 | Parameter atau isi tidak valid (bbox terbalik, payload sensor salah, gabung tabel dengan field berbeda) |
| 401 | Kunci aplikasi, token, atau API key perangkat tidak valid; `/api/me/*` tanpa token |
| 403 | Bukan admin |
| 404 | Wilayah, metrik, perangkat, atau tabel tidak ditemukan |
| 409 | Email sudah terdaftar; profil sudah penuh |
| 422 | Parameter gagal validasi tipe atau rentang |
| 429 | Batas laju terlampaui; lihat header `Retry-After` (detik) |
| 502 | Layanan luar gagal (routing, prakiraan) |
| 503 | Data belum tersedia, atau broker MQTT tidak bisa dihubungi |

### Batas laju

| Endpoint | Batas |
|---|---|
| `POST /api/auth/login`, `/api/auth/signup` | Dikunci 5 menit setelah terlalu banyak percobaan |
| `POST /api/agent/chat*` | 10/menit per akun (atau IP untuk tamu), 60/menit total |
| `POST /api/ingest` dan MQTT | 1 kiriman per detik per perangkat |

## Sistem

| Method dan path | Akses | Respons |
|---|---|---|
| `GET /api/health` | — | `HealthReport` |

## Kunci aplikasi dan admin

| Method dan path | Akses | Request | Respons |
|---|---|---|---|
| `GET /api/clients` | Admin | — | `ClientOut[]` |
| `POST /api/clients` | Admin | `ClientIn` | `ClientCreated` (201, kunci tampil sekali) |
| `POST /api/clients/{id}/rotate` | Admin | — | `ClientCreated` |
| `POST /api/clients/{id}/revoke` | Admin | — | `ClientOut` |
| `POST /api/admin/refresh?with_regions=` | Admin | — | ringkasan proses |
| `POST /api/admin/refresh-buildings` | Admin | — | ringkasan proses |

Catatan: semua endpoint di bagian ini menolak akun selain admin (403) dan permintaan tanpa token (401). `/api/admin/refresh` dan `/api/admin/refresh-buildings` hanya menjadwalkan proses lalu langsung menjawab; hasilnya terlihat di `GET /api/sources`.

## Akun dan profil

| Method dan path | Akses | Request | Respons |
|---|---|---|---|
| `POST /api/auth/signup` | Aplikasi | `Signup` | `AuthOut` (201) · 409, 429 |
| `POST /api/auth/login` | Aplikasi | `Login` | `AuthOut` · 401, 429 |
| `GET /api/me` | Pengguna | — | `MeOut` |
| `POST /api/me/password` | Pengguna | `PasswordChange` | `AuthOut` · 400 |
| `PUT /api/me/profile` | Pengguna | `ProfileIn` | `MeOut` |
| `GET /api/me/profiles` | Pengguna | — | `MeOut` |
| `POST /api/me/profiles` | Pengguna | `ProfileIn` | `MeOut` (201) · 409 |
| `PUT /api/me/profiles/{id}` | Pengguna | `ProfileIn` | `MeOut` |
| `DELETE /api/me/profiles/{id}` | Pengguna | — | `MeOut`; bila profil aktif yang dihapus, profil tertua menjadi aktif |
| `POST /api/me/profiles/{id}/activate` | Pengguna | — | `MeOut` |
| `GET /api/modes` | Aplikasi | — | `ModeInfo[]` |
| `GET /api/fields` | Aplikasi | — | `FieldInfo[]` |

Profil aktif menentukan bidang dan mode (lensa waktu) yang dipakai dashboard dan agen. Di `ProfileIn`, `role` adalah peran atau pekerjaan pengguna dan `goals` adalah masalah yang ingin diatasi (teks bebas, hingga 500 karakter); AI membaca keduanya untuk memilih bidang, mode, dan metrik.

## Data publik dan peta

Semua endpoint di bagian ini memakai akses **Aplikasi**.

| Method dan path | Query | Respons |
|---|---|---|
| `GET /api/catalog` | — | `Catalog` |
| `GET /api/levels` | — | `LevelInfo[]` |
| `GET /api/metrics` | `aspect` | `MetricDef[]` |
| `GET /api/sources` | — | `SourceInfo[]` (status terakhir, error terakhir) |
| `GET /api/public/overview` | — | `PublicOverview` |
| `GET /api/notifications` | `region_id` | `Notifications`: gempa darurat, peringatan cuaca BMKG, bencana Orange/Red, wilayah kritis, sumber bermasalah, dan `fire_alerts`. `region_id` membatasi semuanya kecuali kesehatan sumber ke wilayah itu |
| `GET /api/regions` | `q, level, parent_id, limit` | `RegionRef[]` |
| `GET /api/regions/{id}` | — | `RegionSummary` · 404 |
| `GET /api/map/{metric}` | `level, simplify` | `MapLayer` · 404 |
| `GET /api/hotspots` | `days, limit, min_frp, region_id` | `HotspotCollection` |
| `GET /api/quakes` | `days, limit, min_mag, region_id` | `QuakeCollection` |
| `GET /api/disasters` | `days, limit, type, min_alert, region_id` | `DisasterCollection` |
| `GET /api/warnings` | `region_id` | `WarningCollection` |
| `GET /api/observations` | `metric*, source_id, since, until, region_id, bbox, min_value, limit` | `ObservationCollection` · 404 |
| `GET /api/windgrid` | — | `WindGrid` · 503 sebelum ingest angin pertama |
| `GET /api/buildings` | `west*, south*, east*, north*` | `BuildingCollection` · 400 |
| `GET /api/marine` | `lat*, lon*` | `MarineForecast` · 404, 502 |
| `GET /api/solar-forecast` | `lat*, lon*, kwp, tilt, azimuth` | `SolarForecast` · 502 |

`*` = wajib.

Data diperbarui oleh penjadwal backend: refresh menyeluruh pukul 06:00 dan 18:00 WIB, BMKG (gempa dan peringatan) tiap 15 menit.

`fire_alerts` berisi kemungkinan kebakaran per kab/kota dalam 48 jam: klaster titik panas FIRMS yang terdeteksi minimal 2 lintasan satelit, di luar sel panas menetap (industri, suar gas, gunung api) dan di luar radius ~1 km pembangkit termal. `confirmed: true` bila GDACS melaporkan kebakaran hutan dalam 0,5°. Kemungkinan kebakaran belum dicek lapangan; UI menampilkannya sebagai waspada, dan bahaya hanya bila `confirmed`.

## Analisis dan laporan

Semua endpoint di bagian ini memakai akses **Aplikasi**.

| Method dan path | Query / request | Respons |
|---|---|---|
| `GET /api/indicators` | `level, parent, metrics, q, sort, order, limit, offset, format` (`csv`) | `IndicatorTable` |
| `GET /api/indicators/history` | `region_id*, metrics, since, until` | `IndicatorHistory` |
| `GET /api/history/events` | `metric*, days, bucket` | `EventHistory` |
| `GET /api/stats/classification` | — | `ClassificationStats` |
| `POST /api/score` | `ScoreWeights` | `ScoreResponse` · 400 untuk metrik tidak dikenal |
| `GET /api/reports/{region_id}` | `days` | `RegionReport` · 404 |
| `GET /api/isochrone` | `lat*, lon*, minutes, mode` | `Isochrone` · 400, 502 |

## Perangkat IoT

Semua endpoint memakai akses **Pengguna**, dan perangkat harus milik pengguna itu (selain itu 404).

| Method dan path | Request | Respons |
|---|---|---|
| `GET /api/me/devices` | — | `DeviceOut[]` (tanpa alat uji) |
| `POST /api/me/devices` | `DeviceIn` (semua opsional) | `DeviceCreated` (201): `api_key` hanya tampil di sini · 503 bila broker tidak tersedia |
| `PATCH /api/me/devices/{id}` | `DeviceUpdate` | `DeviceOut` |
| `DELETE /api/me/devices/{id}` | — | 204; semua pembacaan dan kredensial MQTT ikut terhapus |
| `POST /api/me/devices/{id}/key` | — | `KeyRotated`; kunci lama langsung tidak berlaku, termasuk login MQTT |
| `GET /api/me/devices/{id}/quickstart` | — | `Quickstart` dengan `<API_KEY>` sebagai pengganti kunci |
| `PUT /api/me/devices/{id}/layout` | `WidgetSpec[]` | `WidgetSpec[]` |
| `POST /api/me/devices/{id}/share` | `ShareIn` | `DeviceOut` · 400 bila lokasi belum diisi atau alat uji |

`DeviceOut` memuat status kiriman yang ditampilkan di UI: `last_seen_at`, `rejected_count`, `last_error`, `last_error_at`, `warning_count`, `last_warning`, `last_warning_at`, `dup_count`, dan `test_expires_at` (diisi hanya untuk alat uji).

`Quickstart` berisi `url`, `headers`, `mqtt` (`url`, `username`, `password`, `topic`, `qos`), `payload` contoh, `rules`, dan `snippets` (`esp32_arduino`, `python`, `curl`, `python_mqtt`).

## Kirim data sensor

| Jalur | Alamat | Akses |
|---|---|---|
| HTTP | `POST /api/ingest` → 202 `IngestOut` · 400, 401, 429 | **Perangkat** |
| MQTT | WebSocket TLS `wss://<host>/api/mqtt`, topik `ingest/dev<id>`, QoS 1, username `dev<id>`, password = API key | **Perangkat** |

Payload sama untuk kedua jalur:

```json
{"nama": "cuaca", "waktu": "2026-10-01T08:00:00+07:00", "data": {"suhu": 29.4, "baterai": {"volt": 3.9}}}
```

- `nama` adalah nama tabel data. Perbandingannya tidak membedakan huruf besar/kecil dan spasi (`"Cuaca Luar"` = `cuaca_luar`). Wajarnya satu perangkat memakai satu nama. Maksimal **10 nama per perangkat**; nama ke-11 ditolak dengan 400.
- `waktu` adalah waktu ukur dari sensor, dalam ISO 8601 (tanpa zona dianggap WIB) atau detik Unix. Waktu di masa depan ditolak.
- `data` boleh berisi angka, teks, boolean, atau list. Objek bersarang diratakan menjadi `baterai.volt`.
- Field baru pada nama yang sama membuat **versi baru** tabel itu.
- Kiriman yang sama persis dengan `waktu` yang sama (atau dalam 1 detik bila tanpa waktu) dihitung sebagai kiriman ulang: respons tetap 202 dengan `duplicate: true`, dan data tidak disimpan dua kali.
- Kiriman tanpa `nama` atau `waktu` masih diterima (tabel `default`, waktu diterima server) dengan `warnings`.
- Batas: 16 KB, 100 field, 1 kiriman per detik per perangkat.
- `?dry_run=true` hanya memeriksa kunci dan payload tanpa menyimpan. Responsnya menyebut tabel tujuan (mengikuti alias gabungan), field, dan jumlah field baru.
- Pesan MQTT yang salah tidak dibalas. Penolakan terakhir tersimpan di `last_error` perangkat.
- `alert` (opsional) adalah status bahaya yang dilaporkan perangkat sendiri: `"aman"`, `"bahaya"`, atau `{"status": "bahaya", "pesan": "Asap terdeteksi", "kategori": "kebakaran"}`. `kategori` salah satu dari `kebakaran`, `cuaca`, `gempa`, `bencana`, `panas`, atau dikosongkan (alert alat umum). Hanya status terakhir per perangkat dan `nama` yang disimpan; `IngestOut.alert` mengulang status yang diterima.

| Method dan path | Akses | Respons |
|---|---|---|
| `GET /api/me/alerts` | **Pengguna** | `DeviceAlert[]`: alert terakhir tiap perangkat dan `nama`, `bahaya` lebih dulu, lalu yang terbaru berubah |

Kode yang dilihat pengguna di Serial Monitor, sekaligus panduan pop up "Jika Ada Masalah" di frontend:

| Kode | Arti |
|---|---|
| 202 | Diterima (cek `duplicate` dan `warnings`) |
| 400 | Format salah, waktu salah, melebihi 10 nama, melebihi 16 KB / 100 field |
| 401 | API key perangkat salah atau sudah diganti |
| 429 | Lebih dari 1 kiriman per detik |

## Tabel data dan pembacaan

Akses **Pengguna**, untuk perangkat milik sendiri.

| Method dan path | Query / request | Respons |
|---|---|---|
| `GET /api/me/devices/{id}/readings` | `hours, limit` (≤ 5000), `stream, version, field, before` | `Readings` dengan `next_before` untuk halaman berikutnya |
| `POST /api/me/devices/{id}/readings/delete` | `ReadingsDelete` (minimal satu filter: `ids, stream_id, since, until`) | `ReadingsDeleted` · 400 |
| `GET /api/me/devices/{id}/streams` | — | `Stream[]` |
| `PATCH /api/me/devices/{id}/streams/{sid}` | `StreamEdit` (`name, category`) | `Stream[]` |
| `POST /api/me/devices/{id}/streams/{sid}/merge` | `StreamMerge` (`into`) | `Stream[]` · 400 |

`Stream` memuat `slug`, `aliases` (nama yang sudah digabung ke sini), `versions` (`keys`, `added`, `reading_count`), `fields`, `confirmed`, dan `reading_count`.

**Aturan gabung:** dua tabel hanya bisa digabung bila field yang pernah dimiliki keduanya **sama persis**. Selain itu backend menjawab 400, dan frontend tidak menawarkan tabel itu sebagai tujuan. Setelah digabung, tabel asal dihapus, pembacaannya pindah, versinya disambung setelah versi tabel tujuan, dan namanya menjadi alias, sehingga perangkat yang masih memakai nama lama tetap diterima.

## Alat uji

Akses **Pengguna**.

| Method dan path | Respons |
|---|---|
| `GET /api/me/test-device` | `DeviceOut` alat uji aktif, atau `null` |
| `POST /api/me/test-device` | `DeviceCreated` (201); alat uji sebelumnya dihapus beserta datanya |
| `GET /api/me/devices/{id}/events` | `DeviceEvent[]`, 100 terbaru, urut dari yang terbaru |

- Satu alat uji per akun. Alat uji adalah perangkat biasa dengan `test_expires_at` 2 jam setelah dibuat.
- Alat uji tidak muncul di daftar perangkat, dashboard, komunitas, maupun agen, dan tidak bisa dibagikan.
- Penjadwal backend tiap 10 menit menghapus alat uji yang kedaluwarsa, beserta pembacaan dan kredensial MQTT-nya. Frontend menghapusnya lebih awal dengan `DELETE /api/me/devices/{id}`.
- `DeviceEvent.kind`: `diterima`, `ulang`, `tabel_baru`, `versi_baru`, `peringatan`, `bahaya`, `ditolak`, `nama_diganti`, `digabung`, `dihapus`. Hanya alat uji yang mencatat kejadian.

## Dashboard pengguna

| Method dan path | Akses | Query | Respons |
|---|---|---|---|
| `GET /api/me/dashboard` | Pengguna | `hours` (1–720, bawaan 24) | `Dashboard` |

- `profile_needed: true` bila pengguna belum punya profil.
- `ours`: data publik yang dipilih dari profil aktif.
- `devices[]`: widget per perangkat (nilai terbaru, seri, pembanding wilayah). Alat uji tidak termasuk.
- Metrik pembanding pilihan AI untuk field sensor ditambahkan ke kartu wilayah dan layer peta, dengan penanda `added_for_sensor`.

## Komunitas dan moderasi

| Method dan path | Akses | Query / request | Respons |
|---|---|---|---|
| `GET /api/community/devices` | Aplikasi | `category, region_id` | `CommunityDevice[]` (hanya yang `approved`) |
| `GET /api/community/devices/{id}/readings` | Aplikasi | `field, hours, limit` | `Readings` |
| `GET /api/moderation/community` | Admin | `status` | `ModerationItem[]` |
| `POST /api/moderation/community/{id}` | Admin | `ModerateIn` | `ModerationResult` |
| `GET /api/moderation/users` | Admin | `q, limit` | `UserOut[]` |
| `POST /api/moderation/users/{id}/reset-password` | Admin | — | `PasswordReset` · 404 |

Status berbagi berjalan `none → pending → approved | rejected`.

## Agen Jev

| Method dan path | Akses | Request | Respons |
|---|---|---|---|
| `POST /api/agent/chat` | Opsional | `ChatRequest` | `ChatResponse` · 401, 429 |
| `POST /api/agent/chat/stream` | Opsional | `ChatRequest` | `text/event-stream` · 401, 429 |
| `GET /api/agent/sessions/{id}` | Opsional | — | `SessionState` |
| `GET /api/agent/tools` | Aplikasi | — | daftar tool yang bisa dipakai agen |

- Tamu mendapat jawaban dari data publik saja. Pengguna yang masuk juga mendapat profil dan perangkat miliknya (tanpa alat uji).
- `session_id` dari respons pertama dipakai lagi untuk pertanyaan lanjutan.
- Batas 10 chat per menit per akun (atau per IP tamu) dan 60 per menit untuk semua; lebih dari itu 429 dengan `Retry-After`.
- Bila pertanyaan bisa berarti beberapa hal, jawaban membawa `clarify = {question, options[]}`; tiap pilihan punya `label`, `question`, dan `description` (isi pilihan itu). Balasan berupa nomor atau label pilihan memilihnya. Setelah ringkasan wilayah, `clarify` juga dipakai untuk menawarkan langkah lanjutan.
- Kolom chat boleh menyisipkan `@Token` (huruf dan angka, spasi jadi `_`): topik (`@udara`, `@cuaca`, `@gempa`, …), perangkat atau tabel milik pengguna (`@Sensor_Balikpapan_01`), atau penerbit sumber data (`@BMKG`). Token yang sama dengan nama perangkat atau tabel pengguna selalu dijawab dari data alat itu; token lain dibaca sebagai kata biasa.

## Mengubah kontrak

1. Ubah backend (router dan `schemas.py`).
2. Di `frontend/`, jalankan `npm run api:generate` untuk memperbarui `docs/backend/openapi.json` dan `src/lib/api/generated.ts`.
3. Perbarui dokumen ini pada bagian yang berubah.
4. Perubahan yang mengubah bentuk respons, termasuk menghapus atau mengganti nama field, harus di-review oleh frontend dan backend.
