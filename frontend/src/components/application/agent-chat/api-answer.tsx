import { useState } from "react";
import { DataFacts } from "./data-facts";
import { fallbackMessage } from "./fallback-message";
import { MarkdownText } from "./markdown-text";
import { VizRenderer } from "./viz-renderer";
import { Button } from "@/components/base/buttons/button";
import { Alert } from "@/components/ui/alert";
import { ShimmerText } from "@/components/ui/shimmer-text";
import type { DTO } from "@/lib/api/client";
import { ASK_INPUT_LABEL } from "@/hooks/use-jev";


/** Kodama asked back: one button per reading it could mean, plus "Lainnya" to say it in your own words. */
function ClarifyChoices({ clarify, onAsk }: { clarify: DTO<"Clarify">; onAsk: (question: string) => void }) {
  const [other, setOther] = useState(false);
  return <div className="flex flex-col gap-2">
    <div role="group" aria-label="Pilihan maksud pertanyaan" className="flex flex-wrap gap-2">
      {clarify.options.map((option, index) => <Button key={option.question} size="small" variant="secondary" onClick={() => onAsk(option.question)}>
        {`${String.fromCharCode(65 + index)}. ${option.label}`}
      </Button>)}
      <Button size="small" variant="ghost" onClick={() => { setOther(true); document.querySelector<HTMLInputElement>(`[aria-label="${ASK_INPUT_LABEL}"]`)?.focus(); }}>Lainnya…</Button>
    </div>
    {other && <p className="text-caption-1 text-text-secondary">Tulis maksud Anda lebih detail di kotak pertanyaan; Kodama melanjutkan dari pertanyaan tadi.</p>}
  </div>;
}

export function ApiAnswer({ answer, viz, sources, busy, step, error, fallback, clarify, onCancel, onEvents, ask }: {
  answer: string; viz: Record<string, unknown>[]; sources: unknown[]; busy: boolean; step?: string; error?: string; fallback?: string | null;
  clarify?: DTO<"Clarify"> | null; onCancel: () => void; onEvents?: (geojson: unknown) => void; ask?: (question: string) => void;
}) {
  if (!busy && !error && !answer && viz.length === 0) return null;
  return <section aria-label="Jawaban Kodama" aria-live="polite" className="flex flex-col gap-3 rounded-xl border border-border-button-default bg-background-primary-default p-4">
    {busy && <div className="flex items-center justify-between gap-2">
      <ShimmerText className="text-body-compact">{step || "Memproses..."}</ShimmerText>
      <Button size="small" variant="secondary" onClick={onCancel}>Batalkan</Button>
    </div>}
    {error && <Alert tone="danger" title="Jawaban belum selesai">{error}</Alert>}
    {!busy && fallback && <Alert tone="info" title="Dijawab tanpa AI">{fallbackMessage(fallback)}</Alert>}
    {answer && <MarkdownText text={answer} />}
    {!busy && clarify && ask && <ClarifyChoices key={answer} clarify={clarify} onAsk={question => void ask(question)} />}
    {!busy && viz.map((item, index) => <VizRenderer key={index} viz={item} onEvents={onEvents} />)}
    {sources.length > 0 && <details className="text-body-compact text-text-secondary"><summary className="cursor-pointer">Sumber jawaban ({sources.length})</summary><DataFacts value={sources} /></details>}
  </section>;
}
