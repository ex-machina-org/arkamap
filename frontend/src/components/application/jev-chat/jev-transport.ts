import type { ChatTransport, UIMessage, UIMessageChunk } from "ai";
import { applyJevEvent, EMPTY_JEV_ANSWER, type JevAnswer } from "@/hooks/use-jev";
import { chat } from "@/lib/api/stream";

/** One data part per reply, rewritten in place on every event. Jev can reset
 *  or replace text it already streamed, which append-only text parts cannot express. */
export const JEV_PART = "data-jev";
const PART_ID = "jev";

/** The answer plus what the reader sees about how it was reached. */
export type JevReplyData = JevAnswer & {
  /** Distinct tool steps in the order Jev took them. */
  steps: string[];
  startedAt: number;
  /** Set once the final answer arrives; until then the reply is still thinking. */
  finishedAt?: number;
};

export function jevReply(message: UIMessage): JevReplyData | undefined {
  const part = message.parts.find(item => item.type === JEV_PART);
  return part && "data" in part ? part.data as JevReplyData : undefined;
}

export function jevMessageText(message: UIMessage) {
  if (message.role === "assistant") return jevReply(message)?.answer ?? "";
  return message.parts.map(part => part.type === "text" ? part.text : "").join("");
}

function lastUserText(messages: UIMessage[]) {
  const last = messages.findLast(message => message.role === "user");
  return last?.parts.map(part => part.type === "text" ? part.text : "").join("").trim() ?? "";
}

/** Streams `/agent/chat/stream` into `useChat`. The chat thread id is the Jev session id. */
export class JevTransport implements ChatTransport<UIMessage> {
  sendMessages: ChatTransport<UIMessage>["sendMessages"] = async ({ messages, abortSignal, body }) => {
    const question = lastUserText(messages);
    const threadId = (body as { threadId?: string } | undefined)?.threadId || crypto.randomUUID();
    const signal = abortSignal ?? new AbortController().signal;
    return new ReadableStream<UIMessageChunk>({
      async start(controller) {
        let reply: JevReplyData = { ...EMPTY_JEV_ANSWER, step: "Kodama memproses permintaan...", steps: [], startedAt: Date.now() };
        const write = () => controller.enqueue({ type: JEV_PART, id: PART_ID, data: reply });
        controller.enqueue({ type: "start" });
        write();
        try {
          await chat(question, threadId, event => {
            const next = applyJevEvent(reply, event);
            const steps = event.event === "step" && !reply.steps.includes(next.step) ? [...reply.steps, next.step] : reply.steps;
            reply = { ...reply, ...next, steps, finishedAt: event.event === "done" ? Date.now() : undefined };
            write();
          }, signal);
          controller.enqueue({ type: "finish" });
        } catch (cause) {
          if (signal.aborted) controller.enqueue({ type: "abort" });
          else controller.enqueue({ type: "error", errorText: cause instanceof Error ? cause.message : "Kodama tidak tersedia." });
        } finally {
          controller.close();
        }
      },
    });
  };

  reconnectToStream: ChatTransport<UIMessage>["reconnectToStream"] = async () => null;
}
