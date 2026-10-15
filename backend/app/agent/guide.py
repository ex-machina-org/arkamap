"""How-to answers about Arkamap itself, for questions that need no data.

The Agent answers these from this text only (skill "guide"): it is the tool
result, so the number guard checks the answer against it like any other
data, and without the model the text itself is the answer. Keep it in step
with the product: a step written here is a step the UI must have.
"""
import re

from .. import panels
from . import catalog

# topic -> (title, when (for the router), keywords (fallback routing), text)
TOPICS: dict[str, tuple[str, str, tuple[str, ...], str]] = {
    # ties in pick() go to the earlier topic: most specific first
    "iot_mqtt": (
        "Mengirim lewat MQTT",
        "Mengirim data sensor lewat MQTT: alamat broker, username, password, topik.",
        ("mqtt", "broker", "topik", "topic", "websocket", "wss", "paho", "raspberry", "gateway"),
        "MQTT cocok untuk Raspberry Pi atau gateway; mikrokontroler (ESP32/ESP8266) sebaiknya memakai HTTP.\n"
        "- Alamat: WebSocket dengan TLS, wss://<domain>/api/mqtt.\n"
        "- Username: username MQTT alat (mis. dev42); password: Kunci API alat.\n"
        "- Topik: topik milik alat itu sendiri (mis. ingest/dev42), satu-satunya topik yang boleh dipakai.\n"
        "- QoS 1 disarankan, keepalive 60 detik.\n"
        "Isi pesan sama dengan HTTP: {\"nama\", \"waktu\", \"data\"}. Pesan MQTT yang salah format tidak "
        "dibalas, jadi uji payload lewat HTTP dulu; alasan penolakan terakhir tampil di halaman alat. "
        "Semua nilai di atas ada di tab Pengaturan alat.",
    ),
    "iot_masalah": (
        "Data alat tidak masuk atau bermasalah",
        "Data sensor tidak masuk, kiriman ditolak, peringatan format, alat offline, kunci bocor, menghapus data salah.",
        ("tidak masuk", "gak masuk", "ga masuk", "belum masuk", "ditolak", "error", "gagal", "400", "401",
         "429", "offline", "peringatan", "bocor", "hapus", "salah", "masalah", "kenapa"),
        "Cek di halaman alat (tab Ringkasan):\n"
        "- Kiriman Terakhir Ditolak menampilkan alasan penolakan terakhir. Balasan 400 = format salah "
        "(mis. tanpa bungkus \"data\"), 401 = Kunci API salah atau sudah dicabut, 429 = terlalu cepat "
        "(lebih dari 1 kiriman per detik).\n"
        "- Format Kiriman Belum Lengkap muncul bila kiriman tanpa \"nama\" atau \"waktu\". Selama masa "
        "transisi data itu tetap disimpan (tabel Tanpa Nama, waktu diterima server); lengkapi agar rapi.\n"
        "- Status Online berarti alat mengirim dalam 15 menit terakhir.\n"
        "- Uji kunci dan format dengan ?dry_run=true pada URL HTTP.\n"
        "Kunci bocor: buat kunci baru lewat Ganti Kunci di tab Pengaturan; kunci lama langsung tidak "
        "berlaku. Data salah (uji coba, kalibrasi) bisa dihapus lewat Hapus Pembacaan di tab Pengaturan; "
        "penghapusan tidak bisa dibatalkan.",
    ),
    "iot_tabel": (
        "Tabel data dan versi",
        "Bagaimana data alat dikelompokkan: tabel per nama, versi saat alat ditambah sensor, menggabung atau mengganti nama tabel.",
        ("tabel", "versi", "v1", "v2", "kelompok", "pisah", "memisah", "gabung", "menggabung",
         "upgrade", "sensor baru", "tambah sensor", "riwayat"),
        "Arkamap mengelompokkan kiriman satu alat ke dalam tabel data berdasarkan \"nama\":\n"
        "- Nama sama = tabel sama. Nama dibandingkan tanpa beda huruf besar/kecil dan spasi, jadi "
        "\"Cuaca Luar\" sama dengan \"cuaca_luar\". Maksimal 10 nama per alat.\n"
        "- Nama sama tetapi membawa field yang belum pernah ada (mis. alat ditambah anemometer) menjadi "
        "versi baru tabel itu: v1.0, v2.0, dan seterusnya. Field yang kadang kosong tidak membuat versi baru.\n"
        "- Nama berbeda = tabel berbeda, walaupun field-nya sama.\n"
        "Di halaman alat, tab Riwayat Kiriman menampilkan pilihan Tabel Data dan Versi: Semua Data atau "
        "satu versi saja. Kiriman tanpa \"nama\" masuk ke tabel Tanpa Nama.\n"
        "Nama tampilan tabel bisa diganti tanpa mengubah \"nama\" yang dikirim sensor. Dua tabel bisa "
        "digabung; nama tabel yang digabung tetap diterima dan masuk ke tabel tujuan.",
    ),
    "iot_kirim": (
        "Format kiriman data sensor",
        "Format/template JSON kiriman sensor, field wajib, contoh kode, HTTP ingest, aturan dan batas kiriman.",
        ("format", "template", "json", "payload", "kirim", "mengirim", "contoh kode", "esp32", "arduino",
         "python", "curl", "http", "ingest", "field", "wajib", "waktu", "dry_run", "dry run"),
        "Setiap kiriman, lewat HTTP maupun MQTT, wajib berbentuk:\n"
        "{\"nama\": \"cuaca\", \"waktu\": \"2026-10-01T08:00:00+07:00\", \"data\": {\"suhu\": 29.4, \"kelembapan\": 71}}\n"
        "- nama: nama tabel data. Data beda jenis beri nama beda; data yang sama selalu dengan nama yang sama.\n"
        "- waktu: waktu ukur dari sensor, ISO 8601 (tanpa zona dianggap WIB) atau detik Unix. Waktu lebih "
        "dari 10 menit di masa depan ditolak.\n"
        "- data: isi bebas (angka, teks, true/false, list). Objek bersarang diratakan, mis. "
        "{\"baterai\": {\"volt\": 3.9}} menjadi baterai.volt.\n"
        "HTTP: POST ke /api/ingest dengan header X-API-Key berisi Kunci API alat dan Content-Type "
        "application/json. Balasan 202 berarti diterima. Tambahkan ?dry_run=true untuk menguji tanpa menyimpan.\n"
        "Batas: 16 KB per kiriman, 100 field, 1 kiriman per detik per alat. Kiriman yang sama persis "
        "(nama, data, dan waktu sama) dianggap kiriman ulang: tetap dibalas 202 tetapi tidak disimpan dua kali.\n"
        "Contoh kode siap tempel yang sudah berisi URL dan kunci ada di tab Pengaturan alat, termasuk "
        "pembuat template: isi nama tabel dan daftar field, lalu sensor cukup mengganti nilainya.",
    ),
    "iot_tambah": (
        "Menambahkan alat IoT",
        "Cara mendaftarkan/menambah alat IoT atau sensor sendiri dan mendapatkan API key.",
        ("tambah", "menambah", "daftar", "mendaftar", "pasang", "memasang", "hubung", "sambung",
         "api key", "kunci api", "alat baru", "perangkat baru", "byod"),
        "Langkah menambahkan alat IoT ke Arkamap:\n"
        "1. Masuk ke akunmu, lalu buka menu Perangkat IoT & BYOD dan pilih Tambah Alat.\n"
        "2. Isi identitas alat: Nama Alat dan Jenis Alat (keduanya membantumu mengenali alat), "
        "lalu Lokasi Pemasangan lewat lokasi saat ini atau klik di peta. Info tambahan (ID atau nomor "
        "seri, kepemilikan, pemilik) opsional.\n"
        "3. Setelah disimpan, Kunci API alat tampil satu kali beserta contoh kode (ESP32/Arduino, "
        "Python, curl, MQTT). Salin dan simpan sekarang; server hanya menyimpan hash-nya.\n"
        "4. Uji dulu tanpa menyimpan: kirim ke URL ingest dengan ?dry_run=true. Hasilnya menunjukkan "
        "kunci valid atau tidak dan field apa saja yang terbaca.\n"
        "5. Pasang kode di sensor. Data mulai tampil di halaman alat dan di dashboard.\n"
        "Satu alat fisik di satu lokasi = satu alat terdaftar = satu Kunci API, karena lokasi, status "
        "online, batas kiriman, dan pencabutan kunci melekat ke alat. Satu alat yang membawa beberapa "
        "modul sensor cukup satu kunci dengan \"nama\" berbeda per jenis data. Kunci yang hilang tidak "
        "bisa dilihat lagi; buat kunci baru lewat Ganti Kunci di tab Pengaturan alat (kunci lama "
        "langsung tidak berlaku).",
    ),
    "akun": (
        "Akun dan sesi",
        "Daftar akun, masuk, keluar, sesi login, ganti atau lupa password.",
        ("akun", "login", "masuk", "keluar", "logout", "sesi", "password", "kata sandi", "sandi", "lupa",
         "registrasi", "sign up", "signup"),
        "- Daftar dan masuk dengan email dan password lewat tombol Masuk.\n"
        "- Sesi berlaku di tab browser tempat kamu masuk: tetap bertahan saat halaman dimuat ulang, "
        "tetapi tab baru atau tab yang ditutup perlu masuk lagi.\n"
        "- Keluar menghapus sesi di tab itu.\n"
        "- Mengganti password membatalkan semua sesi lama.\n"
        "- Pemulihan password belum tersedia; hubungi administrator.",
    ),
    "dashboard": (
        "Dashboard dan profil pantauan",
        "Cara memakai dashboard, profil pantauan (Kenalan), mode Protected/Responden/Plan, peta, berbagi alat ke komunitas.",
        ("dashboard", "profil", "kenalan", "mode", "protected", "responden", "plan", "peta", "map",
         "komunitas", "berbagi", "share", "wilayah pantauan", "widget", "panel", "grafik", "chart",
         "atur tampilan", "tambah widget"),
        "Dashboard akun menyesuaikan diri dengan profil pantauan. Buat profil lewat Tambah Profil di pilihan "
        "profil: tulis peran dan masalah yang ingin diatasi, pilih wilayahnya, lalu pilih mode sendiri "
        "atau biarkan AI memilih:\n"
        "- Protected (tanggap darurat): kejadian terbaru, lokasi dan penduduk terdampak, peringatan yang "
        "sedang berlaku.\n"
        "- Responden (pencegahan): tingkat risiko sekarang, prakiraan 1-3 hari, dan wilayah yang perlu "
        "perhatian lebih dulu.\n"
        "- Plan (perencanaan): prakiraan hujan 30 hari, pola musiman, kerawanan jangka panjang, dan "
        "riwayat kejadian setahun terakhir.\n"
        "Bagian atas dashboard berisi kartu ringkasan (mode, kejadian, peringatan; angka alat IoT bila "
        "punya alat). Di bawahnya panel yang dipilih AI dari penjelasan profil, lalu peta, sorotan, tabel "
        "indikator, dan grafik sensor per tabel data. Isi panel selalu wilayah profil; bentuknya tetap.\n"
        "Panel yang bisa dipasang (Atur Tampilan > Tambah Widget, dikelompokkan per tema; panel tanpa data "
        "untuk wilayah profil tidak bisa ditambah):\n"
        + "\n".join(f"- {p['title']}: {p['description']}" for p in panels.catalogue()) + "\n"
        "Atur Tampilan juga bisa memindah, mengubah ukuran, mengganti judul, dan menghapus widget; "
        "Kembalikan Bawaan memulihkan susunan AI. Map publik bisa dipakai tanpa akun.\n"
        "Alat yang sudah punya lokasi bisa diajukan ke komunitas dari tab Pengaturan alat; setelah "
        "disetujui admin, alat dan bacaan terbarunya tampil publik di peta.",
    ),
    "data_metrik": (
        "Data yang tersedia, arti skor, dan sumber data",
        "Data apa saja yang bisa dilihat di Arkamap, arti skor perhatian, metrik/indikator, label MODEL, sumber data, "
        "dan keterbatasan data (tanpa meminta angka wilayah tertentu).",
        ("data apa", "apa saja", "apa aja", "tersedia", "bisa dilihat", "dapat dilihat", "bisa saya lihat",
         "dapat saya lihat", "arti", "maksud", "apa itu", "skor", "metrik", "indikator", "model", "estimasi",
         "sumber", "akurat", "dari mana", "metodologi", "dihitung"),
        # what exists comes from the database, via the catalog in AGENT.md
        catalog.data() + "\n\n"
        "Cara membaca datanya:\n"
        "- Skor perhatian 0-100: makin tinggi makin perlu perhatian. Skor relatif antarwilayah, bukan "
        "probabilitas bencana.\n"
        "- Nilai berlabel MODEL adalah estimasi model, bukan pengukuran langsung.\n"
        "- Gempa dan titik panas adalah kejadian tercatat, bukan prediksi.\n"
        "- Tidak ada data jumlah kendaraan: NO2 dan kepadatan jalan hanya proksi lalu lintas; NO2 tinggi di "
        "wilayah yang terbakar berasal dari asap.\n"
        "- Data jalan dan fasilitas dari OpenStreetMap bisa belum lengkap.\n"
        "- Data sensor milik pengguna hanya dibandingkan dengan metrik wilayah yang satuannya sama.\n"
        "Setiap angka di Arkamap menyebut sumber dan periodenya.",
    ),
    "umum": (
        "Tentang Arkamap dan asisten",
        "Apa itu Arkamap, apa yang bisa dilakukan asisten ini, fitur apa saja yang ada.",
        ("arkamap", "fitur", "bisa apa", "kamu siapa", "kamu bisa", "asisten", "bantuan", "help", "jev"),
        "Arkamap memetakan data lingkungan Indonesia per wilayah: risiko kebakaran, gempa, titik panas, "
        "bencana, kualitas udara, air, laut, energi, penduduk, dan kesejahteraan, ditambah data dari alat IoT "
        "milik pengguna.\n"
        "Asistennya bernama Kodama, dari kodama, roh penjaga pohon dalam cerita rakyat Jepang. Kodama bisa: "
        "menjelaskan kondisi satu wilayah per topik, membuat peringkat wilayah, melaporkan kejadian terbaru "
        "(gempa, titik panas, bencana) dan peringatan aktif, menunjukkan tren satu data di satu wilayah, "
        "mencari pembangkit listrik dan halte TransJakarta, menampilkan data alat IoT pengguna yang login "
        "(daftar alat, isi tabel, rata-rata dan riwayat sensor), serta menjelaskan cara memakai Arkamap. "
        "Angka selalu diambil dari data Arkamap, tidak dikarang.",
    ),
}

