import { useEffect, useState, type ComponentType, type ReactNode } from "react";
import type { UIMessage } from "ai";
import { motion } from "motion/react";
import { RiArrowRightSLine, RiCheckLine, RiFileCopyLine, RiLightbulbLine, RiRefreshLine, RiSearchLine } from "@remixicon/react";
import { fallbackMessage } from "@/components/application/agent-chat/fallback-message";
import { DataFacts } from "@/components/application/agent-chat/data-facts";
import { MarkdownText } from "@/components/application/agent-chat/markdown-text";
import { VizRenderer } from "@/components/application/agent-chat/viz-renderer";
import { Tooltip, TooltipTrigger } from "@/components/base/tooltip/tooltip";
import { Alert } from "@/components/ui/alert";
import { useSmoothText } from "@/hooks/use-smooth-text";
import { cx } from "@/utils/cx";
import { JevChoices } from "./jev-choices";
import { jevReply } from "./jev-transport";

/** Rows that arrive after the text (summaries, charts, actions) fade in the same way, but faster. */
function Arrive({ animate, children }: { animate: boolean; children: ReactNode }) {
  return <motion.div initial={animate ? { opacity: 0, filter: "blur(4px)", y: 4 } : false} animate={{ opacity: 1, filter: "blur(0px)", y: 0 }}
    transition={{ type: "spring", duration: 0.3, bounce: 0 }}>{children}</motion.div>;
}

/** A one-line summary that opens into its detail, like "Berpikir selama 4 detik ›". */
function Disclosure({ icon: Icon, summary, children }: { icon: ComponentType<{ className?: string }>; summary: ReactNode; children: ReactNode }) {
  const [open, setOpen] = useState(false);
  return <div className="flex flex-col gap-2">
    <button type="button" aria-expanded={open} onClick={() => setOpen(value => !value)}
      className="flex w-fit cursor-pointer items-center gap-2 rounded-md text-body-regular text-text-secondary outline-none transition-colors hover:text-text-primary focus-visible:ring-2 focus-visible:ring-border-focus-ring">
      <Icon className="size-4.5 shrink-0 text-foreground-icon-secondary" />
      <span>{summary}</span>
      <RiArrowRightSLine className={cx("size-4 shrink-0 text-foreground-icon-tertiary transition-transform", open && "rotate-90")} />
    </button>
    {open && <div className="ml-1.75 text-body-compact text-text-secondary">{children}</div>}
  </div>;
}

function ReplyAction({ label, icon: Icon, onClick }: { label: string; icon: ComponentType<{ className?: string }>; onClick: () => void }) {
  return <TooltipTrigger delay={300}>
    <button type="button" aria-label={label} onClick={onClick}
      className="flex size-8 cursor-pointer items-center justify-center rounded-lg text-foreground-icon-tertiary outline-none transition-colors hover:bg-background-primary-hover hover:text-foreground-icon-secondary focus-visible:ring-2 focus-visible:ring-border-focus-ring">
      <Icon className="size-4" />
    </button>
    <Tooltip>{label}</Tooltip>
  </TooltipTrigger>;
}

function CopyAction({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);
  useEffect(() => {
    if (!copied) return;
    const timer = setTimeout(() => setCopied(false), 1600);
    return () => clearTimeout(timer);
  }, [copied]);
  return <ReplyAction label={copied ? "Tersalin" : "Salin jawaban"} icon={copied ? RiCheckLine : RiFileCopyLine}
    onClick={() => void navigator.clipboard.writeText(text).then(() => setCopied(true), () => {})} />;
}

/** One Jev turn: how it was reached, the answer, and what can be done with it. */
export function JevReply({ message, streaming, onRetry, onEvents, onAsk }: {
  message: UIMessage; streaming: boolean; onRetry?: () => void; onEvents?: (geojson: unknown) => void;
  /** Sends a picked choice as the next question; given only to the latest reply, so older choices stay read-only. */
  onAsk?: (question: string) => void;
}) {
  const reply = jevReply(message);
  const smooth = useSmoothText(reply?.answer ?? "", streaming);
  if (!reply || (!reply.answer && (reply.viz?.length ?? 0) === 0)) return null;
  const seconds = reply.finishedAt ? Math.max(1, Math.round((reply.finishedAt - reply.startedAt) / 1000)) : undefined;
  // Charts and actions wait for the text, so nothing lands below a sentence still being written.
  // Waiting on the stream too: between chunks (or before the first one) the reveal has caught up, yet text is still coming.
  const settled = !streaming && !smooth.revealing;
  return <div className="group/reply flex flex-col gap-3 px-1">
    {seconds !== undefined && (reply.steps?.length ?? 0) > 0 && <Arrive animate={smooth.animated}><Disclosure icon={RiLightbulbLine} summary={`Berpikir selama ${seconds} detik`}>
      <ol className="flex flex-col gap-1.5 border-l border-separator-border pl-4">{reply.steps.map(step => <li key={step} className="flex items-center gap-2">
        <RiCheckLine className="size-3.5 shrink-0 text-accent-600 dark:text-accent-400" aria-hidden />{step.replace(/\.\.\.$/, "")}
      </li>)}</ol>
    </Disclosure></Arrive>}
    {(reply.sources?.length ?? 0) > 0 && <Arrive animate={smooth.animated}><Disclosure icon={RiSearchLine} summary={`${reply.sources.length} sumber`}>
      <DataFacts value={reply.sources} />
    </Disclosure></Arrive>}
    {reply.fallback && <Arrive animate={smooth.animated}><Alert tone="info" title="Dijawab tanpa AI">{fallbackMessage(reply.fallback)}</Alert></Arrive>}
    {smooth.text && <MarkdownText text={smooth.text} animate={smooth.animated} />}
    {settled && reply.viz?.map((item, index) => <Arrive key={index} animate={smooth.animated}><VizRenderer viz={item} onEvents={onEvents} /></Arrive>)}
    {settled && onAsk && reply.clarify && (reply.clarify.options?.length ?? 0) > 0 && <Arrive animate={smooth.animated}>
      <JevChoices question={reply.clarify.question} options={reply.clarify.options} onAsk={onAsk} />
    </Arrive>}
    {settled && !streaming && reply.finishedAt && <Arrive animate={smooth.animated}><div className="-ml-1.5 flex items-center gap-0.5">
      <CopyAction text={reply.answer} />
      {onRetry && <ReplyAction label="Ulangi jawaban" icon={RiRefreshLine} onClick={onRetry} />}
    </div></Arrive>}
  </div>;
}
