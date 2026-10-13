"use client";

import { useChat } from "@ai-sdk/react";
import { RiCloseLine, RiLayoutRightLine, RiMenuLine } from "@remixicon/react";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { DefaultChatTransport, type ChatTransport, type UIMessage } from "ai";

import { Button } from "@/components/base/buttons/button";
import { DemoTransport, SwitchingTransport } from "@/components/application/agent-chat/demo-transport";
import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";

import { AgentChatActions } from "@/components/application/agent-chat/agent-chat-actions";
import {
  AgentChatHistory,
  type ChatThreadSummary,
} from "@/components/application/agent-chat/agent-chat-history";
import { AgentMessage } from "@/components/application/agent-chat/agent-chat-message";
import { AgentComposer } from "@/components/application/agent-chat/agent-composer";
import {
  orderThreads,
  readThreads,
  writeThreads,
  type StoredThread,
} from "@/components/application/agent-chat/thread-store";
import { AgentThinking } from "@/components/application/agent-thinking/agent-thinking";
import { starterNav, useStarterBase } from "@/components/application/app-shell/app-shell";
import { ProOfferCard } from "@/components/application/app-shell/pro-offer-card";
import { DashboardSidebar } from "@/components/application/dashboard/dashboard-sidebar";
import { IconButton } from "@/components/base/buttons/icon-button";
import { cx } from "@/utils/cx";

/**
 * A working chat app, wired to the `/api/chat` runtime.
 *
 * Built only from free components — the free `sidebar`, AgentThinking,
 * ComposerLoader, IconButton — so the whole screen can ship in a public
 * starter repo without giving away anything sold as Pro. It follows the Pro AI
 * chat template's geometry (12px page frame, 16px gap, the 260px sidebar card,
 * a rounded-3xl chat surface) so a starter and a purchased template read as
 * the same product.
 *
 * Any later chat screen that streams from a model should read the same
 * message shape from the same endpoint, so it can replace this one without
 * touching the backend.
 */

const ENDPOINT = "/api/chat";
const STORAGE_KEY = "boardui:agent-chat-threads";
/** Remembered so a reload of a keyless deploy lands back in the demo, not on the notice. */
const DEMO_KEY = "boardui:agent-chat-demo";

/** Every string the screen owns, so a product can reword it without forking. */
export interface AgentChatCopy {
  emptyTitle: string;
  emptyDescription: string;
  suggestions: string[];
  thinkingLabel: string;
  newChat: string;
  placeholder: string;
  /** Shown in the composer status row when a custom transport answers. */
  provider: string;
  error: (error: Error) => string;
  showHistory: string;
  hideHistory: string;
}

const STARTER_COPY: AgentChatCopy = {
  emptyTitle: "What can I help with?",
  emptyDescription: "This chat runs against your own API key. History stays in this browser.",
  suggestions: [
    "Explain what this starter does",
    "Write a product update in three sentences",
    "Give me five names for a scheduling app",
  ],
  thinkingLabel: "Thinking",
  newChat: "New chat",
  placeholder: "Ask me anything",
  provider: "Custom",
  error: () => "Something went wrong. Check the server logs, then try again.",
  showHistory: "Show chat history",
  hideHistory: "Hide chat history",
};

/** The history rail's width, and the workspace gap it gives back when it closes. */
const RAIL_WIDTH = 260;
const RAIL_GAP = 12;
const RAIL_ENTER = { type: "spring", duration: 0.3, bounce: 0 } as const;
// Closing is softer and shorter: attention is already returning to the chat.
const RAIL_EXIT = { duration: 0.2, ease: "easeOut" } as const;

type Probe = {
  status: "checking" | "ready" | "unconfigured";
  provider: string | null;
  /** Display name from the runtime ("Anthropic"), so the UI needs no list of its own. */
  label: string | null;
  model: string | null;
};

