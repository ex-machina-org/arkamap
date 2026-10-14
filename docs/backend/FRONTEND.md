# Struktur Halaman Frontend

Untuk: tim frontend. Detail endpoint ada di [API.md](API.md) (data publik) dan [IOT.md](IOT.md) (akun, perangkat, dashboard); tipe lengkap di [`frontend/src/lib/api/generated.ts`](../../frontend/src/lib/api/generated.ts).

Aplikasi punya **dua mode**:

| | Mode publik | Mode login |
|---|---|---|
| Siapa | Semua orang, tanpa akun | User yang sudah daftar/masuk |
| Isi | Data publik nasional: peta, peringkat, kejadian, peringatan, data komunitas | Tampilan yang disesuaikan dengan **penjelasan diri user**, data wilayahnya, dan sensor miliknya |
| API key perangkat | Tidak ada | Dibuat di sini (menu Perangkat) |

## Peta halaman

```
/                     Beranda publik
/peta                 Peta publik (layer bebas dipilih)
/analisis             Analisis publik atas data peta
/wilayah/:id          Laporan satu wilayah
/komunitas            Sensor komunitas yang disetujui admin
/masuk, /daftar       Akun
─────────────────────── setelah login ───────────────────────
/kenalan              "Ceritakan tentang Anda" (wajib sekali, bisa diubah)
/dashboard            Tampilan sesuai bidang + sensor user
/perangkat            Daftar perangkat, buat perangkat, API key, kirim data
/perangkat/:id        Widget dan riwayat satu perangkat
/admin/komunitas      Moderasi (hanya admin)
```

## Mode publik

**Beranda `/`**: satu panggilan `GET /api/public/overview` (di-cache 5 menit di server).
- `counts`: kartu angka (titik panas 24 jam dan 7 hari, gempa M≥4,5 7 hari, bencana 30 hari, sensor komunitas).
- `fire_risk_top`: 5 provinsi paling rawan kebakaran.
- `disaster_alerts`, `quake_alerts`: peringatan aktif.
- `stale_sources`: tampilkan banner kecil bila ada sumber data yang gagal diperbarui.
- `fields`: contoh bidang yang didukung, untuk ajakan "Masuk dan dapatkan tampilan untuk pekerjaan Anda".

**Peta `/peta`**: layer dari `GET /api/metrics` (choropleth `GET /api/map/{metric}`) dan layer titik `/api/hotspots`, `/api/quakes`, `/api/disasters`, `/api/windgrid`, dan layer area `/api/warnings` (poligon peringatan BMKG, warnai per `severity`). `/api/windgrid` juga mengisi permukaan suhu (`surface`, cadangan `temperature`). Klik wilayah membuka semua indikatornya dari `GET /api/regions/{id}`.
**Analisis `/analisis`**: `GET /api/stats/classification` (urgensi gempa dari Jev), `GET /api/history/events`, `GET /api/notifications`, `GET /api/quakes`, dan `GET /api/map/{metric}` untuk peringkat dan perbandingan dua indikator.
**Wilayah `/wilayah/:id`**: `GET /api/reports/{region_id}`; pencarian lewat `GET /api/regions?q=`.
**Komunitas `/komunitas`**: `GET /api/community/devices` (+ riwayat per perangkat).
Chat Agent juga bisa di mode publik (`POST /api/agent/chat/stream`, lihat bagian Chatbot di bawah).

## Mode login

### 1. Kenalan: user mendefinisikan dirinya sendiri

**Tidak ada daftar bidang yang harus dipilih.** Sediakan form bebas:

| Isian | Contoh | Field |
|---|---|---|
| Siapa Anda / pekerjaan | "anggota damkar Kota Palangka Raya" | `role` (wajib) |
| Apa yang ingin dipantau | "titik api dan arah angin di sekitar kota" | `goals` |
| Wilayah (opsional) | pencarian `GET /api/regions?q=` | `region_id` |
| Mode (opsional) | pilihan dari `GET /api/modes`: Protected / Responden / Plan, atau "biar AI yang menentukan" | `mode` |

Profil pertama: kirim `PUT /api/me/profile`. Profil berikutnya: `POST /api/me/profiles`. AI membaca penjelasan itu lalu mengembalikan (dalam `profile`):

| Field | Arti | Cara menampilkan |
|---|---|---|
| `field`, `field_label` | Tampilan terdekat (pemadam, bencana, pertanian, kesehatan, energi, tata kota, lingkungan, umum) | Judul dashboard, mis. "Tampilan: Pemadam kebakaran & karhutla" |
| `fit` | `cocok`, `sebagian`, `tidak_cocok`, atau `null` (AI tidak tersedia) | Badge warna |
| `ai_message` | Penjelasan jujur dari AI: apa yang bisa dan tidak bisa ditampilkan | Kotak info di atas dashboard |
| `unsupported` | Daftar kebutuhan user yang **belum ada datanya** | Daftar "Belum tersedia", mis. "jumlah kendaraan" |
| `metrics` | Metrik kita yang relevan + alasan | Kartu indikator |

