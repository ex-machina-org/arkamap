import { RiDeepseekLine, RiGeminiLine, RiInfinityLine, RiRouteLine } from "@remixicon/react";
import type { ComposerProvider } from "@/components/application/agent-chat/agent-composer";

/**
 * The AI models behind Kodama's answers, as the backend uses them (backend/app/config.py defaults;
 * the deployment may change them through env). Shown under the composer, each with its own mark,
 * so a reader knows who answers. Remix has no OpenRouter mark: its route icon stands in.
 */
export const KODAMA_MODELS: ComposerProvider[] = [
  { name: "Gemini", icon: RiGeminiLine, title: "Gemini 3.1 Flash Lite: memahami pertanyaan dan menulis jawaban" },
  { name: "OpenRouter", icon: RiRouteLine, title: "OpenRouter: cadangan saat Gemini gagal (Gemma 4 31B, Nemotron 3 Super, lalu Gemini Flash Lite untuk menulis)" },
  { name: "DeepSeek", icon: RiDeepseekLine, title: "DeepSeek V4 Flash: cadangan terakhir" },
  { name: "Jev", icon: RiInfinityLine, title: "Jev 1.13: memilih jenis jawaban bila semua model di atas gagal" },
];
