# Panduan kontribusi

## Alur kerja

1. Setiap pekerjaan berawal dari issue. Satu issue dikerjakan di satu cabang dan satu PR.
2. Buat cabang dari `main` terbaru dengan awalan sesuai jenisnya: `feat/`, `fix/`, `docs/`, `ci/`, `chore/`, diikuti nama singkat (`feat/sensor-ingest`).
3. Commit kecil per langkah, dengan format [Conventional Commits](https://www.conventionalcommits.org/): `feat(api): add signup and login`, `fix(frontend): keep the map focus after reload`, `docs: describe the hosted mode`. Tulis pesan dalam bahasa Inggris, bentuk perintah, tanpa titik di akhir.
4. Buka PR ke `main`. Judul PR dalam bahasa Indonesia; deskripsinya menjelaskan apa yang berubah, cara mengeceknya, dan `Closes #N`.
5. PR digabung setelah CI hijau.

Pembagian kerja dan urutan issue ada di Roadmap ([#50](https://github.com/ex-machina-org/arkamap/issues/50)). Frontend menunggu issue backend yang dibutuhkannya tertutup; isi endpoint mengikuti [kontrak API](docs/API_CONTRACT.md).

## Aturan kode

**Frontend** (`frontend/`)
- Ikuti [aturan visual](DESIGN.md): token semantik, tanpa warna palet mentah atau hex arbitrer, ikon hanya dari `@remixicon/react`.
- Letakkan kode sesuai [arsitektur frontend](docs/frontend/ARCHITECTURE.md); `npm run architecture:check` menolak impor yang melanggar arah dependensi.
- Pilih komponen yang sudah ada lebih dulu ([katalog komponen](docs/frontend/COMPONENTS.md)). Komponen publik baru wajib masuk registry `/design-system`.
- Jangan menyunting `src/lib/api/generated.ts` dengan tangan; jalankan `npm run api:generate`.

**Backend** (`backend/`)
- Beri endpoint baru `response_model` dan respons error-nya, supaya kontrak OpenAPI lengkap.
- Perubahan skema database masuk sebagai file SQL bernomor baru di `backend/sql/`; file lama tidak diubah.
- Tes ikut bersama fiturnya (`backend/test_*.py`).
- Rahasia hanya di `.env`/`.env.local`, tidak pernah di-commit.

**Kontrak API**
- Perubahan bentuk request/response diperbarui bersama: kode backend, `docs/backend/openapi.json`, tipe frontend (`npm run api:generate`), dan bagian terkait di [docs/API_CONTRACT.md](docs/API_CONTRACT.md).

## Pemeriksaan sebelum PR

Dari `frontend/`:

```bash
npm run check        # lint, typecheck, batas arsitektur, katalog komponen
npm run build
npm run test:api     # klien API dan stream Jev
npm run api:check    # OpenAPI dan tipe TypeScript tidak berbeda dari backend
```

Dari root, untuk perubahan backend:

```bash
(cd backend && python -c "import app.main")
python backend/test_iot.py && python backend/test_agent.py && python backend/test_bmkg.py
```

Untuk perubahan UI, periksa juga [checklist UI](docs/frontend/UI-CHECKLIST.md). Tuliskan di deskripsi PR pemeriksaan yang benar-benar dijalankan.

CI menjalankan pemeriksaan yang sama pada setiap push dan PR: `frontend.yml` (install, `check`, `build`) dan `integration.yml` (`api:check`, `test:api`, tes backend dengan PostGIS).
