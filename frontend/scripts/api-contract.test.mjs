import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import ts from "typescript";
import Ajv2020 from "ajv/dist/2020.js";
import addFormats from "ajv-formats";

const source = readFileSync("src/lib/api/stream.ts", "utf8");
const stub = `data:text/javascript,${encodeURIComponent('export async function assertResponse(response) { if (!response.ok) throw new Error("HTTP " + response.status); }')}`;
const connectionStub = `data:text/javascript,${encodeURIComponent('export const apiPath = path => "/api" + path; export const apiHeaders = () => new Headers({ "Content-Type": "application/json" });')}`;
const js = ts.transpileModule(source.replace('"./client"', JSON.stringify(stub)).replace('"./connection"', JSON.stringify(connectionStub)), { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext } }).outputText;
const { readEvents, chat } = await import(`data:text/javascript;base64,${Buffer.from(js).toString("base64")}`);
function stream(text, chunkSize = 1) {
  const bytes = new TextEncoder().encode(text);
  return new ReadableStream({ start(controller) { for (let offset = 0; offset < bytes.length; offset += chunkSize) controller.enqueue(bytes.slice(offset, offset + chunkSize)); controller.close(); } });
}
test("incremental SSE preserves split UTF8, CRLF, comments and multiline JSON", async () => {
  const result = [];
  for await (const event of readEvents(stream(': heartbeat\r\n\r\nevent: token\r\ndata: {\r\ndata: "text": "Air 🌊"}\r\n\r\nevent: done\r\ndata: {"answer":"final"}\r\n\r\n'))) result.push(event);
  assert.deepEqual(result, [{ event: "token", data: { text: "Air 🌊" } }, { event: "done", data: { answer: "final" } }]);
});
test("partial event and malformed JSON fail", async () => {
  await assert.rejects(async () => { for await (const _ of readEvents(stream('event: done\ndata: {}'))) void _; }, /tengah event/);
  await assert.rejects(async () => { for await (const _ of readEvents(stream('data: broken\n\n'))) void _; }, SyntaxError);
});
test("chat rejects HTTP error, in-band error and EOF before done; final is authoritative", async () => {
  const original = globalThis.fetch;
  try {
    globalThis.fetch = async () => new Response("unavailable", { status: 503 });
    await assert.rejects(chat("q", "sid", () => {}, new AbortController().signal), /HTTP 503/);
    for (const [body, error] of [['event: error\ndata: {}\n\n', /jawaban parsial/], ['event: token\ndata: {"text":"partial"}\n\n', /sebelum jawaban final/]]) {
      globalThis.fetch = async () => new Response(stream(body));
      await assert.rejects(chat("q", "sid", () => {}, new AbortController().signal), error);
    }
    const received = [];
    globalThis.fetch = async (_url, options) => {
      assert.equal(options.method, "POST"); assert.equal(options.credentials, "same-origin"); assert.equal(options.signal.aborted, false);
      return new Response(stream('event: reset\ndata: {}\n\nevent: replace\ndata: {"answer":"safe"}\n\nevent: done\ndata: {"answer":"final"}\n\n'));
    };
    await chat("q", "sid", event => received.push(event), new AbortController().signal);
    assert.deepEqual(received.map(item => item.event), ["reset", "replace", "done"]);
  } finally { globalThis.fetch = original; }
});
test("abort reaches fetch and closing the event reader cancels its stream", async () => {
  const original = globalThis.fetch;
  const controller = new AbortController(); controller.abort();
  try {
    globalThis.fetch = async (_url, options) => {
      assert.equal(options.signal, controller.signal);
      throw new DOMException("Aborted", "AbortError");
    };
    await assert.rejects(chat("q", "sid", () => {}, controller.signal), { name: "AbortError" });
    let cancelled = false;
    const body = new ReadableStream({ start(streamController) { streamController.enqueue(new TextEncoder().encode('event: token\ndata: {"text":"one"}\n\n')); }, cancel() { cancelled = true; } });
    for await (const event of readEvents(body)) { assert.equal(event.event, "token"); break; }
    assert.equal(cancelled, true);
  } finally { globalThis.fetch = original; }
});

test("runtime OpenAPI rejects invalid known DTOs and accepts empty real data", () => {
  const doc = JSON.parse(readFileSync("../docs/backend/openapi.json", "utf8"));
  const ajv = new Ajv2020({ strict: false }); addFormats(ajv);
  ajv.addSchema({ $id: "arkamap", components: doc.components });
  const dashboard = ajv.getSchema("arkamap#/components/schemas/Dashboard");
  assert.equal(dashboard({ profile_needed: true, ours: null, view: null, devices: [] }), true);
  assert.equal(dashboard({ profile_needed: "true", devices: [] }), false);
  const widget = ajv.getSchema("arkamap#/components/schemas/WidgetSpec");
  assert.equal(widget({ field: "water", label: "Water", widget: "arbitrary", unit: "m" }), false);
});

test("transport uses raw API paths and forgets the bearer on logout", async () => {
  const source = readFileSync("src/lib/api/connection.ts", "utf8");
  const compiled = ts.transpileModule(source, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext } }).outputText;
  const moduleURL = `data:text/javascript;base64,${Buffer.from(compiled).toString("base64")}`;
  const connection = await import(moduleURL);
  assert.equal(connection.apiPath("/me"), "/api/me");
  connection.setSessionToken("test-user-jwt");
  assert.equal(connection.apiHeaders().get("Authorization"), "Bearer test-user-jwt");
  assert.equal(connection.apiHeaders().has("X-API-Key"), false);
  const original = globalThis.fetch;
  try {
    const hostedStream = sourceStream => ts.transpileModule(sourceStream.replace('"./client"', JSON.stringify(stub)).replace('"./connection"', JSON.stringify(moduleURL)), { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext } }).outputText;
    const { chat: hostedChat } = await import(`data:text/javascript;base64,${Buffer.from(hostedStream(readFileSync("src/lib/api/stream.ts", "utf8"))).toString("base64")}`);
    globalThis.fetch = async (url, options) => {
      assert.equal(url, "/api/agent/chat/stream");
      assert.equal(options.headers.get("Authorization"), "Bearer test-user-jwt");
      return new Response(stream('event: done\ndata: {"answer":"final"}\n\n'));
    };
    await hostedChat("q", "sid", () => {}, new AbortController().signal);
  } finally { globalThis.fetch = original; connection.setSessionToken(); }
  assert.equal(connection.apiHeaders().has("Authorization"), false);
});
