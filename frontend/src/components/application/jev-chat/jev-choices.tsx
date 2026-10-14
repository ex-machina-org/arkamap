import { useState } from "react";
import { Button } from "@/components/base/buttons/button";

type Choice = { label: string; question: string; description?: string | null };

/** At most this many choices read as buttons; more read as a list, each with what it holds. */
const BUTTONS_UP_TO = 5;

/**
 * What Kodama offers to do next, or the readings it asks you to pick from. A few choices are
 * buttons; many are a numbered list where each row says what is inside, so nobody has to ask
 * "what is there?". "Lainnya" hands over to the message box for anything else; typing a
 * choice's number there picks it too.
 */
export function JevChoices({ question, options, onAsk }: { question?: string; options: Choice[]; onAsk: (question: string) => void }) {
  const [other, setOther] = useState(false);
  const writeOwn = () => {
    setOther(true);
    document.getElementById("agent-composer-input")?.focus();
  };
  const few = options.length <= BUTTONS_UP_TO;
  return <div className="flex flex-col gap-2">
    {few ? <div role="group" aria-label={question ?? "Pilihan"} className="flex flex-wrap gap-2">
      {options.map(option => <Button key={option.question} size="small" variant="secondary" title={option.description ?? undefined}
        onClick={() => onAsk(option.question)}>{option.label}</Button>)}
      <Button size="small" variant="ghost" onClick={writeOwn}>Lainnya…</Button>
    </div> : <ol aria-label={question ?? "Pilihan"} className="flex flex-col gap-1">
      {options.map((option, index) => <li key={option.question}>
        <button type="button" onClick={() => onAsk(option.question)}
          className="flex w-full cursor-pointer items-start gap-3 rounded-lg px-2 py-1.5 text-left outline-none transition-colors hover:bg-background-primary-hover focus-visible:ring-2 focus-visible:ring-border-focus-ring">
          <span className="mt-px w-4 shrink-0 text-right text-caption-1 tabular-nums text-text-tertiary">{index + 1}</span>
          <span className="min-w-0">
            <span className="block text-body-compact text-text-primary">{option.label}</span>
            {option.description && <span className="block text-caption-1 text-text-secondary">{option.description}</span>}
          </span>
        </button>
      </li>)}
      <li><button type="button" onClick={writeOwn}
        className="flex w-full cursor-pointer items-center gap-3 rounded-lg px-2 py-1.5 text-left text-body-compact text-text-secondary outline-none transition-colors hover:bg-background-primary-hover focus-visible:ring-2 focus-visible:ring-border-focus-ring">
        <span className="w-4 shrink-0" aria-hidden />Lainnya… tulis sendiri
      </button></li>
    </ol>}
    {other ? <p className="text-caption-1 text-text-secondary">Tulis maksudmu di kotak pesan; Kodama melanjutkan dari pertanyaan tadi.</p>
      : !few && <p className="text-caption-1 text-text-tertiary">Pilih salah satu, atau balas dengan nomornya.</p>}
  </div>;
}
