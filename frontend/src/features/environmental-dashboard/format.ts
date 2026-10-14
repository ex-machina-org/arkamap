const integer = new Intl.NumberFormat("id-ID");
const decimal = new Intl.NumberFormat("id-ID", { maximumFractionDigits: 2 });
const compact = new Intl.NumberFormat("id-ID", { notation: "compact", maximumFractionDigits: 1 });
const dateTime = new Intl.DateTimeFormat("id-ID", { dateStyle: "medium", timeStyle: "short" });
const monthYear = new Intl.DateTimeFormat("id-ID", { month: "short", year: "numeric", timeZone: "UTC" });
const monthOnly = new Intl.DateTimeFormat("id-ID", { month: "short", timeZone: "UTC" });
const relative = new Intl.RelativeTimeFormat("id-ID", { numeric: "auto" });

export const formatInteger = (value: number) => integer.format(value);
export const formatDecimal = (value: number) => decimal.format(value);
export const formatCompact = (value: number) => compact.format(value);

const parse = (iso?: string | null) => {
  if (!iso) return null;
  const date = new Date(iso);
  return Number.isNaN(date.getTime()) ? null : date;
};

export function formatDateTime(iso?: string | null) {
  const date = parse(iso);
  return date ? dateTime.format(date) : null;
}

const RELATIVE_UNITS: [Intl.RelativeTimeFormatUnit, number][] = [["day", 86_400], ["hour", 3_600], ["minute", 60]];

export function formatRelative(iso?: string | null, now = Date.now()) {
  const date = parse(iso);
  if (!date) return null;
  const seconds = Math.round((date.getTime() - now) / 1000);
  const [unit, size] = RELATIVE_UNITS.find(([, size]) => Math.abs(seconds) >= size) ?? ["minute", 60];
  return relative.format(Math.round(seconds / size), unit);
}

/** Backend months arrive as ISO timestamps at the first of the month (UTC). */
function monthDate(month: string) {
  const [year, index] = month.slice(0, 7).split("-").map(Number);
  return Number.isFinite(year) && Number.isFinite(index) ? new Date(Date.UTC(year, index - 1, 1)) : null;
}

export const formatMonth = (month: string) => {
  const date = monthDate(month);
  return date ? monthYear.format(date) : month.slice(0, 7);
};

export const formatMonthShort = (month: string) => {
  const date = monthDate(month);
  return date ? monthOnly.format(date) : month.slice(5, 7);
};

export const periodLabel = (days: number) => `${days} hari terakhir`;

export const recordText = (record: Record<string, unknown>, key: string) => {
  const value = record[key];
  return typeof value === "string" && value.trim() ? value : undefined;
};

export const recordNumber = (record: Record<string, unknown>, key: string) => {
  const value = record[key];
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
};

export const clampPercent = (value: number) => Math.min(100, Math.max(0, value));

const dateOnly = new Intl.DateTimeFormat("id-ID", { dateStyle: "medium", timeZone: "UTC" });

/** Indicator periods arrive as `YYYY-MM-DD`, `YYYY-MM` or free text. */
export function formatPeriodText(period: string) {
  if (/^\d{4}-\d{2}-\d{2}/.test(period)) {
    const date = new Date(`${period.slice(0, 10)}T00:00:00Z`);
    if (!Number.isNaN(date.getTime())) return dateOnly.format(date);
  }
  return /^\d{4}-\d{2}$/.test(period) ? formatMonth(period) : period;
}

/** True while the month is still running, so its count is not comparable with a full month. */
export function isCurrentMonth(month: string, now = new Date()) {
  const date = monthDate(month);
  return !!date && date.getUTCFullYear() === now.getUTCFullYear() && date.getUTCMonth() === now.getUTCMonth();
}
