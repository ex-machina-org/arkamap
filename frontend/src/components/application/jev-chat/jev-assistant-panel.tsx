import { useEffect, useRef, useState } from "react";
import { useChat } from "@ai-sdk/react";
import { RiCloseLine, RiEditBoxLine, RiExpandDiagonalLine } from "@remixicon/react";
import { AgentComposer } from "@/components/application/agent-chat/agent-composer";
import { saveThread } from "@/components/application/agent-chat/thread-store";
import { Tooltip, TooltipTrigger } from "@/components/base/tooltip/tooltip";
import { cx } from "@/utils/cx";
import { JevReply } from "./jev-reply";
import { JEV_THREADS_KEY } from "./jev-storage";
import { JevThinking } from "./jev-thinking";
import { jevMessageText, JevTransport } from "./jev-transport";
import { KodamaMark } from "@/components/foundations/brand/kodama-icon";

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
 */
export function JevAssistantPanel({ onClose, className, request, onEvents }: {
  onClose: () => void;
  className?: string;
  /** A question asked from elsewhere on the page, such as "Tanya Kodama" on the map. A new id sends it. */
  request?: { id: number; text: string };
  /** Receives event GeoJSON from a reply, for pages that can draw it. */
  onEvents?: (geojson: unknown) => void;
}) {
  const [transport] = useState(() => new JevTransport());
  const [threadId, setThreadId] = useState(newThreadId);
  const [input, setInput] = useState("");
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

  return <aside aria-label="Asisten Kodama" className={cx("flex h-full w-full flex-col overflow-hidden rounded-3xl border border-border-button-white bg-background-secondary-default shadow-sidebar", className)}>
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
            {SUGGESTIONS.map(suggestion => <button key={suggestion} type="button" onClick={() => submit(suggestion)}
              className="cursor-pointer rounded-full bg-background-primary-default px-3.5 py-2 text-body-regular text-text-secondary shadow-xs transition-colors hover:bg-background-primary-hover">{suggestion}</button>)}
          </div>
        </div> : messages.map((message, index) => message.role === "user"
          ? <p key={message.id} className="ml-auto w-fit max-w-[85%] rounded-2xl bg-background-primary-default px-3 py-[11px] text-body-regular break-words whitespace-pre-wrap text-text-primary shadow-card">{jevMessageText(message)}</p>
          : <JevReply key={message.id} message={message} streaming={busy && index === messages.length - 1}
            onRetry={index === messages.length - 1 ? () => void regenerate({ body: { threadId } }) : undefined} onEvents={onEvents} />)}
        {showThinking && <JevThinking messages={messages} />}
        {error && <p role="alert" className="px-1 text-body-regular text-text-tertiary">{error.message || "Kodama tidak tersedia. Coba lagi beberapa saat lagi."}</p>}
      </div>
    </div>

    <div className="shrink-0 px-3 pb-3">
      <AgentComposer value={input} onValueChange={setInput} onSubmit={() => submit(input)} onStop={stop} busy={busy}
        placeholder="Tanyakan apa saja ke Kodama" provider="Jev" showAttachment={false} voiceLanguage="id-ID" messageCount={messages.length} />
    </div>
  </aside>;
}

function truncate(text: string) {
  return text.length > 40 ? `${text.slice(0, 40)}...` : text;
}
