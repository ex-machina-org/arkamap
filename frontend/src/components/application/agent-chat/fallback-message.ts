/** Why the backend answered without Gemini, in words a reader can act on. */
export function fallbackMessage(reason: string) {
  if (/tidak diset/i.test(reason)) return "Gemini belum dikonfigurasi di server, jadi jawaban disusun langsung dari data.";
  if (/batas token sesi/i.test(reason)) return "Batas pemakaian AI untuk sesi ini tercapai. Jawaban disusun langsung dari data; muat ulang halaman untuk sesi baru.";
  if (/LLM gagal/i.test(reason)) return "Gemini sedang tidak tersedia atau kuota gratisnya habis. Jawaban disusun langsung dari data; coba lagi beberapa saat lagi.";
  return "Jawaban AI tidak lolos pemeriksaan angka, jadi jawaban disusun langsung dari data.";
}