export function AgentChat({
  className,
  contained = false,
  transport: customTransport,
  renderSidebar,
  renderAssistant,
  getText = messageText,
  thinkingLabel,
  renderThinking,
  renderEmpty,
  transcriptClassName,
  copy: copyOverrides,
  storageKey = STORAGE_KEY,
  initialThreadId,
  voiceLanguage,
}: {
  className?: string;
  /** Docs preview mode: fill the preview frame's height instead of the
   *  viewport, and keep the phone nav drawer inside the frame. */
  contained?: boolean;
  /** Answers from this transport instead of the `/api/chat` runtime. The
   *  runtime probe, key notice, and demo mode are skipped. Each send carries
   *  `body.threadId`, so a backend can keep one session per thread. */
  transport?: ChatTransport<UIMessage>;
  /** Replaces the starter navigation in both the desktop rail and the phone drawer. */
  renderSidebar?: (options: { mobile: boolean; onClose: () => void }) => ReactNode;
  /** Renders an assistant turn whose content is richer than plain text. */
  renderAssistant?: (message: UIMessage, streaming: boolean) => ReactNode;
  /** The readable text of a message, for the transcript, titles, and the thinking gate. */
  getText?: (message: UIMessage) => string;
  /** Overrides the thinking label while a reply has no text yet, e.g. with the current tool step. */
  thinkingLabel?: (messages: UIMessage[]) => string | undefined;
  /** Replaces the thinking indicator entirely, e.g. with a trail of tool steps. */
  renderThinking?: (messages: UIMessage[]) => ReactNode;
  /** Replaces the empty-thread prompt; `onPick` sends a starter as the first message. */
  renderEmpty?: (onPick: (text: string) => void) => ReactNode;
  /** Extra classes on the scrolling transcript, e.g. a backdrop behind the messages. */
  transcriptClassName?: string;
  copy?: Partial<AgentChatCopy>;
  storageKey?: string;
  /** Opens this stored thread instead of a fresh one, e.g. when a side panel hands over. */
  initialThreadId?: string;
  /** Enables dictation in the composer, in this language. */
  voiceLanguage?: string;
}) {
  const copy = { ...STARTER_COPY, ...copyOverrides };
  const custom = customTransport !== undefined;
  const [probe, setProbe] = useState<Probe>({ status: custom ? "ready" : "checking", provider: null, label: null, model: null });
  const [input, setInput] = useState("");
  const [navOpen, setNavOpen] = useState(false);
  // The sidebar links only to pages the starter has; see app-shell.
  const navItems = starterNav(useStarterBase());
  const [threads, setThreads] = useState<StoredThread[]>([]);
  // Empty until the mount effect assigns one: an id generated during render
  // would differ between server and client and break hydration.
  const [activeId, setActiveId] = useState("");
  /** Stamped on send, so render never calls Date.now(). */
  const [activeUpdatedAt, setActiveUpdatedAt] = useState(0);
  /** Set when the open thread is renamed. Without it the derived title
   *  (built from the first message) would immediately overwrite the name. */
  const [activeTitle, setActiveTitle] = useState<string | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const titleRef = useRef<HTMLSpanElement>(null);
  const columnRef = useRef<HTMLDivElement>(null);
  /** When each message arrived, for the hover timestamp. */
  const [messageAt, setMessageAt] = useState<Record<string, number>>({});
  /** True once the transcript is scrolled at all. */
  const [scrolledUnder, setScrolledUnder] = useState(false);
  /** Whether the title and the message column actually overlap horizontally.
   *  On a wide screen the column is centred well clear of a short title, so
   *  text passing behind the header never touches it and a rule would be
   *  drawing a line under nothing. */
  const [canClash, setCanClash] = useState(false);
  /** Guards the writer: before the restore below runs, `threads` is empty,
   *  and persisting that would erase stored history on every page load. */
  const [restored, setRestored] = useState(false);
  /** Whether the history rail is shown on wide screens; remembered per browser. */
  const [historyOpen, setHistoryOpen] = useState(true);
  const reduceMotion = useReducedMotion();
  const historyKey = `${storageKey}:history-open`;
  useEffect(() => {
    try {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- restoring a viewer preference from localStorage after mount
      setHistoryOpen(window.localStorage.getItem(historyKey) !== "off");
    } catch {
      // Storage can be blocked; the rail simply starts open.
    }
  }, [historyKey]);
  const toggleHistory = () => {
    const next = !historyOpen;
    setHistoryOpen(next);
    try {
      window.localStorage.setItem(historyKey, next ? "on" : "off");
    } catch {
      // Nothing to remember without storage.
    }
  };

  // Demo mode: the visitor skipped the key notice. Only meaningful while the
  // runtime reports no key; the moment a key exists, the real route answers.
  const [demo, setDemo] = useState(false);
  const demoActive = demo && probe.status === "unconfigured";
  const [transport] = useState(
    () => customTransport ?? new SwitchingTransport(new DefaultChatTransport({ api: ENDPOINT }), new DemoTransport()),
  );
  useEffect(() => {
    try {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- restoring from localStorage after mount; there is no render-time source for it
      setDemo(window.localStorage.getItem(DEMO_KEY) === "on");
    } catch {
      // Storage can be blocked; the notice simply shows again.
    }
  }, []);
  const enterDemo = () => {
    setDemo(true);
    try {
      window.localStorage.setItem(DEMO_KEY, "on");
    } catch {
      // Nothing to remember without storage.
    }
  };

  const { messages, sendMessage, setMessages, status, stop, error } = useChat({
    transport,
  });

  const busy = status === "submitted" || status === "streaming";

  // Reasoning models stream their thinking before any text, and the SDK flips
  // status to "streaming" on that first non-text chunk. Gating the indicator on
  // "submitted" alone therefore hides it seconds before a word appears, leaving
  // an empty transcript. It stays up until real text exists.
  const streamedText = useMemo(() => {
    const last = messages[messages.length - 1];
    if (!last || last.role !== "assistant") return "";
    return getText(last);
  }, [messages, getText]);
  const showThinking = busy && streamedText.length === 0;

  /** The open chat as plain text, for the share control. */
  const transcript = useMemo(
    () =>
      messages
        .map((message) => `${message.role === "user" ? "You" : "Assistant"}: ${getText(message)}`)
        .filter((line) => !line.endsWith(": "))
        .join("\n\n"),
    [messages, getText],
  );

  // Ask the runtime what it has before the first message, so a deployment with
  // no key renders setup steps instead of letting someone type into a dead box.
  useEffect(() => {
    if (custom) return;
    let cancelled = false;
    fetch(ENDPOINT, { method: "GET" })
      .then((res) => (res.ok ? res.json() : null))
      .then((data: { configured?: boolean; provider?: string; providerLabel?: string; model?: string } | null) => {
        if (cancelled) return;
        // Only an explicit `configured: false` means "no key". A failed or
        // unreadable probe says nothing about the key, and treating it as
        // missing would hide the composer behind setup steps for a fault that
        // has nothing to do with configuration.
        setProbe({
          status: data && data.configured === false ? "unconfigured" : "ready",
          provider: data?.provider ?? null,
          label: data?.providerLabel ?? null,
          model: data?.model ?? null,
        });
      })
      .catch(() => {
        // A failed probe shouldn't lock the composer — let the send attempt
        // surface the real error rather than guessing the cause here.
        if (!cancelled) setProbe({ status: "ready", provider: null, label: null, model: null });
      });
    return () => {
      cancelled = true;
    };
  }, [custom]);

  // Restore history, then open on a fresh thread rather than reviving the last
  // one — landing mid-conversation after a reload is more surprising than
  // useful, and the rail is right there. localStorage cannot be read during
  // render (it does not exist while server-rendering), so this is the one
  // place state has to be set from an effect.
  useEffect(() => {
    const stored = orderThreads(readThreads(storageKey));
    const handedOver = stored.find((thread) => thread.id === initialThreadId);
    // eslint-disable-next-line react-hooks/set-state-in-effect -- restoring from localStorage after mount; there is no render-time source for it
    setThreads(stored);
    if (handedOver) {
      setActiveId(handedOver.id);
      setActiveUpdatedAt(handedOver.updatedAt);
      setActiveTitle(handedOver.title);
      setMessageAt(handedOver.messageAt ?? {});
      setMessages(handedOver.messages);
    } else {
      setActiveId(newThreadId());
    }
    setRestored(true);
  }, [storageKey, initialThreadId, setMessages]);

  // The thread being typed into is derived rather than stored, so its title
  // appears as soon as the first message lands without a state round-trip.
  // The timestamp is stamped when a message is sent rather than read during
  // render, so rendering stays pure and the badge does not drift each frame.
  const liveThread: StoredThread | null = useMemo(
    () =>
      activeId && messages.length > 0
        ? {
            id: activeId,
            title: activeTitle ?? deriveTitle(messages, copy.newChat),
            updatedAt: activeUpdatedAt,
            messages,
            messageAt,
          }
        : null,
    [activeId, messages, activeUpdatedAt, messageAt, activeTitle, copy.newChat],
  );

  // Ordered by last message, never by what is open: selecting a thread must
  // not move it, or the list reshuffles under the pointer as you browse it.
  const allThreads = useMemo(() => {
    const rest = threads.filter((thread) => thread.id !== activeId);
    return orderThreads(liveThread ? [liveThread, ...rest] : rest);
  }, [liveThread, threads, activeId]);

  // Persist whenever the list settles. Held back during a stream so it is not
  // rewritten on every token, and until the restore above has run so an empty
  // first render cannot clobber stored history.
  useEffect(() => {
    if (!restored || busy) return;
    writeThreads(storageKey, allThreads);
  }, [restored, busy, allThreads, storageKey]);

  // Arrival times come from outside React (they are a property of when the
  // stream delivered each message), so they are recorded rather than derived.
  useEffect(() => {
    const unseen = messages.filter((message) => messageAt[message.id] === undefined);
    if (unseen.length === 0) return;
    const now = Date.now();
    // eslint-disable-next-line react-hooks/set-state-in-effect -- restoring from localStorage after mount; there is no render-time source for it
    setMessageAt((prev) => {
      const next = { ...prev };
      for (const message of unseen) next[message.id] = now;
      return next;
    });
  }, [messages, messageAt]);

  // Geometry, not a breakpoint: the title is as wide as its text, so whether
  // it reaches the column depends on both and has to be measured.
  useEffect(() => {
    const measure = () => {
      const title = titleRef.current?.getBoundingClientRect();
      const column = columnRef.current?.getBoundingClientRect();
      if (!title || !column) return;
      // A 16px buffer so text never slides right up against the title.
      setCanClash(title.right + 16 > column.left);
    };
    measure();
    const observer = new ResizeObserver(measure);
    if (scrollRef.current) observer.observe(scrollRef.current);
    return () => observer.disconnect();
  }, [messages.length, activeId]);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [messages, busy]);

  const submit = (text: string) => {
    const trimmed = text.trim();
    if (!trimmed || busy) return;
    setActiveUpdatedAt(Date.now());
    sendMessage({ text: trimmed }, { body: custom ? { threadId: activeId } : { demo: demoActive } });
    setInput("");
  };

  /** Folds the thread being left back into the stored list before switching.
   *  Its timestamp is carried over untouched, so leaving a thread never
   *  changes where it sits in the list. */
  const keepLiveThread = useCallback(() => {
    if (!liveThread) return;
    setThreads((prev) =>
      orderThreads([liveThread, ...prev.filter((thread) => thread.id !== liveThread.id)]),
    );
  }, [liveThread]);

  const startNewChat = useCallback(() => {
    if (busy) return;
    keepLiveThread();
    setActiveId(newThreadId());
    setActiveUpdatedAt(0);
    setActiveTitle(null);
    setMessageAt({});
    setMessages([]);
    setInput("");
  }, [busy, keepLiveThread, setMessages]);

  const renameThread = useCallback(
    (id: string, title: string) => {
      if (id === activeId) setActiveTitle(title);
      setThreads((prev) =>
        prev.map((thread) => (thread.id === id ? { ...thread, title } : thread)),
      );
    },
    [activeId],
  );

  const toggleUnread = useCallback((id: string) => {
    setThreads((prev) =>
      prev.map((thread) => (thread.id === id ? { ...thread, unread: !thread.unread } : thread)),
    );
  }, []);

  const deleteThread = useCallback(
    (id: string) => {
      const remaining = threads.filter((thread) => thread.id !== id);
      setThreads(remaining);
      // Deleting the thread you are reading leaves nothing to read, so the
      // pane opens a fresh one rather than showing a transcript with no row.
      if (id === activeId) {
        setActiveId(newThreadId());
        setActiveUpdatedAt(0);
        setActiveTitle(null);
        setMessageAt({});
        setMessages([]);
        setInput("");
      }
    },
    [threads, activeId, setMessages],
  );

  /** Hands the stored chats back as a file. Nothing leaves the browser: the
   *  blob is built locally and revoked straight after the click. */
  const exportThreads = useCallback(() => {
    if (allThreads.length === 0) return;
    const blob = new Blob([JSON.stringify(allThreads, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = "boardui-chats.json";
    // In the document because some browsers ignore click() on a detached
    // anchor, and revoked a tick later rather than immediately: revoking in the
    // same turn can kill the URL before the browser has read the blob, which
    // saves an empty file or nothing at all.
    document.body.appendChild(link);
    link.click();
    link.remove();
    setTimeout(() => URL.revokeObjectURL(url), 0);
  }, [allThreads]);

  const selectThread = useCallback(
    (id: string) => {
      if (busy || id === activeId) return;
      const thread = allThreads.find((candidate) => candidate.id === id);
      if (!thread) return;
      keepLiveThread();
      // Reading a chat is what marks it read again.
      if (thread.unread) toggleUnread(id);
      setActiveId(id);
      setActiveUpdatedAt(thread.updatedAt);
      setActiveTitle(thread.title);
      setMessageAt(thread.messageAt ?? {});
      setMessages(thread.messages);
      setInput("");
    },
    [busy, activeId, allThreads, keepLiveThread, toggleUnread, setMessages],
  );

  return (
    <div
      className={cx(
        "relative flex w-full gap-4 overflow-hidden bg-background-full p-3",
        contained ? "h-[var(--template-preview-height)]" : "h-dvh",
        className,
      )}
    >
      {renderSidebar ? (
        <div className="hidden lg:flex">{renderSidebar({ mobile: false, onClose: () => setNavOpen(false) })}</div>
      ) : (
        <DashboardSidebar items={navItems} selected="chat" className="hidden lg:flex" />
      )}

      {/* Below lg the sidebar rides in as an overlay drawer. The Pro template
          pushes the workspace across instead; this is the plain version. */}
      {navOpen && (
        <div className={cx(contained ? "absolute" : "fixed", "inset-0 z-50 flex lg:hidden")}>
          <button
            type="button"
            aria-label="Close navigation"
            onClick={() => setNavOpen(false)}
            className="absolute inset-0 cursor-pointer bg-black/40"
          />
          <div className="relative flex h-full p-3">
            {renderSidebar ? (
              renderSidebar({ mobile: true, onClose: () => setNavOpen(false) })
            ) : (
              <DashboardSidebar
                mobile
                items={navItems}
                selected="chat"
                onClose={() => setNavOpen(false)}
                className="flex"
              />
            )}
          </div>
        </div>
      )}

      <div className="relative flex min-h-0 min-w-0 flex-1 gap-3 overflow-hidden">
        <div className="relative flex h-full min-w-0 flex-1 flex-col overflow-hidden rounded-3xl bg-background-secondary-default">
            <header
              className={cx(
                "absolute inset-x-0 top-0 z-10 flex h-12 items-center gap-2 border-b px-4 pt-[7px] transition-colors",
                // Overlaid rather than stacked above the transcript. Stacked,
                // the scroll area began below it and text was cut off at the
                // header's edge; overlaid, it runs to the container's own
                // rounded top and is clipped by that instead.
                // A rule only earns its place when the text both passes under
                // the header AND the title is wide enough to be in its way.
                // The border is always present but transparent, so appearing
                // costs no height and nothing shifts.
                // When it does clash the band frosts over, so the text passing
                // behind it is obscured instead of running through the title.
                // Tied to the same condition as the rule: with no clash the
                // header stays fully transparent and the transcript reads all
                // the way up to the card's edge.
                scrolledUnder && canClash
                  ? "border-separator-border bg-white/20 backdrop-blur-[20px] dark:bg-black/20"
                  : "border-transparent",
              )}
            >
              <IconButton
                icon={navOpen ? RiCloseLine : RiMenuLine}
                size="small"
                aria-label="Open navigation"
                onClick={() => setNavOpen((open) => !open)}
                className="lg:hidden"
              />
              <span
                ref={titleRef}
                className="min-w-0 shrink truncate text-headline-medium text-text-primary"
              >
                {headerTitle(allThreads, activeId, copy.newChat)}
              </span>

              <AgentChatActions
                className="ml-auto"
                transcript={transcript}
                onExport={exportThreads}
                onToggleUnread={() => toggleUnread(activeId)}
                onDelete={() => deleteThread(activeId)}
                disabled={messages.length === 0}
              />
              {/* Plain like the share and more buttons beside it, and tucked to their 2px rhythm. */}
              <button
                type="button"
                aria-label={historyOpen ? copy.hideHistory : copy.showHistory}
                title={historyOpen ? copy.hideHistory : copy.showHistory}
                aria-expanded={historyOpen}
                aria-controls="agent-chat-history"
                onClick={toggleHistory}
                className={cx(
                  "-ml-1.5 hidden size-7 shrink-0 cursor-pointer items-center justify-center rounded-md xl:inline-flex",
                  "text-foreground-icon-secondary transition-colors duration-150 ease outline-none",
                  "hover:bg-background-primary-hover hover:text-foreground-icon-primary focus-visible:ring-2 focus-visible:ring-border-focus-ring",
                )}
              >
                <RiLayoutRightLine className="size-[18px] shrink-0" aria-hidden />
              </button>
            </header>

            {probe.status === "unconfigured" && messages.length === 0 && !demo ? (
              <SetupNotice onSkip={enterDemo} />
            ) : (
              <>
                <div
                  ref={scrollRef}
                  onScroll={(event) => setScrolledUnder(event.currentTarget.scrollTop > 0)}
                  className={cx(
                    "min-h-0 flex-1 overflow-y-auto scroll-smooth [scrollbar-width:none] [&::-webkit-scrollbar]:hidden",
                    transcriptClassName,
                  )}
                >
                  <div
                    ref={columnRef}
                    className={cx(
                      "mx-auto flex w-full max-w-3xl flex-col gap-5 px-4 pt-[72px] pb-6",
                      // With nothing to read, the prompt sits in the middle of
                      // the empty space rather than pinned under the header.
                      messages.length === 0 && "min-h-full justify-center",
                    )}
                  >
                    {messages.length === 0 ? (
                      renderEmpty ? <EmptySlot render={renderEmpty} onPick={submit} /> : <EmptyState onPick={submit} demo={demoActive} copy={copy} />
                    ) : (
                      messages.map((message, index) => {
                        const streaming = busy && index === messages.length - 1;
                        return renderAssistant && message.role === "assistant" ? (
                          <div key={message.id}>{renderAssistant(message, streaming)}</div>
                        ) : (
                          <AgentMessage
                            key={message.id}
                            role={message.role}
                            text={getText(message)}
                            streaming={streaming}
                            at={messageAt[message.id]}
                          />
                        );
                      })
                    )}

                    {showThinking && renderThinking && renderThinking(messages)}
                    {showThinking && !renderThinking && (
                      <AgentThinking
                        variant="wave"
                        label={thinkingLabel?.(messages) ?? copy.thinkingLabel}
                        className="px-1"
                      />
                    )}

                    {error && (
                      <p role="alert" className="px-1 text-body-regular text-text-tertiary">
                        {copy.error(error)}
                      </p>
                    )}
                  </div>
                </div>

                <div className="shrink-0 px-3 pb-3">
                  <div className="mx-auto w-full max-w-3xl">
                    <AgentComposer
                      value={input}
                      onValueChange={setInput}
                      onSubmit={() => submit(input)}
                      onStop={stop}
                      busy={busy}
                      placeholder={copy.placeholder}
                      showAttachment={!custom}
                      voiceLanguage={voiceLanguage}
                      model={probe.model}
                      provider={custom ? copy.provider : demoActive ? "Demo mode" : (probe.label ?? probe.provider)}
                      messageCount={messages.length}
                    />
                  </div>
                </div>
              </>
            )}
        </div>

        {/* The rail gives its width and the workspace gap back to the chat when it closes. */}
        <AnimatePresence initial={false}>
          {historyOpen && (probe.status !== "unconfigured" || messages.length > 0 || demo) && (
            <motion.div
              key="history"
              id="agent-chat-history"
              initial={{ width: 0, marginLeft: -RAIL_GAP, opacity: 0 }}
              animate={{ width: RAIL_WIDTH, marginLeft: 0, opacity: 1, transition: reduceMotion ? { duration: 0 } : RAIL_ENTER }}
              exit={{ width: 0, marginLeft: -RAIL_GAP, opacity: 0, transition: reduceMotion ? { duration: 0 } : RAIL_EXIT }}
              className="hidden h-full shrink-0 overflow-hidden xl:block"
            >
              <AgentChatHistory
                threads={allThreads}
                activeId={activeId}
                onSelect={selectThread}
                onNewChat={startNewChat}
                onRename={renameThread}
                onToggleUnread={toggleUnread}
                onDelete={deleteThread}
                onExport={exportThreads}
                disabled={busy}
                showFooter={!custom}
              />
            </motion.div>
          )}
        </AnimatePresence>
      </div>
      {/* Fixed to the viewport, so not inside the docs preview frame. */}
      {!contained && !renderSidebar && <ProOfferCard />}
    </div>
  );
}

/** Renders a caller's empty state as its own component, so `onPick` is only ever called from events. */
function EmptySlot({ render, onPick }: { render: (onPick: (text: string) => void) => ReactNode; onPick: (text: string) => void }) {
  return render(onPick);
}

function EmptyState({
  onPick,
  demo = false,
  copy,
}: {
  onPick: (text: string) => void;
  demo?: boolean;
  copy: AgentChatCopy;
}) {
  return (
    <div className="flex flex-col items-center gap-4 text-center">
      <div className="flex flex-col gap-1">
        <h2 className="text-title-2-medium text-text-primary">{copy.emptyTitle}</h2>
        <p className="text-body-regular text-text-secondary">
          {demo
            ? "Demo mode: the answers are scripted. Add AI_API_KEY for a real model."
            : copy.emptyDescription}
        </p>
      </div>
      <div className="flex flex-wrap justify-center gap-2">
        {copy.suggestions.map((suggestion) => (
          <button
            key={suggestion}
            type="button"
            onClick={() => onPick(suggestion)}
            className="cursor-pointer rounded-full bg-background-primary-default px-3.5 py-2 text-body-regular text-text-secondary shadow-xs transition-colors hover:bg-background-primary-hover"
          >
            {suggestion}
          </button>
        ))}
      </div>
    </div>
  );
}

/**
 * Shown when the runtime reports no provider key. Deliberately specific about
 * where the key goes, because the person seeing this has usually just clicked
 * Deploy and has no context for where that setting lives.
 */
function SetupNotice({ onSkip }: { onSkip: () => void }) {
  return (
    <div className="flex min-h-0 flex-1 items-center justify-center p-6">
      <div className="flex max-w-md flex-col gap-3 rounded-2xl bg-background-primary-default p-6 shadow-card">
        <h2 className="text-headline-medium text-text-primary">Add an API key to start</h2>
        <p className="text-body-regular text-text-secondary">
          The chat is wired up and ready. It needs a model provider key before it can answer.
        </p>
        <ol className="flex list-decimal flex-col gap-1.5 pl-5 text-body-regular text-text-secondary">
          <li>Open your project on Vercel, then Settings, then Environment Variables.</li>
          <li>
            Add <code className="text-text-primary">AI_API_KEY</code> with a key from OpenAI,
            Anthropic, Google, OpenRouter, or Vercel AI Gateway.
          </li>
          <li>Redeploy.</li>
        </ol>
        <p className="text-caption-1-regular text-text-tertiary">
          Running locally? Put the same variable in <code>.env.local</code> and restart the dev
          server.
        </p>
        <Button variant="primary" size="medium" className="w-full" onClick={onSkip}>
          Skip, show me the demo
        </Button>
      </div>
    </div>
  );
}

/** The text parts of a message, joined. Reasoning and tool parts ride the
 *  same array and are ignored here; a richer screen would render them. */
function messageText(message: UIMessage) {
  return message.parts
    .filter((part) => part.type === "text")
    .map((part) => part.text)
    .join("");
}

function newThreadId() {
  // randomUUID needs a secure context; a deployed starter always has one, but
  // plain-http previews and older browsers do not.
  return globalThis.crypto?.randomUUID?.() ?? `t-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function deriveTitle(messages: UIMessage[], fallback: string) {
  const firstUser = messages.find((message) => message.role === "user");
  const text = firstUser?.parts
    .filter((part) => part.type === "text")
    .map((part) => part.text)
    .join("")
    .trim();
  if (!text) return fallback;
  return text.length > 48 ? `${text.slice(0, 48)}...` : text;
}

function headerTitle(threads: ChatThreadSummary[], activeId: string, fallback: string) {
  return threads.find((thread) => thread.id === activeId)?.title ?? fallback;
}

