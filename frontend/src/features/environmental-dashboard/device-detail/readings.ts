import { useEffect, useState } from "react";
import { api, type DTO } from "@/lib/api/client";

export const CATEGORY_LABEL = {
  cuaca: "Cuaca", kualitas_udara: "Kualitas Udara", air: "Air", tanah: "Tanah", energi: "Energi", laut: "Laut",
  kebencanaan: "Kebencanaan", kesehatan: "Kesehatan", lokasi: "Lokasi", perangkat: "Perangkat", lainnya: "Lainnya",
} as const satisfies Record<NonNullable<DTO<"WidgetSpec">["category"]>, string>;

export const WIDGET_LABEL = {
  line: "Grafik Garis", bar: "Grafik Batang", gauge: "Meteran", stat: "Angka", status: "Status", map: "Peta", table: "Tabel",
} as const satisfies Record<DTO<"WidgetSpec">["widget"], string>;

export const RANGES = [
  { id: "24", label: "24 Jam" },
  { id: "168", label: "7 Hari" },
  { id: "720", label: "30 Hari" },
] as const;

/** Readings newest first, re-read every `pollMs` while the tab is visible.
 * `version` is a table version id sent to the API; `reload` only forces a refetch; `skip` fetches nothing. */
export function useReadings(deviceId: number, params: { hours: number; limit: number; stream?: number; version?: number; reload?: number; skip?: boolean }, pollMs?: number) {
  const [data, setData] = useState<DTO<"Readings">>();
  const [error, setError] = useState<string>();
  const [loading, setLoading] = useState(true);
  const { hours, limit, stream, version, reload, skip } = params;
  useEffect(() => {
    let controller: AbortController | undefined;
    setLoading(!skip); setData(undefined);
    if (skip) return;
    const load = () => {
      if (document.hidden) return;
      controller?.abort();
      const current = new AbortController();
      controller = current;
      const query = new URLSearchParams({ hours: String(hours), limit: String(limit) });
      if (stream !== undefined) query.set("stream", String(stream));
      if (version !== undefined) query.set("version", String(version));
      api(`/me/devices/${deviceId}/readings?${query}`, "Readings", { signal: current.signal })
        .then(result => { if (!current.signal.aborted) { setData(result); setError(undefined); setLoading(false); } })
        .catch(cause => { if (!current.signal.aborted) { setError(cause instanceof Error ? cause.message : "Pembacaan gagal dimuat."); setLoading(false); } });
    };
    load();
    const timer = pollMs ? window.setInterval(load, pollMs) : undefined;
    document.addEventListener("visibilitychange", load);
    return () => { controller?.abort(); window.clearInterval(timer); document.removeEventListener("visibilitychange", load); };
  }, [deviceId, hours, limit, stream, version, reload, skip, pollMs]);
  return { data, error, loading };
}

export const readingTime = (reading: DTO<"Reading">) => reading.measured_at ?? reading.received_at;

/** A field as stored in a reading: its bare key, and the table ("nama") it belongs to. */
export type FieldRef = { key: string; stream?: number };

/** Widgets name fields "<nama>/<field>"; readings carry the bare field under their table's stream id. */
export function fieldRef(field: string, streams: DTO<"Stream">[]): FieldRef {
  const cut = field.indexOf("/");
  if (cut < 0) return { key: field };
  const slug = field.slice(0, cut);
  return { key: field.slice(cut + 1), stream: streams.find(stream => stream.slug === slug)?.id ?? -1 };
}

const inTable = (reading: DTO<"Reading">, ref: FieldRef) => ref.stream === undefined || reading.stream_id === ref.stream;

/** Numeric points for one field, oldest first, for charts. */
export function seriesOf(readings: DTO<"Reading">[], ref: FieldRef) {
  const points: { t: number; v: number }[] = [];
  for (let index = readings.length - 1; index >= 0; index--) {
    if (!inTable(readings[index], ref)) continue;
    const value = readings[index].data?.[ref.key];
    if (typeof value === "number" && Number.isFinite(value)) points.push({ t: Date.parse(readingTime(readings[index])), v: value });
  }
  return points;
}

export function latestOf(readings: DTO<"Reading">[], ref: FieldRef) {
  const reading = readings.find(item => inTable(item, ref) && item.data && ref.key in item.data);
  return reading ? { value: reading.data?.[ref.key], at: readingTime(reading) } : undefined;
}

export function formatValue(value: unknown, unit?: string | null) {
  if (value === undefined || value === null) return "Belum ada data";
  if (typeof value === "boolean") return value ? "Aktif" : "Nonaktif";
  if (typeof value === "number") return `${value.toLocaleString("id-ID", { maximumFractionDigits: 2 })}${unit ? ` ${unit}` : ""}`;
  if (typeof value === "object") return JSON.stringify(value);
  return String(value);
}

export const formatTick = (hours: number) => (value: number) => new Date(value).toLocaleString("id-ID", hours > 24 ? { day: "numeric", month: "short" } : { hour: "2-digit", minute: "2-digit" });
