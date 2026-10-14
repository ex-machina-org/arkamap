import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useChat } from "@ai-sdk/react";
import { RiCloseLine, RiEditBoxLine, RiExpandDiagonalLine } from "@remixicon/react";
import { AgentComposer } from "@/components/application/agent-chat/agent-composer";
import { useMentions } from "./use-mentions";
import { saveThread } from "@/components/application/agent-chat/thread-store";
import { Tooltip, TooltipTrigger } from "@/components/base/tooltip/tooltip";
import { cx } from "@/utils/cx";
import { JevReply } from "./jev-reply";
import { JEV_THREADS_KEY } from "./jev-storage";
import { JevThinking } from "./jev-thinking";
import { jevMessageText, JevTransport } from "./jev-transport";
import { KodamaMark } from "@/components/foundations/brand/kodama-icon";
import "./jev-floating.css";

const SUGGESTIONS = ["Wilayah mana yang paling perlu perhatian?", "Ringkas peringatan aktif hari ini"];

function HeaderAction({ label, icon: Icon, onClick, href }: { label: string; icon: typeof RiCloseLine; onClick?: () => void; href?: string }) {
  const className = "flex size-8 cursor-pointer items-center justify-center rounded-lg text-foreground-icon-secondary outline-none transition-colors hover:bg-background-primary-hover hover:text-foreground-icon-primary focus-visible:ring-2 focus-visible:ring-border-focus-ring";
  return <TooltipTrigger delay={300}>
    {href ? <a href={href} aria-label={label} className={className}><Icon className="size-4.5" aria-hidden /></a>
      : <button type="button" aria-label={label} onClick={onClick} className={className}><Icon className="size-4.5" aria-hidden /></button>}
    <Tooltip>{label}</Tooltip>
  </TooltipTrigger>;
}

