import "./series.css";

/** Series colors in their validated, fixed order. Index by series position, never by rank. */
export const SERIES = [1, 2, 3, 4, 5].map(index => `var(--color-series-${index})`);

const numberFormat = new Intl.NumberFormat("id-ID", { maximumFractionDigits: 2 });
const compactFormat = new Intl.NumberFormat("id-ID", { notation: "compact", maximumFractionDigits: 1 });

export function formatNumber(value: number) { return numberFormat.format(value); }
export function formatCompact(value: number) { return Math.abs(value) >= 10_000 ? compactFormat.format(value) : numberFormat.format(value); }

/** Any sensor value as readable text: numbers localized, booleans in Indonesian, objects summarized. */
export function formatValue(value: unknown, unit?: string | null): string {
  if (value == null || value === "") return "Belum ada data";
  if (typeof value === "number") return Number.isFinite(value) ? `${formatNumber(value)}${unit ? ` ${unit}` : ""}` : "Tidak valid";
  if (typeof value === "boolean") return value ? "Ya" : "Tidak";
  if (Array.isArray(value)) return value.map(item => formatValue(item)).join(", ");
  if (typeof value === "object") return Object.entries(value).map(([key, item]) => `${key}: ${formatValue(item)}`).join(" · ");
  return `${String(value)}${unit ? ` ${unit}` : ""}`;
}

export function formatDateTime(value: string | number | Date) {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "Waktu tidak valid" : date.toLocaleString("id-ID", { dateStyle: "medium", timeStyle: "short" });
}

const DATE_ONLY = /^\d{4}-\d{2}-\d{2}$/;

/** A day as a date ("8 Okt 2026"), a reading with its clock time. */
export function formatWhen(t: string | number) {
  const date = new Date(t);
  if (Number.isNaN(date.getTime())) return "—";
  return typeof t === "string" && DATE_ONLY.test(t)
    ? date.toLocaleDateString("id-ID", { day: "numeric", month: "short", year: "numeric" })
    : date.toLocaleString("id-ID", { dateStyle: "medium", timeStyle: "short" });
}

/** Short axis label that adapts to the visible span: time of day within two days, date beyond. */
export function timeTick(span: number) {
  return (value: string | number) => {
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return "";
    if (span <= 3_600_000) return date.toLocaleTimeString("id-ID", { hour: "2-digit", minute: "2-digit", second: "2-digit" });
    return span <= 2 * 86_400_000
      ? date.toLocaleTimeString("id-ID", { hour: "2-digit", minute: "2-digit" })
      : date.toLocaleDateString("id-ID", { day: "numeric", month: "short" });
  };
}

export function relativeTime(value: string | number | Date) {
  const minutes = Math.round((Date.now() - new Date(value).getTime()) / 60_000);
  if (!Number.isFinite(minutes)) return "";
  if (minutes < 1) return "baru saja";
  if (minutes < 60) return `${minutes} menit lalu`;
  if (minutes < 1440) return `${Math.round(minutes / 60)} jam lalu`;
  return `${Math.round(minutes / 1440)} hari lalu`;
}

/** An official air-quality level (0 baik … 5 berbahaya) as a status tone, ISPU-style: always shown with its label. */
export function statusTone(level: number | null | undefined): "success" | "info" | "warning" | "danger" | "neutral" {
  if (level == null) return "neutral";
  return level <= 0 ? "success" : level === 1 ? "info" : level <= 3 ? "warning" : "danger";
}
