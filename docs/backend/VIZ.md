# Kontrak komponen (viz)

`POST /api/agent/chat` dan event `viz` di `/api/agent/chat/stream` membawa `viz: [...]`.
Tiap item punya `type`. Aplikasi web merendernya di
`frontend/src/components/application/agent-chat/viz-renderer.tsx`; chat Chainlit
internal memetakannya lewat `VIZ_COMPONENTS` di `backend/chainlit_app.py` dan
mengirim seluruh item sebagai `props`.

| type | Komponen | props |
|---|---|---|
| `ranking` | RankingChart | `weights`, `level`, `top_n`, `score_meaning`, `results[]: {region_id, name, score, coverage, modelled_share, min_confidence}` |
| `region_card` | RegionCard | `id`, `name`, `level`, `population`, `score_meaning`, `indicators[]: {metric, label, unit, value, period, normalised, confidence, is_modelled, source_id}` |
| `event_map` | EventMap | `kind` (quake/hotspot/disaster), `days`, `region` (`{id,name,level}` atau null = nasional), `total_count`, `shown`, `top[]`, `geojson` (FeatureCollection titik); untuk `disaster` juga `by_type`, dan tiap fitur punya `type`, `name`, `alertlevel`, `source_id` |
| `event_map` (fasilitas) | EventMap | `kind` (power_plant/transit_stop), `what`, `region` (atau null = nasional), `total_count`, `top[]: {name, capacity_mw?, fuel?, kabkota, provinsi, lon, lat}` (10 terbesar), `geojson`; `power_plant` juga `total_capacity_mw`, `by_fuel`. Tanpa `days`: fasilitas dihitung di tempatnya, bukan per periode |
| `trend` | TrendChart | `region` (`{id,name,level}`), `metric`, `label`, `unit`, `days`, `periode_tersimpan`, `points[]: {period, value, is_modelled}` (terlama dulu), `perubahan?: {arah (naik/turun/tetap), nilai (satuan metrik), satuan, persen, dari, sampai}` (bila ≥ 2 periode). Untuk bacaan sensor milik pengguna (`my_readings`): `subject` ("alat · tabel") menggantikan `region`, `hours` (atau `since`/`until` untuk rentang tanggal) menggantikan `days`, `period` berupa waktu bacaan, dan ada `stats: {min, max, mean}`, `count`, `latest`. Lebih dari 300 bacaan dirata-rata per interval di database: `per` ("rata-rata per jam", null = bacaan asli) dan tiap titik membawa `min`, `max`, `n` interval itu. Bila ≥ 2 titik juga `ringkasan: {rata_rata, tertinggi: {nilai, waktu}, terendah: {nilai, waktu}}` |
| `trend_compare` | TrendCompare | Perbandingan riwayat (`compare`, `my_compare`): `series[]: {name, metric, label, unit, points[], terakhir: {nilai, waktu}, perubahan?, ringkasan?, stats?, per?}` (maks. 5). `same_metric: true` = satu metrik di beberapa wilayah, satu grafik bertumpuk dengan judul `label`; `false` = beberapa metrik/field, grafik kecil berderet dengan sumbu waktu yang sama, judul `subject` (wilayah, atau "alat · tabel"). `days` untuk wilayah; `hours` atau `since`/`until` untuk alat |
| `event_trend` | EventTrend | Jumlah kejadian per periode (`event_trend`): `kind`, `label`, `days`, `per` (hari/minggu), `region` (atau null = nasional), `total`, `points[]: {period (tanggal WIB), value (jumlah), terkuat? (magnitudo, gempa)}` termasuk periode tanpa kejadian, `ringkasan: {rata_rata, tertinggi: {nilai, waktu}, tanpa_kejadian, terkuat?}`, `paruh: {awal, akhir, arah}`, `data_sejak?` (tanggal mulai data lengkap bila setelah awal rentang: periode sebelumnya belum tercatat, bukan nol) |
| `data_table` | DataTable | Isi tabel data alat milik pengguna (`my_table`): `device`, `table`, `columns[]: {key, label}` (hanya kolom yang diminta), `rows[]: {waktu, <key>: nilai}` (terbaru dulu, waktu WIB), `total` (baris dalam rentang), `shown`, `since?`/`until?`, `first`/`last` (rentang baris yang cocok), `table_first`/`table_last` (rentang seluruh tabel), `versions[]: {version, fields, added, readings}`, `tidak_ada[]` (kolom diminta tapi tidak ada), `other_tables[]` |
| `alerts` | AlertList | `count`, `quake_alerts[]`, `region_alerts[]`, `disaster_alerts[]`, `source_alerts[]` |

Batas mutu udara (`app/agent/standards.py`): metrik udara yang punya acuan (`pm25_mean`, `no2_mean`,
`co_mean`, `aqi_forecast_max`) membawa `status: {kategori, tingkat (0 baik … 5 berbahaya), melebihi_batas?,
melebihi_pedoman_who?}` dan `standar: {batas?, batas_nama?, pedoman?, pedoman_nama?, skala?, kategori?[]: {sampai,
nama, tingkat}}`: per indikator di `region_card`; per baris di `ranking` satu metrik (`results[].status`,
`standar: {<metrik>: …}`, `melebihi_batas: {jumlah, dari}`); di `trend` (`standar`, `status_terakhir`,
`periode_melebihi_batas`) dan per garis `trend_compare`. `ranking` juga membawa `results[].peringkat` dan `sorot`
(id wilayah yang sedang dibahas, ikut tampil di bawah 10 besar dengan peringkatnya). `region_card` untuk udara secara
keseluruhan membawa `kualitas_udara: {kategori, tingkat, dominan[], melebihi_batas[], melebihi_pedoman_who[],
dinilai[], belum_ada[]}`: polutan terburuk (PM2.5, PM10, NO₂, SO₂, O₃, CO) menentukan, seperti ISPU. Peringkat satu metrik
ditampilkan dengan nilai aslinya, bukan skor 0-100. Kategori selalu tampil sebagai teks, warna hanya pendamping.

Aturan tampilan: `normalised`/`score` 0-100 dengan 100 = paling perlu
perhatian; `is_modelled: true` wajib diberi tanda MODEL; gempa = kejadian
tercatat, bukan prediksi.
