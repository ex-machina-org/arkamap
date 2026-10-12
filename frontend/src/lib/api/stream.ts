import { assertResponse } from "./client";
import { apiPath, apiHeaders } from "./connection";

export type StreamEvent = { event: string; data: unknown };

export async function* readEvents(stream: ReadableStream<Uint8Array>): AsyncGenerator<StreamEvent> {
  const reader = stream.getReader();
  const decoder = new TextDecoder();
  let pending = "";
  try {
    while (true) {
      const part = await reader.read();
      pending += decoder.decode(part.value, { stream: !part.done });
      pending = pending.replace(/\r\n/g, "\n");
      let boundary: number;
      while ((boundary = pending.indexOf("\n\n")) >= 0) {
        const block = pending.slice(0, boundary);
        pending = pending.slice(boundary + 2);
        const lines = block.split("\n");
        const event = lines.find(line => line.startsWith("event:"))?.slice(6).trim() ?? "message";
        const data = lines.filter(line => line.startsWith("data:")).map(line => line.slice(5).trimStart()).join("\n");
        if (data) yield { event, data: JSON.parse(data) as unknown };
      }
      if (part.done) break;
    }
    if (pending.trim()) throw new Error("Stream berakhir di tengah event.");
  } finally { await reader.cancel().catch(() => {}); reader.releaseLock(); }
}

export async function chat(question: string, session_id: string, onEvent: (event: StreamEvent) => void, signal: AbortSignal) {
  const headers = apiHeaders();
  const response = await fetch(apiPath("/agent/chat/stream"), { method: "POST", credentials: "same-origin", signal,
    headers, body: JSON.stringify({ question, session_id }) });
  // with a token, a 401 means it died: end the session instead of chatting on as a guest
  await assertResponse(response, headers.has("Authorization"), headers.get("Authorization"));
  if (!response.body) throw new Error("Stream tidak tersedia.");
  let done = false;
  for await (const event of readEvents(response.body)) {
    if (event.event === "error") throw new Error("Layanan Kodama gagal; jawaban parsial belum final.");
    onEvent(event);
    if (event.event === "done") { done = true; break; }
  }
  if (!done) throw new Error("Koneksi ke Kodama terputus sebelum jawaban final.");
}