# Kodama's own words for small talk, introductions and questions outside Arkamap: written here, without a
# model call, in the voice of PERSONA.md (keep the two in step).
def _hi(name: str | None) -> str:
    return f", {name.split()[0]}" if name and name.strip() else ""


def greeting(name: str | None, signed_in: bool) -> str:
    iot = ", juga data alat IoT-mu" if signed_in else ". Kalau mau lihat data alat IoT-mu, masuk dulu ya"
    return (f"Halo{_hi(name)}! Aku Kodama, asisten di Arkamap. Aku bisa bantu membaca data lingkungan Indonesia: "
            f"kondisi wilayah, peringkat, gempa dan titik panas terbaru, serta peringatan yang berlaku{iot}. "
            "Mau mulai dari mana?")


def thanks(name: str | None) -> str:
    return f"Sama-sama{_hi(name)}! Kalau masih ada yang mau dicek, tanya saja."


def intro(signed_in: bool) -> str:
    iot = ("Data alat IoT-mu: daftar alat dan tabel, isi tabel, rata-rata dan riwayat sensor" if signed_in
           else "Data alat IoT-mu, setelah kamu masuk (login)")
    return ("Aku Kodama, asisten AI di Arkamap. Namaku dari kodama, roh penjaga pohon dalam cerita rakyat Jepang: "
            "tugasku ikut menjaga lingkungan dengan membantumu membaca data di peta ini.\n\n"
            "Yang bisa kubantu:\n"
            "- Kondisi satu wilayah, misalnya \"kualitas udara di Riau\"\n"
            "- Peringkat wilayah, misalnya \"provinsi paling rawan kebakaran\"\n"
            "- Kejadian dan peringatan terbaru, misalnya \"gempa terbaru\"\n"
            "- Tren dan fasilitas, misalnya \"tren PM2.5 di Riau\" atau \"pembangkit listrik di Jawa Timur\"\n"
            f"- {iot}\n"
            "- Cara memakai Arkamap, misalnya \"cara menambahkan alat IoT\"\n\n"
            "Angka yang kusebut selalu dari data Arkamap, bukan karangan. Coba salah satu di bawah.")


