import { useMemo, useState, type ReactNode } from "react";
import { RiArrowDownSLine, RiCheckboxCircleLine, RiFileCopyLine } from "@remixicon/react";
import { Button } from "@/components/base/buttons/button";
import { Input } from "@/components/base/input/input";
import { SegmentedControl, SegmentedControlItem } from "@/components/base/segmented-control/segmented-control";
import type { DTO } from "@/lib/api/client";
import { viaFrontend } from "../device-api";
import { copyText } from "./device-helpers";
import { Fact } from "./device-ui";

/** Strings, comments and numbers only: enough to separate values from syntax without a highlighter dependency. */
const TOKEN = /("(?:[^"\\\n]|\\.)*"|'(?:[^'\\\n]|\\.)*'|(?<![:\w])\/\/[^\n]*|# [^\n]*|(?<![\w.])\d+(?:\.\d+)?(?![\w.]))/g;

function highlight(code: string) {
  return code.split(TOKEN).map((part, index) => {
    if (index % 2 === 0) return part;
    const tone = part.startsWith("//") || part.startsWith("# ") ? "text-text-tertiary"
      : part.startsWith("\"") || part.startsWith("'") ? "text-accent-600 dark:text-accent-400" : "text-status-purple-text";
    return <span key={index} className={tone}>{part}</span>;
  });
}

/** Code panel in a labelled frame: the label and copy action sit on the frame, the code on an inner sheet. */
export function CodeSnippet({ code, label, plain = false }: { code: string; label: string; plain?: boolean }) {
  return <figure className="flex min-w-0 flex-col gap-1.5 rounded-2xl bg-background-supporting-default p-1.5 ring-1 ring-border-button-default ring-inset">
    <figcaption className="flex items-center justify-between gap-2 pl-1">
      <span className="rounded-lg bg-background-primary-default px-2.5 py-1 font-mono text-caption-1-medium text-text-primary shadow-xs">{label}</span>
      <Button size="small" variant="ghost" iconOnly aria-label={`Salin ${label}`} leadingIcon={RiFileCopyLine} onClick={() => copyText(code, label)} />
    </figcaption>
    <pre className="max-h-80 overflow-auto rounded-xl bg-background-inner-default p-4 font-mono text-body-2-regular text-text-primary shadow-card">{plain ? code : highlight(code)}</pre>
  </figure>;
}

/** Same rule as the backend (app/iot/ingest.py slugify): the name a reading is filed under. */
const tableSlug = (nama: string) => nama.trim().toLowerCase().replace(/[^a-z0-9_.-]+/g, "_").replace(/^_+|_+$/g, "").slice(0, 64);

/** The required shape, filled with the owner's own table name and fields: only the values are left to the sensor. */
function TemplateBuilder({ example }: { example: DTO<"Quickstart">["payload"] }) {
  const [nama, setNama] = useState(typeof example.nama === "string" ? example.nama : "cuaca");
  const [fields, setFields] = useState(Object.keys(typeof example.data === "object" && example.data ? example.data : {}).join(", "));
  const keys = [...new Set(fields.split(",").map(field => field.trim()).filter(Boolean))];
  const slug = tableSlug(nama);
  const template = { nama: nama.trim(), waktu: typeof example.waktu === "string" ? example.waktu : new Date().toISOString(), data: Object.fromEntries(keys.map(key => [key, 0])) };
  return <div className="flex flex-col gap-3">
    <div className="grid gap-3 sm:grid-cols-2">
      <Input label="Nama Tabel Data" value={nama} onChange={setNama} maxLength={100}
        hint={slug ? `Diterima sebagai tabel "${slug}". Data beda jenis beri nama beda.` : "Wajib diisi."} />
      <Input label="Field (Pisahkan Dengan Koma)" value={fields} onChange={setFields} maxLength={1000}
        hint="Field baru pada nama yang sama menjadi versi baru tabel itu." />
    </div>
    <CodeSnippet code={JSON.stringify(template, null, 2)} label={`${slug || "template"}.json`} />
  </div>;
}

