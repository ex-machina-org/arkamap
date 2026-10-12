import { useEffect, useRef, useState } from "react";
import { chat, type StreamEvent } from "@/lib/api/stream";
import { validate, type DTO } from "@/lib/api/client";
import { SESSION_CHANGED } from "./use-session";

// Backend tool names (agent/tools.py) as progress text for the reader.
const TOOL_STEP: Record<string, string> = {
  list_metrics: "Melihat daftar metrik", find_region: "Mencari wilayah", region_summary: "Mengambil ringkasan wilayah",
  rank_regions: "Menghitung peringkat wilayah", events: "Mengambil data kejadian", alerts: "Mengambil data peringatan",
  guide: "Membaca panduan Arkamap", my_data: "Membaca data alat dan profil Anda",
};

// every Kodama question box carries this label, so "Lainnya" can put the cursor in whichever is on screen
export const ASK_INPUT_LABEL = "Pertanyaan untuk Kodama";

export type JevAnswer = { answer: string; step: string; viz: Record<string, unknown>[]; sources: unknown[]; fallback?: string | null;
  /** Set when Kodama asks back instead of guessing; `answer` holds its question. */
  clarify?: DTO<"Clarify"> | null };

export const EMPTY_JEV_ANSWER: JevAnswer = { answer: "", step: "", viz: [], sources: [] };

/** Folds one stream event into the answer so far. `done` replaces it with the validated final response. */
export function applyJevEvent(previous: JevAnswer, { event, data }: StreamEvent): JevAnswer {
  if (event === "done") {
    const final = validate("ChatResponse", data);
    return { step: "Selesai", answer: final.answer, viz: final.viz ?? [], sources: final.sources ?? [], fallback: final.fallback, clarify: final.clarify };
  }
  const value = data && typeof data === "object" && !Array.isArray(data) ? data as Record<string, unknown> : {};
  if (event === "step") return { ...previous, step: typeof value.tool === "string" ? `${TOOL_STEP[value.tool] ?? "Mengambil data"}...` : "Memproses data..." };
  if (event === "token" && typeof value.text === "string") return { ...previous, answer: previous.answer + value.text };
  if (event === "viz") return { ...previous, viz: [...previous.viz, value] };
  if (event === "reset") return { ...previous, answer: "" };
  if (event === "replace") return { ...previous, answer: typeof value.answer === "string" ? value.answer : "", viz: [] };
  return previous;
}

export function useJev() {
  const controller = useRef<AbortController | null>(null);
  const session = useRef(crypto.randomUUID());
  const busy = useRef(false);
  const [state, setState] = useState<JevAnswer & { busy: boolean; error?: string }>({ busy: false, ...EMPTY_JEV_ANSWER });
  useEffect(() => {
    const reset = () => { controller.current?.abort(); controller.current = null; busy.current = false; session.current = crypto.randomUUID(); setState({ busy: false, ...EMPTY_JEV_ANSWER }); };
    window.addEventListener(SESSION_CHANGED, reset);
    window.addEventListener("arkamap-session-expired", reset);
    return () => { controller.current?.abort(); window.removeEventListener(SESSION_CHANGED, reset); window.removeEventListener("arkamap-session-expired", reset); };
  }, []);
  async function ask(question: string) {
    if (!question.trim() || busy.current) return;
    busy.current = true;
    controller.current?.abort();
    const active = new AbortController(); controller.current = active;
    setState({ busy: true, ...EMPTY_JEV_ANSWER, step: "Kodama memproses permintaan..." });
    try {
      await chat(question, session.current, event => {
        if (active.signal.aborted) return;
        if (event.event === "done") {
          setState({ busy: false, ...applyJevEvent(EMPTY_JEV_ANSWER, event) });
          return;
        }
        setState(previous => ({ ...previous, ...applyJevEvent(previous, event) }));
      }, active.signal);
    } catch (cause) {
      if (controller.current === active) setState(previous => ({ ...previous, busy: false, error: active.signal.aborted ? "Permintaan dibatalkan; jawaban belum final." : cause instanceof Error ? cause.message : "Kodama tidak tersedia." }));
    } finally { if (controller.current === active) busy.current = false; }
  }
  return { ...state, ask, cancel: () => controller.current?.abort() };
}
