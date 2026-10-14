# Validasi

Daftar pemeriksaan yang membuktikan frontend dan backend berjalan bersama, beserta hasil terakhirnya. Jalankan ulang setiap menjelang rilis dan perbarui tabel hasil.

## Pemeriksaan otomatis

| Pemeriksaan | Perintah | Membuktikan |
| --- | --- | --- |
| Lint | `npm run lint` | Tidak ada error oxlint |
| Typecheck | `npm run typecheck` | Seluruh frontend lolos TypeScript |
| Batas arsitektur | `npm run architecture:check` | Arah dependensi antar folder sesuai [arsitektur](../frontend/ARCHITECTURE.md) |
| Katalog komponen | `npm run catalog:check` | Setiap entri registry menunjuk source dan contoh yang ada |
| Build | `npm run build` | Bundle produksi bisa dibuat |
| Kontrak API | `npm run api:check` | `openapi.json` dan tipe frontend sama dengan kode backend |
| Klien API | `npm run test:api` | Validasi DTO, pemetaan error/`Retry-After`, dan stream SSE Jev |
| Backend IoT | `python backend/test_iot.py` | Ingest, tabel per nama, versi, dan gabung tabel |
| Backend Jev | `python backend/test_agent.py` | Pemilihan tool, jawaban, dan cadangan model |
| Backend BMKG | `python backend/test_bmkg.py` | Parsing peringatan dan gempa BMKG |
| Backend data | `python backend/test_atlas.py`, `python backend/test_fire.py` | Endpoint data dan deteksi kebakaran; butuh database berisi data |

Perintah `npm` dijalankan dari `frontend/`, perintah `python` dari root repo.

## Hasil terakhir

15 Oktober 2026, `main` setelah PR #66. Linux, Node 22, Python 3.12.

| Pemeriksaan | Hasil |
| --- | --- |
| `lint` | Lulus, dengan warning (`react(set-state-in-effect)` dan sejenisnya), tanpa error |
| `typecheck`, `build` | Lulus setelah `npm ci`; build memberi warning ukuran chunk di atas 500 kB |
| `architecture:check` | Lulus, dengan satu pengecualian terdokumentasi (`ui/kpi-card.tsx`) |
| `catalog:check` | Lulus |
| `api:check` | Lulus |
| `test:api` | Lulus, 6 tes |
| `test_iot.py`, `test_agent.py`, `test_bmkg.py` | Lulus tanpa database |
| `test_atlas.py`, `test_fire.py` | Belum dijalankan: butuh PostGIS berisi data hasil `seed` |

## Pemeriksaan manual

Dijalankan dengan `docker compose up --build -d` dan frontend `npm run dev` (lihat [README](../../README.md#menjalankan)).

| Alur | Langkah | Hasil yang diharapkan |
| --- | --- | --- |
| Kesehatan | `GET /api/health` | `200`, jumlah wilayah dan observasi bertambah setelah `seed` |
| Peta publik | Buka `/` tanpa login | Titik panas, gempa, peringatan, dan choropleth tampil; klik titik membuka detail |
| Akun | Sign up → isi profil awal → reload | Tetap masuk di tab yang sama; tab baru meminta login |
| Perangkat | Tambah alat → salin contoh curl → kirim data | Tabel data dan widget muncul di detail perangkat |
| MQTT | `mosquitto_pub` dengan `dev<id>` dan API key | Bacaan tersimpan lewat `mqtt-bridge` |
| Alat uji | Mulai alat uji → kirim → tunggu kedaluwarsa | Log kejadian tercatat, lalu alat terhapus sendiri |
| Jev | Tanya kondisi satu wilayah | Jawaban mengalir bertahap dan menyebut sumber data |
| Admin | `POST /api/admin/refresh` dengan akun biasa | `403` |

## Batas validasi

- Ingest dari penyedia luar (FIRMS, BMKG, Open-Meteo, OSM) bergantung pada ketersediaan layanan tersebut; tes offline tidak membuktikan kesegaran data.
- Kualitas jawaban LLM untuk Jev tidak diuji otomatis. Tanpa kunci LLM, Jev menjawab dari template.
- Tile peta dimuat dari layanan luar dan membutuhkan internet.
