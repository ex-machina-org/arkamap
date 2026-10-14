# Infrastruktur dan keamanan

Layanan backend Arkamap, konfigurasinya, dan apa yang perlu diperiksa sebelum API dibuka ke publik. Untuk menjalankan stack, lihat [README](../../README.md#menjalankan).

## Layanan

`docker compose up --build` dari root repo menjalankan:

| Layanan | Isi | Port di host |
|---|---|---|
| `db` | PostgreSQL + PostGIS 16 | tidak dibuka |
| `mosquitto` | Broker MQTT; registrasi perangkat membuat login broker, jadi API butuh layanan ini | `1883` |
| `api` | FastAPI (`backend/`) | `127.0.0.1:8000` |
| `mqtt-bridge` | Menyimpan pesan MQTT lewat jalur yang sama dengan ingest HTTP | — |
| `seed` | Sekali jalan: mengunduh data publik ke database kosong, lalu berhenti | — |
| `chat` | Chat Chainlit untuk mencoba agen; hanya dengan `--profile chat` | `127.0.0.1:8001` |

Skema database diterapkan otomatis saat API mulai, dari file bernomor di `backend/sql/`. Broker punya dua listener: `1883` (TCP) dan `9001` (WebSocket, untuk diteruskan proxy sebagai `/api/mqtt`); login anonim ditolak.

## Konfigurasi

Docker Compose membaca `.env` di root; uvicorn lokal membaca `.env.local` (`--env-file`). Contohnya ada di [`.env.example`](../../.env.example). Jangan commit keduanya.

| Variabel | Default | Fungsi |
|---|---|---|
| `DATABASE_URL` | diisi compose | Koneksi PostgreSQL |
| `JWT_SECRET` | nilai lokal | Menandatangani token login; ganti dengan string acak panjang. Mengganti nilainya membuat semua pengguna keluar |
| `JWT_DAYS` | `7` | Umur token login |
| `REQUIRE_API_KEY` | `0` | `1` = setiap `/api/*` wajib `X-API-Key` aplikasi, kecuali `/api/health` dan `/api/ingest` |
| `API_KEYS` | kosong | Kunci aplikasi awal (dipisah koma), diterima sebelum ada kunci dari database |
| `ADMIN_EMAILS` | kosong | Email yang menjadi admin saat mendaftar (moderasi, refresh, kunci aplikasi) |
| `CORS_ORIGINS` | `http://localhost:8080` (compose) | Origin browser yang boleh memanggil API langsung, dipisah koma |
| `PUBLIC_URL` | `http://localhost:8000` (compose) | Alamat yang tertulis di contoh kode perangkat (quickstart); isi dengan domain yang dipakai sensor |
| `MQTT_HOST`, `MQTT_BRIDGE_PASSWORD` | `mosquitto`, nilai lokal | Alamat broker dan kata sandi bridge |
| `ENABLE_SCHEDULER` | `1` | Ingest terjadwal (06:00/18:00 WIB, BMKG tiap 15 menit, pembersihan alat uji) |
| `AGENT_RATE_PER_CLIENT`, `AGENT_RATE_GLOBAL` | `10`, `60` | Batas chat agen per menit, per akun atau IP tamu dan total |
| `AGENT_UNLIMITED_EMAILS` | akun uji | Akun yang tidak dibatasi agen |
| `IOT_STRICT_PAYLOAD` | `0` | `1` = tolak kiriman sensor yang tidak sesuai format, bukan hanya memberi peringatan |
| `GEMINI_API_KEY`, `OPENROUTER_API_KEY`, `DEEPSEEK_API_KEY` | kosong | Model bahasa untuk Jev; tanpa itu Jev menjawab dari template |
| `FIRMS_MAP_KEY` | kosong | Titik panas FIRMS yang lebih rinci; tanpa kunci memakai feed regional |
| `HTTP_TIMEOUT` | `60` | Batas waktu request ke sumber data luar (detik) |

## Lapisan keamanan

- **Kunci aplikasi.** Dengan `REQUIRE_API_KEY=1`, request tanpa `X-API-Key` yang valid dijawab `401`. Kunci pertama dibuat dari server: `docker compose exec api python -m app.clients create "frontend web"`; berikutnya lewat `/api/clients` oleh admin. Kunci yang dicabut berhenti bekerja dalam satu menit. Hanya hash kunci yang disimpan.
- **Kunci tidak sampai ke browser.** Frontend memanggil `/api` di origin-nya sendiri; proxy di sisi server menambahkan `X-API-Key` (lihat [integrasi](../integration/README.md#batas-browser)).
- **Akun.** Kata sandi di-hash; token login JWT berlaku `JWT_DAYS` hari dan batal saat kata sandi diganti.
- **Admin.** `/api/admin/*`, `/api/clients`, dan `/api/moderation/*` hanya untuk akun admin (`403` untuk akun lain).
- **Perangkat.** Setiap alat punya API key sendiri untuk `/api/ingest` dan login MQTT; alat hanya boleh publish ke topiknya sendiri dan tidak bisa subscribe. Rotasi key langsung mengganti kata sandi MQTT.
- **Batas laju.** Ingest 1 kiriman per detik per alat (16 KB, 100 field); chat agen sesuai `AGENT_RATE_*`, dengan `429` dan `Retry-After`.
- **Tanpa redirect ke domain API.** Path dengan garis miring di akhir dilayani langsung, sehingga respons tidak membawa alamat API ke browser di belakang proxy.

## Sebelum dibuka ke publik

1. Isi `POSTGRES_PASSWORD`, `JWT_SECRET`, dan `MQTT_BRIDGE_PASSWORD` di `.env` dengan nilai acak.
2. Set `REQUIRE_API_KEY=1`, buat kunci aplikasi untuk frontend, dan simpan kunci itu hanya di proxy frontend.
3. Isi `ADMIN_EMAILS`, lalu daftarkan akun admin.
4. Isi `CORS_ORIGINS` dengan domain frontend saja, bukan `*`.
5. Isi `PUBLIC_URL` dengan domain yang dipakai sensor.
6. Taruh API di belakang reverse proxy dengan TLS. Jangan buka port `8000` dan `1883` ke internet; teruskan `/api/*` ke API dan `/api/mqtt` ke listener WebSocket broker (`9001`), dan tutup `/api/admin/*` dari luar.
7. Cek: `GET /api/health` menjawab `200`, request tanpa kunci aplikasi menjawab `401`, dan `/api/admin/refresh` dari luar tidak bisa diakses.

## Perawatan

```bash
docker compose ps                          # status layanan
docker compose logs --tail 50 api          # log API
docker compose exec api python -m app.clients create "nama"   # kunci aplikasi baru
docker compose down -v                     # hapus semua data lokal
```