def ready() -> str:
    return "Siap! Mau tanya apa? Ini beberapa yang bisa langsung kucek."


def declined() -> str:
    return "Oke, tidak apa-apa. Kalau nanti butuh data lain, tanya saja."


def off_topic(signed_in: bool) -> str:
    iot = ", data alat IoT-mu," if signed_in else ""
    return (f"Hmm, itu di luar yang bisa kubantu. Aku fokus ke data lingkungan Indonesia di Arkamap{iot} dan cara "
            "memakai platform ini. Mau coba salah satu ini?")


SIGN_IN = ("Untuk melihat data alat IoT dan profil pantauanmu, masuk (login) dulu lewat tombol Masuk. Sementara itu, "
           "aku tetap bisa menjawab data publik, misalnya \"kondisi Riau\" atau \"gempa terbaru\".")


def pick(q: str) -> str:
    """Topic by keyword hits; the LLM planner's pick overrides this."""
    ql = " " + re.sub(r"\s+", " ", q.lower()) + " "
    scores = {t: sum(k in ql for k in v[2]) for t, v in TOPICS.items()}
    best = max(scores, key=scores.get)
    return best if scores[best] else "umum"


def guide(topic: str) -> dict:
    title, _, _, text = TOPICS[topic if topic in TOPICS else "umum"]
    return {"tool": "guide", "data": {"topic": topic, "title": title, "text": text},
            "viz": None, "sources": ["arkamap_guide"]}