Contoh nyata hasil uji:
- "anggota damkar": `pemadam`, **cocok**.
- "peneliti kualitas air sungai": `lingkungan`, **sebagian**. Oksigen terlarut dan parameter kimia air belum tersedia; AI menyarankan memasang sensor IoT sendiri.
- "pemilik bengkel motor": `tata_kota`, **sebagian/tidak_cocok**. Jumlah kendaraan dan harga oli belum tersedia.

Bila `fit` = `tidak_cocok`, tetap tampilkan dashboard (tampilan umum) beserta pesannya. User boleh mengubah penjelasannya kapan saja; AI membaca ulang setiap kali disimpan.

**Ganti profil/mode** (menu di header, seperti ganti akun):
- Daftar dari `GET /api/me` → `profiles` (maks. `max_profiles` = 3), tandai yang `active`, tampilkan `mode_label` dan `field_label`.
- Pilih profil yang sudah ada → `POST /api/me/profiles/{id}/activate`. Tidak ada form, tidak ada pertanyaan; dashboard langsung dimuat ulang dengan data profil itu.
- "Tambah profil" → form kenalan di atas (dengan pilihan mode) → `POST /api/me/profiles`. Sembunyikan tombolnya bila sudah 3 profil (server menjawab 409), dan tawarkan hapus profil.

### 2. Dashboard `/dashboard`

Satu panggilan: `GET /api/me/dashboard`.
- `profile_needed: true` → arahkan ke `/kenalan`.
- `view.mode` → mode profil aktif; susun panel mengikuti `view.mode.panels`.
- `view.impact` (hanya `protected`) → tampilkan paling atas: kartu gempa (magnitudo, tempat, `felt` dari BMKG, radius sebagai lingkaran di peta, daftar kab/kota terdampak dan penduduknya) dan peringatan cuaca beserta kab/kota yang tercakup. Tampilkan `radius_note` kecil di bawahnya.
- `view.history` (hanya `plan`) → grafik batang jumlah kejadian per bulan.
- `view.message`, `view.fit`, `view.unsupported` → kotak info dari AI (lihat di atas).
- `view.focus` → buka peta di `bbox` wilayah user.
- `view.layers` → layer peta yang otomatis menyala untuk bidang ini (`choropleth` → `/api/map/{metric}`, `points` → `/api{endpoint}` + `params`, `areas` → poligon dari `/api{endpoint}`, mis. `/warnings`).
- `ours.region.indicators` → kartu indikator yang dipilih AI, lengkap dengan `reason`.
- `view.events` → kejadian terbaru di wilayah user (jumlah, nilai terbesar, 5 teratas).
- `view.ranking` → peringkat kabupaten/kota se-provinsi (atau provinsi se-Indonesia): posisi user `your_rank`/`of`, dan baris `is_you` disorot. `sort: "attention"` berarti paling perlu perhatian di atas; `"value_desc"` berarti nilai tertinggi di atas.
- `view.alerts` → peringatan yang relevan dengan bidang dan wilayah.
- `devices[]` → widget sensor user (lihat IOT.md bagian Dashboard).

**Dashboard menyesuaikan diri dengan sensor.** Tanpa sensor, isinya hanya data kita yang dipilih dari penjelasan user. Begitu user menambah sensor, metrik wilayah yang sebanding dengan field sensornya (dipilih AI saat menata widget) ikut masuk ke `ours.region.indicators` dan `view.layers`, bertanda **`added_for_sensor: true`** dengan `reason`, mis. "pembanding untuk sensor Sensor Posko: PM2.5". Tampilkan tanda kecil, mis. "ditambahkan karena sensor Anda". Field sensor baru memperbarui dashboard saat dibuka berikutnya; tidak perlu tindakan dari frontend.

### 3. Perangkat `/perangkat`: satu-satunya tempat membuat API key
- Buat perangkat: satu tombol "Ambil API key"; nama, kategori, lokasi opsional ("Lokasi saat ini" via geolocation browser, atau "Pilih di peta").
- `api_key` tampil **sekali**: tombol salin + peringatan.
- Tampilkan cara kirim: HTTP (`X-API-Key`) dan MQTT (`mqtt_username`, `mqtt_topic`, `wss://.../api/mqtt`). Contohnya ada di IOT.md.
- Rotasi key, hapus perangkat, ajukan ke komunitas.

## Chatbot Agent (streaming)

Tidak butuh Chainlit. Layar chat dibuat di frontend; komponen yang dipilih AI datang sebagai data (`viz`) dan dirender dengan komponen yang sama seperti di dashboard ([VIZ.md](VIZ.md)).

