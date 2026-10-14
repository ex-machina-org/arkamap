import { RiBrainLine, RiCompass3Line, RiRouteLine, RiSparkling2Line } from "@remixicon/react";
import type { ComposerProvider } from "@/components/application/agent-chat/agent-composer";

/** The models behind Kodama, in the order the backend tries them. */
export const KODAMA_PROVIDERS: ComposerProvider[] = [
  { id: "gemini", name: "Gemini", role: "Menyusun jawaban utama", icon: RiSparkling2Line },
  { id: "openrouter", name: "OpenRouter", role: "Cadangan bila Gemini tidak tersedia", icon: RiRouteLine },
  { id: "deepseek", name: "DeepSeek", role: "Cadangan terakhir", icon: RiBrainLine },
  { id: "jev", name: "Jev", role: "Memilih keahlian bila model lain gagal", icon: RiCompass3Line },
];

export const KODAMA_DATA_NOTE = "Angka dan data selalu berasal dari basis data Arkamap; model hanya merangkai jawabannya.";