const CODE = [
  { id: "esp32_arduino", label: "ESP32 / Arduino", file: "kirim_data.ino", note: "HTTP lewat WiFi, untuk ESP32 atau ESP8266." },
  { id: "python", label: "Python", file: "kirim_data.py", note: "HTTP dari komputer atau Raspberry Pi." },
  { id: "curl", label: "curl", file: "terminal", note: "Uji cepat satu kiriman dari terminal." },
  { id: "python_mqtt", label: "MQTT", file: "kirim_mqtt.py", note: "MQTT lewat WebSocket + TLS, untuk gateway. Keepalive 60 detik." },
] as const;

function Step({ n, title, hint, children }: { n: number; title: string; hint?: ReactNode; children: ReactNode }) {
  return <li className="grid grid-cols-[auto_minmax(0,1fr)] gap-x-3 gap-y-3">
    <span aria-hidden className="flex size-6 items-center justify-center rounded-full bg-background-supporting-default text-caption-1-medium text-text-primary tabular-nums ring-1 ring-border-button-default ring-inset">{n}</span>
    <div className="flex min-w-0 flex-col gap-0.5 pt-0.5">
      <h3 className="text-body-medium text-text-primary">{title}</h3>
      {hint && <p className="text-body-2-regular text-pretty text-text-secondary">{hint}</p>}
    </div>
    <div className="col-start-2 flex min-w-0 flex-col gap-3">{children}</div>
  </li>;
}

const code = (text: string) => <code className="font-mono text-text-primary">{text}</code>;

/** Quoted names and URL flags read as code. */
const CODE_TOKEN = /("[^"]*"|\?\w+=\w+)/;

function RuleText({ rule }: { rule: string }) {
  // The term before the first ":" or " = " leads the rule, when it is short enough to be a term.
  const cut = [rule.indexOf(": "), rule.indexOf(" = ")].filter(at => at > 0 && at < 40).sort((a, b) => a - b)[0];
  const lead = cut ? rule.slice(0, cut) : undefined;
  const rest = cut ? rule.slice(cut).replace(/^(: | = )/, "") : rule;
  const tokens = (text: string) => text.split(CODE_TOKEN).map((part, index) => index % 2 ? <code key={index} className="rounded bg-background-supporting-default px-1 font-mono text-caption-1-regular text-text-primary">{part}</code> : part);
  return <span className="min-w-0 text-body-2-regular text-pretty text-text-secondary">
    {lead && <span className="text-body-2-medium text-text-primary">{tokens(lead)}{" "}</span>}{tokens(rest)}
  </span>;
}

const RULES_SHOWN = 5;

/** The server's rules as one tidy list; the first few show, the rest fold away. */
function Rules({ rules }: { rules: string[] }) {
  const row = (rule: string) => <li key={rule} className="flex items-start gap-2.5 px-3 py-2.5">
    <RiCheckboxCircleLine className="mt-0.5 size-4 shrink-0 text-status-lime-text" aria-hidden /><RuleText rule={rule} />
  </li>;
  const more = rules.slice(RULES_SHOWN);
  return <div className="overflow-hidden rounded-2xl bg-background-inner-default shadow-card">
    <ul className="divide-y divide-border-button-default">{rules.slice(0, RULES_SHOWN).map(row)}</ul>
    {!!more.length && <details className="group border-t border-border-button-default">
      <summary className="flex cursor-pointer list-none items-center gap-1 px-3 py-2.5 text-body-2-medium text-text-secondary outline-none hover:text-text-primary focus-visible:ring-2 focus-visible:ring-border-focus-ring focus-visible:ring-inset [&::-webkit-details-marker]:hidden">
        <span className="group-open:hidden">Tampilkan {more.length} aturan lainnya</span><span className="hidden group-open:inline">Sembunyikan</span>
        <RiArrowDownSLine aria-hidden className="size-4 transition-transform group-open:rotate-180 motion-reduce:transition-none" />
      </summary>
      <ul className="divide-y divide-border-button-default border-t border-border-button-default">{more.map(row)}</ul>
    </details>}
  </div>;
}