Pakai **`POST /api/agent/chat/stream`** (body sama dengan `/agent/chat`: `{"question", "session_id"?}`). Respons berupa Server-Sent Events:

| Event | `data` | Yang dilakukan UI |
|---|---|---|
| `start` | `{session_id, skill, route_source}` | Simpan `session_id`; tampilkan "sedang mencari…" |
| `step` | `{tool, args}` | Tampilkan langkah AI, mis. "Mencari wilayah Sulawesi Tengah" |
| `viz` | objek `viz` (`type` + data) | Render komponennya **segera**, sebelum teks selesai |
| `token` | `{text}` | Tambahkan ke teks jawaban (mengalir per kalimat yang sudah lolos penjaga angka; teks yang tampil tidak pernah ditarik) |
| `reset` | `{}` | Hapus teks yang sudah tampil (itu pengantar sebelum AI memanggil tool) |
| `replace` | `{answer, fallback}` | Usang, tidak dikirim lagi; bila AI gagal, cadangan melanjutkan lewat `token` dan ringkasan template ditambahkan di akhir |
| `done` | sama dengan respons `/agent/chat` | Final dan otoritatif: `answer`, `viz`, `sources`, `tokens` |
| `error` | `{detail}` | Tampilkan pesan gagal |

`EventSource` bawaan browser tidak bisa mengirim header `X-API-Key`, jadi baca stream dengan `fetch`:

```ts
const res = await fetch(`${API}/agent/chat/stream`, {
  method: "POST",
  headers: { "Content-Type": "application/json", "X-API-Key": APP_KEY },
  body: JSON.stringify({ question, session_id }),
});
if (res.status === 429) { /* tunggu res.headers.get("Retry-After") detik */ }
const reader = res.body!.pipeThrough(new TextDecoderStream()).getReader();
let buf = "";
for (;;) {
  const { value, done } = await reader.read();
  if (done) break;
  buf += value;
  let i;
  while ((i = buf.indexOf("\n\n")) >= 0) {
    const block = buf.slice(0, i); buf = buf.slice(i + 2);
    const event = block.match(/^event: (.*)$/m)?.[1];
    const data = JSON.parse(block.match(/^data: (.*)$/m)?.[1] ?? "{}");
    onEvent(event, data);   // start | step | viz | token | reset | replace | done | error
  }
}
```

Contoh urutan nyata ("peringkat provinsi paling rawan kebakaran"): `start` 0,5 dtk → `step` list_metrics → `step` rank_regions → `viz` ranking 4,3 dtk → `token` mulai 6,6 dtk → `done` 7,4 dtk. Satu giliran selesai di bawah ±30 detik (batas proxy); kalau Gemini gagal atau angkanya ditolak penjaga angka, OpenRouter lalu DeepSeek melanjutkan dari kalimat terakhir yang sudah tampil (`done.models` mencatat penulisnya); bila semua gagal, ringkasan dari data ditambahkan di akhir.

`POST /api/agent/chat` (tanpa streaming) tetap ada, dengan hasil yang sama persis dengan `done`.

**Akun yang login.** Kirim header `Authorization: Bearer <token>` di request chat (sama seperti endpoint `/me`). Agent lalu tahu nama, profil pantauan aktif, dan wilayah pantauannya: "kondisi wilayah saya" atau "gempa di sekitar saya" memakai wilayah itu, dan skill `my_data` membaca alat IoT milik pengguna (status, tabel data, nilai terakhir, peringatan). Data publik wilayah lain tetap bisa ditanyakan dengan menyebut wilayahnya. Tanpa token, chat tetap berjalan untuk data publik; pertanyaan tentang "alat saya" dijawab dengan ajakan masuk. Token yang dikirim tetapi sudah tidak berlaku (kedaluwarsa 7 hari, password diganti) dijawab **401**, bukan diperlakukan sebagai tamu: tangani seperti 401 dari `/me` (akhiri sesi, minta masuk lagi). Sesi chat terikat ke akun yang memulainya: `session_id` milik akun lain diganti sesi baru, dan `GET /api/agent/sessions/{id}` hanya untuk pemiliknya.