function newThreadId() {
  return globalThis.crypto?.randomUUID?.() ?? `t-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

/**
 * Kodama, answering through the Jev model, beside any workspace page. Conversations land in the same history as the
 * full chat page, so "Buka halaman penuh" continues the thread there.
 *
 * `floating` is the compact, Siri-like card the map centres above its dock: it is only as tall as its content, an
 * empty chat is one row of suggestions over the composer, and the screen edges glow while Kodama is working.
 */
export function JevAssistantPanel({ onClose, className, request, onEvents, variant = "panel", suggestions = SUGGESTIONS, placeholder = "Tanyakan apa saja ke Kodama" }: {
  onClose: () => void;
  className?: string;
  variant?: "panel" | "floating";
  /** Questions about what the host page shows; the generic pair otherwise. */
  suggestions?: string[];
  placeholder?: string;
  /** A question asked from elsewhere on the page, such as "Tanya Kodama" on the map. A new id sends it. */
  request?: { id: number; text: string };
  /** Receives event GeoJSON from a reply, for pages that can draw it. */
  onEvents?: (geojson: unknown) => void;
}) {
  const [transport] = useState(() => new JevTransport());
  const [threadId, setThreadId] = useState(newThreadId);
  const [input, setInput] = useState("");
  const mentions = useMentions();
  /** When each message first settled, so the full page shows real times. */
  const messageAt = useRef<Record<string, number>>({});
  const scrollRef = useRef<HTMLDivElement>(null);
  const { messages, sendMessage, setMessages, regenerate, status, stop, error } = useChat({ transport });
  const busy = status === "submitted" || status === "streaming";
  const last = messages.at(-1);
  const showThinking = busy && !(last?.role === "assistant" && jevMessageText(last));
  const firstQuestion = messages.find(message => message.role === "user");
  const title = firstQuestion ? truncate(jevMessageText(firstQuestion)) : "Chat baru dengan Kodama";

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [messages, busy]);

  // Saved once a turn settles, not on every streamed event.
  useEffect(() => {
    if (busy || messages.length === 0) return;
    const now = Date.now();
    for (const message of messages) messageAt.current[message.id] ??= now;
    saveThread(JEV_THREADS_KEY, { id: threadId, title, updatedAt: now, messages, messageAt: { ...messageAt.current } });
  }, [busy, messages, threadId, title]);

  const submit = (text: string) => {
    const trimmed = text.trim();
    if (!trimmed || busy) return;
    sendMessage({ text: trimmed }, { body: { threadId } });
    setInput("");
  };

  const sentRequest = useRef<number | undefined>(undefined);
  useEffect(() => {
    if (!request || request.id === sentRequest.current || busy) return;
    sentRequest.current = request.id;
    sendMessage({ text: request.text }, { body: { threadId } });
  }, [request, busy, sendMessage, threadId]);

  const startNewChat = () => {
    if (busy) return;
    setMessages([]);
    messageAt.current = {};
    setThreadId(newThreadId());
    setInput("");
  };

  const floating = variant === "floating";
  const composer = <AgentComposer value={input} onValueChange={setInput} onSubmit={() => submit(input)} onStop={stop} busy={busy}
    placeholder={placeholder} provider="Jev" showAttachment={false} voiceLanguage="id-ID" mentions={mentions} messageCount={messages.length}
    showStatus={!floating} autoFocus={floating} leading={floating ? <KodamaMark className="size-7" /> : undefined} />;
  const conversation = <>
    {messages.map((message, index) => message.role === "user"
      ? <p key={message.id} className="ml-auto w-fit max-w-[85%] rounded-2xl bg-background-primary-default px-3 py-[11px] text-body-regular break-words whitespace-pre-wrap text-text-primary shadow-card">{jevMessageText(message)}</p>
      : <JevReply key={message.id} message={message} streaming={busy && index === messages.length - 1}
        onRetry={index === messages.length - 1 ? () => void regenerate({ body: { threadId } }) : undefined} onEvents={onEvents}
        onAsk={index === messages.length - 1 ? submit : undefined} />)}
    {showThinking && <JevThinking messages={messages} />}
    {error && <p role="alert" className="px-1 text-body-regular text-text-tertiary">{error.message || "Kodama tidak tersedia. Coba lagi beberapa saat lagi."}</p>}
  </>;

  if (floating) {
    const started = messages.length > 0 || busy;
    // One tree for both states, so the composer keeps focus when the first question turns the card into a thread.
    return <aside aria-label="Asisten Kodama" data-busy={busy ? "" : undefined} className={cx(
      "kodama-rim flex max-h-[min(60vh,560px)] w-full flex-col overflow-hidden rounded-[28px] bg-background-secondary-default/95 shadow-dropdown backdrop-blur-xl",
      className,
    )}>
      {/* Siri's cue that the assistant is working; only while a reply is on its way. Portalled because the card's
          transform and backdrop blur would otherwise trap this fixed glow inside the card. */}
      {busy && createPortal(<div aria-hidden className="siri-edge-glow motion-reduce:hidden" />, document.body)}

      {started ? <>
        {/* Kodama's mark lives in the composer below, so the header carries only the thread. */}
        <header className="flex h-11 shrink-0 items-center gap-2 pr-2 pl-4">
          <h2 className="min-w-0 flex-1 truncate text-body-2-medium text-text-secondary">{title}</h2>
          <HeaderAction label="Chat baru" icon={RiEditBoxLine} onClick={startNewChat} />
          <HeaderAction label="Buka halaman penuh" icon={RiExpandDiagonalLine} href={`/chat?thread=${encodeURIComponent(threadId)}`} />
          <HeaderAction label="Tutup" icon={RiCloseLine} onClick={onClose} />
        </header>
        <div ref={scrollRef} className="min-h-0 flex-1 overflow-y-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
          <div className="flex flex-col gap-4 px-4 pt-1 pb-3">{conversation}</div>
        </div>
      </> : (
        // Questions about what the map shows right now; the first one is the likeliest to be asked.
        // Outlined, not filled, so they stay a step behind the composer; the row fades out instead of cutting a word.
        <div className="flex items-center gap-1 pt-2 pr-1.5 pl-2.5">
          <div className="flex min-w-0 flex-1 items-center gap-1.5 overflow-x-auto pr-6 [scrollbar-width:none] [mask-image:linear-gradient(to_right,black_calc(100%-2rem),transparent)]">
            {suggestions.map(suggestion => <button key={suggestion} type="button" onClick={() => submit(suggestion)}
              className="h-7 shrink-0 cursor-pointer whitespace-nowrap rounded-full border border-border-button-default px-2.5 text-body-2-regular text-text-secondary outline-none transition-colors hover:border-transparent hover:bg-background-primary-hover hover:text-text-primary focus-visible:ring-2 focus-visible:ring-border-focus-ring">{suggestion}</button>)}
          </div>
          <HeaderAction label="Tutup" icon={RiCloseLine} onClick={onClose} />
        </div>
      )}

      <div className="shrink-0 p-2.5">{composer}</div>
    </aside>;
  }

  return <aside aria-label="Asisten Kodama" className={cx(
    "flex w-full flex-col overflow-hidden rounded-3xl border border-border-button-white bg-background-secondary-default",
    "h-full shadow-sidebar",
    className,
  )}>
    <header className="flex h-14 shrink-0 items-center gap-2 border-b border-separator-border px-4">
      <KodamaMark className="size-6" />
      <h2 className="min-w-0 flex-1 truncate text-body-medium text-text-primary">{title}</h2>
      <HeaderAction label="Chat baru" icon={RiEditBoxLine} onClick={startNewChat} />
      <HeaderAction label="Buka halaman penuh" icon={RiExpandDiagonalLine} href={messages.length ? `/chat?thread=${encodeURIComponent(threadId)}` : "/chat"} />
      <HeaderAction label="Tutup" icon={RiCloseLine} onClick={onClose} />
    </header>

    <div ref={scrollRef} className="min-h-0 flex-1 overflow-y-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
      <div className={cx("flex flex-col gap-5 px-4 py-5", messages.length === 0 && "min-h-full justify-center")}>
        {messages.length === 0 ? <div className="flex flex-col items-center gap-4 text-center">
          <div className="flex flex-col gap-1">
            <p className="text-headline-medium text-text-primary">Tanya Kodama</p>
            <p className="text-body-regular text-text-secondary">Jawaban disusun dari data wilayah, kejadian, dan peringatan Arkamap.</p>
          </div>
          <div className="flex flex-col items-center gap-2">
            {suggestions.map(suggestion => <button key={suggestion} type="button" onClick={() => submit(suggestion)}
              className="cursor-pointer rounded-full bg-background-primary-default px-3.5 py-2 text-body-regular text-text-secondary shadow-xs transition-colors hover:bg-background-primary-hover">{suggestion}</button>)}
          </div>
        </div> : conversation}
      </div>
    </div>

    <div className="shrink-0 px-3 pb-3">{composer}</div>
  </aside>;
}

function truncate(text: string) {
  return text.length > 40 ? `${text.slice(0, 40)}...` : text;
}