/** What to send and where: the payload, both endpoints, and the server's rules. */
function Implementation({ quickstart }: { quickstart: DTO<"Quickstart"> }) {
  const mqtt = quickstart.mqtt;
  const headers = Object.entries(quickstart.headers).map(([key, value]) => `${key}: ${value}`).join("\n");
  return <ol className="flex flex-col gap-6">
    <Step n={1} title="Susun Data" hint={<>Setiap kiriman berisi {code("nama")}, {code("waktu")}, dan {code("data")}. Sensor cukup mengganti nilainya.</>}>
      <TemplateBuilder example={quickstart.payload} />
    </Step>
    <Step n={2} title="Kirim Ke Server" hint="Pilih salah satu. HTTP paling mudah diuji.">
      <div className="grid gap-3 lg:grid-cols-2">
        <div className="flex min-w-0 flex-col gap-2">
          <span className="text-caption-1-medium text-text-secondary">HTTP · POST</span>
          <CodeSnippet code={quickstart.url} label="URL" plain />
          <CodeSnippet code={headers} label="Header" plain />
        </div>
        <div className="flex min-w-0 flex-col gap-2">
          <span className="text-caption-1-medium text-text-secondary">MQTT · WebSocket TLS</span>
          <dl className="grid gap-4 rounded-2xl bg-background-inner-default p-4 shadow-card sm:grid-cols-2">
            <div className="sm:col-span-2"><Fact label="Alamat"><span className="font-mono">{mqtt.url}</span></Fact></div>
            <Fact label="Topik"><span className="font-mono">{mqtt.topic}</span></Fact>
            <Fact label="QoS"><span className="font-mono">{mqtt.qos}</span></Fact>
            <Fact label="Username"><span className="font-mono">{mqtt.username}</span></Fact>
            <Fact label="Password"><span className="font-mono">{mqtt.password}</span></Fact>
          </dl>
          <p className="text-caption-1-regular text-pretty text-text-tertiary">Pesan MQTT yang salah format tidak dibalas.</p>
        </div>
      </div>
    </Step>
    <Step n={3} title="Perhatikan Aturan" hint="Yang paling penting di atas; sisanya bisa dibuka bila perlu.">
      <Rules rules={quickstart.rules} />
    </Step>
  </ol>;
}

/** Ready-to-paste programs, one per platform. */
function Code({ quickstart }: { quickstart: DTO<"Quickstart"> }) {
  const available = CODE.filter(item => quickstart.snippets[item.id]);
  const [selected, setSelected] = useState<string>(available[0]?.id ?? "");
  const item = available.find(entry => entry.id === selected);
  if (!item) return <p className="text-body-2-regular text-text-secondary">Contoh kode belum tersedia.</p>;
  return <div className="flex min-w-0 flex-col gap-3">
    <div className="max-w-full overflow-x-auto">
      <SegmentedControl aria-label="Bahasa Atau Perangkat" selectedKeys={new Set([item.id])} onSelectionChange={keys => { const next = [...keys][0]; if (next) setSelected(String(next)); }}>
        {available.map(entry => <SegmentedControlItem key={entry.id} id={entry.id}>{entry.label}</SegmentedControlItem>)}
      </SegmentedControl>
    </div>
    <p className="text-body-2-regular text-pretty text-text-secondary">{item.note}</p>
    <CodeSnippet code={quickstart.snippets[item.id]} label={item.file} />
  </div>;
}

/**
 * How to send data, split into what to send (implementation) and ready code.
 * Right after create/rotate `quickstart` carries the real key;
 * afterwards the backend returns `<API_KEY>` in its place.
 */
export function DeviceQuickstart({ quickstart: fromBackend }: { quickstart: DTO<"Quickstart"> }) {
  const [view, setView] = useState<"guide" | "code">("guide");
  const quickstart = useMemo(() => viaFrontend(fromBackend), [fromBackend]);
  return <div className="flex min-w-0 flex-col gap-5">
    <SegmentedControl aria-label="Panduan Pengiriman" className="self-start" selectedKeys={new Set([view])}
      onSelectionChange={keys => { const next = [...keys][0]; if (next === "guide" || next === "code") setView(next); }}>
      <SegmentedControlItem id="guide">Contoh Implementasi</SegmentedControlItem>
      <SegmentedControlItem id="code">Contoh Kode</SegmentedControlItem>
    </SegmentedControl>
    {view === "guide" ? <Implementation quickstart={quickstart} /> : <Code quickstart={quickstart} />}
  </div>;
}