**Bertanya balik.** Bila pertanyaan bisa berarti beberapa hal, Agent tidak menebak dan tidak memanggil LLM: `done` membawa `skill: "clarify"`, `answer` berisi pertanyaannya, dan `clarify = {question, options: [{label, question, description?}]}`; `description` menyebut isi pilihan itu (mis. data apa saja di dalam topik "Kualitas udara"), jadi pengguna tidak perlu bertanya "ada apa saja". Pemicunya: nama wilayah yang cocok ke beberapa wilayah ("Bandung" = kabupaten atau Kota Bandung, "Sulawesi" = lima provinsi), pertanyaan wilayah tanpa topik ("kondisi Riau": Ringkasan semua data, lalu tiap topik yang punya data untuk tingkat wilayah itu, masing-masing dengan isinya; "ringkas kondisi lingkungan Riau" atau "gambaran umum Riau" langsung dijawab dengan ringkasan semua data), kejadian tanpa jenis ("kejadian terbaru": gempa, titik panas, bencana lain), topik tanpa wilayah ("lihat data laut": tulis wilayahnya atau pilih peringkat nasional), peringkat tanpa metrik ("provinsi paling rawan": kebakaran, gempa, PM2.5, …), tren tanpa metrik atau wilayah ("trennya bagaimana?"), fasilitas tanpa jenis (pembangkit listrik atau halte TransJakarta), atau tabel data milik pengguna yang tidak disebut atau cocok dengan lebih dari satu tabel ("tabel dicha": "Dicha Suka NGOCOK" atau "Rumah Dicha"; nama boleh salah ketik). Tampilkan sampai 5 `options` sebagai tombol, lebih dari itu sebagai daftar bernomor dengan `description` di bawah tiap label; keduanya mengirim `option.question` dengan `session_id` yang sama, ditambah **Lainnya** yang memfokuskan kotak pertanyaan. Membalas dengan nomor pilihan ("2", "nomor 2") atau labelnya juga memilihnya. `clarify` juga bisa menyertai jawaban biasa sebagai tombol saran: setelah sapaan ("halo"), perkenalan ("kamu siapa", "bisa apa"), pertanyaan di luar topik, daftar alat IoT (satu tombol per tabel), atau ringkasan semua data satu wilayah (langkah lanjutan: tren kualitas udara, bandingkan dengan wilayah lain, titik panas, gempa, peringatan); tampilkan sama seperti pilihan tanya balik. Balasan bebas setelah langkah lanjutan dibaca sebagai pertanyaan baru. Pilihan yang diklik dikirim apa adanya dan dijawab sebagai pertanyaan utuh; balasan bebas yang singkat ("yang kota") otomatis melanjutkan pertanyaan tadi. Jawaban wilayah hanya memuat topik yang ditanyakan (`region_card` berisi metrik yang ditanyakan atau topiknya, dari pemahaman LLM atas pertanyaan, mis. "tinggi gelombang di Balikpapan" → hanya gelombang; data yang diminta tetapi kosong ada di `data.tidak_ada` beserta tingkat wilayah yang punya datanya) kecuali pengguna meminta semua data; "bagaimana di sana?" memakai topik sebelumnya.

**Menyebut dengan `@`.** Kolom chat boleh menyisipkan `@Token`, huruf dan angka saja, spasi diganti `_`. Tiga jenis: topik dengan kata topik Agent (`@udara`, `@cuaca`, `@kebakaran`, `@gempa`, `@air`, `@laut`, `@energi`, `@penduduk`, `@peringatan`); perangkat atau tabel milik pengguna (nama dari `GET /api/me/devices`, mis. `@Sensor_Balikpapan_01`); dan penerbit sumber data aktif dari `GET /api/sources`, paling banyak dua kata (`@BMKG`, `@NASA_FIRMS`). Token yang sama kata per kata dengan nama perangkat atau tabel pengguna selalu dijawab dari data alat itu, meski namanya sama dengan nama kota. Token lain dibaca sebagai kata biasa: `@udara di Riau` = "udara di Riau". `@` di tengah kata (email) bukan sebutan.

**Jenis `viz` yang belum dikenal UI.** Tampilkan keterangan "komponen belum tersedia" beserta data mentahnya, jangan diam-diam dilewati; jenis yang ada saat ini tercantum di [VIZ.md](VIZ.md).

## Catatan teknis

- **Kunci aplikasi.** Backend menerbitkan kunci untuk frontend (`app_…`). Proxy di sisi server frontend menambahkannya sebagai header `X-API-Key` di **setiap request**; kunci ini tidak pernah ada di kode browser. Tanpa kunci valid, semua endpoint `/api/*` menjawab 401, kecuali `/api/health` dan `/api/ingest`.
  - Kunci ini hanya membuka akses aplikasi, bukan data pribadi user. Setelah login, tambahkan `Authorization: Bearer <token>` untuk endpoint `/me/*`.
  - Kunci ini berbeda dari API key perangkat milik user (`dev_…`), yang hanya untuk mengirim data sensor.
  - Kalau kunci bocor, backend merotasinya (`POST /api/clients/{id}/rotate`); kunci lama berhenti bekerja dalam ±1 menit.
- Browser memanggil `/api` di origin frontend lewat proxy, sehingga tidak butuh CORS. Bila frontend memanggil API di domain lain secara langsung, domain itu harus ada di `CORS_ORIGINS` (lihat [Infra.md](Infra.md)).
- Jangan menaruh API key perangkat di kode frontend.
