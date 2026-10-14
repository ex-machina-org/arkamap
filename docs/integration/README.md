# Integrasi frontend dan backend

Cara frontend (`frontend/`) dan backend (`backend/`) Arkamap terhubung. Bentuk setiap endpoint ada di [kontrak API](../API_CONTRACT.md); dokumen ini menjelaskan batas dan perilaku di antara keduanya.

| Dokumen | Isi |
| --- | --- |
| [Matriks endpoint](API_ENDPOINT_MATRIX.md) | Setiap operasi API dan file frontend yang memanggilnya |
| [Audit kontrak](API_CONTRACT_AUDIT.md) | Kesesuaian kode, `openapi.json`, tipe frontend, dan kontrak tertulis |
| [Validasi](VALIDATION.md) | Pemeriksaan otomatis dan manual beserta hasil terakhir |

## Batas browser

Browser hanya memanggil `/api/*` di origin frontend. Saat pengembangan, proxy Vite meneruskannya ke backend (`ARKAMAP_API_TARGET`: lokal, Docker, atau hosted). Bila `ARKAMAP_API_KEY` diisi, proxy menambahkan header `X-API-Key` dan membuang cookie browser, sehingga app key tidak pernah sampai ke kode browser.

Login dan signup mengembalikan JWT yang disimpan di sessionStorage tab dan dikirim sebagai Bearer token. Token bertahan saat reload dan navigasi di tab itu, tetapi tidak ditulis ke localStorage atau cookie; tab baru perlu login lagi, dan logout hanya membersihkan tab itu. Respons `401` pada request akun menghapus sesi. Sensor mengautentikasi diri langsung di `/api/ingest` dengan API key perangkat. Endpoint `/api/admin/*` dan `/api/moderation/*` hanya untuk akun admin.

Jev mengalirkan jawaban sebagai server-sent events dari `/api/agent/chat/stream`. Riwayat chat dan batas laju agen disimpan di proses API dan ter-reset saat API restart.

## Klien API

Klien di `frontend/src/lib/api/` memvalidasi DTO terhadap OpenAPI dengan Ajv, memetakan respons error dan `Retry-After`, membatalkan request profil lama, dan memakai timeout HTTP 20 detik. Mutasi dan chat tidak diulang otomatis. Event `done` merekonsiliasi payload final SSE; stream yang terputus, error, atau EOF tidak pernah ditandai final.

Pergantian sesi membersihkan data privat, dialog, dan giliran chat. Pengecekan sesi dibagi antar komponen, mempertahankan akun terakhir yang terverifikasi saat terjadi gangguan sementara, dan mencoba ulang pada 1, 2, dan 4 detik serta saat koneksi kembali atau tab difokuskan. Login ke akun lain menghapus identitas sebelumnya.

## Alur awal pengguna

Setelah signup atau login, klien masuk ke `/onboarding`. `GET /api/me` mengarahkan akun yang sudah punya profil aktif ke dashboard; akun tanpa profil aktif tetap di onboarding, termasuk saat membuka dashboard langsung.

Langkah pertama mengisi peran (2–200 karakter) dan tujuan opsional (hingga 500 karakter). Langkah kedua mencari wilayah lewat `GET /api/regions`, menawarkan mode dari `GET /api/modes`, lalu menyimpan lewat `PUT /api/me/profile`. Mode otomatis dan wilayah/tujuan yang dikosongkan dikirim sebagai `null`. `MeOut.profile` yang dikembalikan menjadi ringkasan konfirmasi: mode yang dipilih, catatan AI, dan kebutuhan yang belum didukung. Profil tambahan dibuat lewat `POST /api/me/profiles` dari dialog profil, hingga tiga profil.

Onboarding tidak bisa dilewati sebelum profil ada. Pengguna tetap bisa keluar; sesi kedaluwarsa menawarkan login dan coba lagi.

## Data dan tampilan

Dashboard memakai respons API yang sebenarnya. Data yang tidak cukup ditampilkan sebagai keadaan kosong atau tidak tersedia, bukan diganti kejadian contoh. Ringkasan publik, laporan wilayah, dan perangkat komunitas yang disetujui tampil di panel peta.

Backend menyimpan nama, kategori, dan koordinat opsional perangkat. Jenis sensor di formulir dikirim sebagai `category`; isian formulir lain tidak disimpan dan tampil dengan nilai default. Geolokasi browser dan pemilihan titik di peta bersifat opsional; berbagi ke komunitas membutuhkan koordinat.

Ada tujuh jenis widget sensor. Gauge tidak memakai rentang bahaya buatan. Seri grafik membawa satuan dan waktu. Indikator yang ditandai backend sebagai keluaran model diberi label MODEL, dan kategori sensor `ai` adalah klasifikasi, bukan verifikasi bacaan.

## Lingkup runtime

`docker compose up --build` menjalankan PostGIS, Mosquitto, API, `seed` sekali jalan untuk data publik, dan MQTT bridge. Chat Chainlit opsional ada di profil `chat`. Registrasi perangkat membuat kredensial broker, sehingga Mosquitto harus berjalan. Sensor bisa mengirim lewat HTTP (`/api/ingest`) atau MQTT (`ingest/dev<id>`).

Ingest dari penyedia luar, kredensial LLM, ketersediaan tile peta, dan kapasitas produksi adalah prasyarat operasional di luar repo ini.
