import type { UIMessage } from "ai";

import type { ChatThreadSummary } from "@/components/application/agent-chat/agent-chat-history";

export interface StoredThread extends ChatThreadSummary {
  messages: UIMessage[];
  /** Message id -> when it arrived, so a restored chat shows real times
   *  rather than reporting every message as having just landed. */
  messageAt: Record<string, number>;
}

/** Enough history to be useful without letting localStorage grow unbounded. */
const MAX_THREADS = 30;

/** Newest message first, and trimmed from the oldest end. Pinned chats and chats filed
 *  in a folder were kept on purpose, so only loose ones count toward the limit.
 *  ponytail: kept chats are unbounded; cap them too if storage quota becomes a problem. */
export function orderThreads(threads: StoredThread[]) {
  let loose = 0;
  return [...threads]
    .sort((a, b) => b.updatedAt - a.updatedAt)
    .filter((thread) => thread.pinned || thread.folder || ++loose <= MAX_THREADS);
}

/** Storage is a convenience, never a source of truth — every access can throw
 *  (private browsing, disabled site data) and must not take the chat with it. */
export function readThreads(storageKey: string): StoredThread[] {
  try {
    const raw = window.localStorage.getItem(storageKey);
    if (!raw) return [];
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(
      (thread): thread is StoredThread =>
        typeof thread === "object" &&
        thread !== null &&
        typeof (thread as StoredThread).id === "string" &&
        Array.isArray((thread as StoredThread).messages),
    );
  } catch {
    return [];
  }
}

export function writeThreads(storageKey: string, threads: StoredThread[]) {
  try {
    window.localStorage.setItem(storageKey, JSON.stringify(threads));
  } catch {
    // Quota or blocked storage: history is best-effort, the chat still works.
  }
}

/** Adds or replaces one thread, keeping what a reader set on it: its title, pin and folder. */
export function saveThread(storageKey: string, thread: StoredThread) {
  const threads = readThreads(storageKey);
  const previous = threads.find((item) => item.id === thread.id);
  writeThreads(
    storageKey,
    orderThreads([
      { ...previous, ...thread, title: previous?.title ?? thread.title },
      ...threads.filter((item) => item.id !== thread.id),
    ]),
  );
}
