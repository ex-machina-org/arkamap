# Audit kontrak API

Pemeriksaan kesesuaian tiga hal: kode backend, [`docs/backend/openapi.json`](../backend/openapi.json) beserta tipe frontend yang dibuat darinya, dan ringkasan manusia di [`docs/API_CONTRACT.md`](../API_CONTRACT.md). Audit terakhir: 15 Oktober 2026, pada `main` setelah PR #66.

## Ringkasan

| Pemeriksaan | Hasil |
| --- | --- |
| `openapi.json` sama dengan yang dihasilkan backend | Sesuai (`npm run api:check`) |
| `frontend/src/lib/api/generated.ts` sama dengan `openapi.json` | Sesuai (`npm run api:check`) |
| Setiap operasi di `openapi.json` disebut di `API_CONTRACT.md` | Sesuai: 73 dari 73 |
| Setiap endpoint di `API_CONTRACT.md` ada di `openapi.json` | Sesuai; `POST /api/agent/chat*` adalah penulisan singkat untuk `/chat` dan `/chat/stream` |
| Setiap operasi punya skema respons sukses | Sesuai; `DELETE /api/me/devices/{device_id}` menjawab `204` tanpa body |
| Klien API frontend (validasi DTO, error, stream Jev) | Lulus (`npm run test:api`, 6 tes) |
| Pemakaian endpoint oleh frontend | 50 dari 73 operasi; rinciannya di [matriks endpoint](API_ENDPOINT_MATRIX.md) |

## Temuan

| # | Prioritas | Temuan | Tindak lanjut |
| --- | --- | --- | --- |
| K1 | Sedang | Endpoint khusus admin (`/api/admin/refresh*`, `/api/moderation/*`) menjawab `401`/`403` lewat `Depends(admin_user)`, tetapi `openapi.json` hanya mencatat `200` dan `422`. Tipe frontend tidak tahu bentuk error-nya. | Tambahkan `responses={401: ..., 403: ...}` dengan `ErrorResponse` pada endpoint admin. |
| K2 | Sedang | `GET /api/community/devices/{device_id}/readings` menjawab `404` bila perangkat tidak dibagikan, dan `DELETE /api/me/devices/{device_id}` menjawab `404` untuk perangkat milik orang lain. Keduanya tidak tercatat di `openapi.json`. | Tambahkan `404` dengan `ErrorResponse`. |
| K3 | Rendah | `401` karena `X-API-Key` (saat `REQUIRE_API_KEY=1`) berlaku untuk semua `/api/*`, tetapi hanya dijelaskan di bagian Konvensi, tidak per operasi. | Cukup didokumentasikan di Konvensi; tidak perlu diulang per operasi. |
| K4 | Rendah | 11 operasi publik belum dipakai frontend, antara lain `/api/isochrone`, `/api/marine`, `/api/solar-forecast`, `/api/indicators/history`, dan `/api/community/devices/{device_id}/readings`. | Bukan kesalahan kontrak. Dicatat sebagai bahan halaman berikutnya. |
| K5 | Rendah | Endpoint `/api/agent/sessions/{session_id}` tersedia, tetapi chat Jev selalu memulai sesi baru, sehingga riwayat chat tidak dipulihkan dari server. | Pakai bila riwayat chat lintas perangkat dibutuhkan. |

Temuan K1 dan K2 tidak mengubah perilaku API; yang kurang hanya deskripsinya. Setelah diperbaiki, jalankan `npm run api:generate` agar tipe frontend ikut diperbarui.

## Cara mengulang audit

1. Dari `frontend/`: `npm run api:check` dan `npm run test:api`.
2. Bandingkan daftar operasi `openapi.json` dengan endpoint yang disebut di `API_CONTRACT.md`. Setiap operasi baru wajib punya baris di bagian fiturnya.
3. Perbarui [matriks endpoint](API_ENDPOINT_MATRIX.md) dengan mencari pemanggil setiap path di `frontend/src/` (selain `generated.ts`).
4. Catat temuan baru di tabel di atas beserta tanggal audit.
