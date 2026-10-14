const relative = new Intl.RelativeTimeFormat("id-ID", { numeric: "auto" });

const STEPS: [Intl.RelativeTimeFormatUnit, number][] = [
  ["day", 86_400],
  ["hour", 3_600],
  ["minute", 60],
];

/** "3 jam yang lalu" style label; falls back to the raw value when the date is invalid. */
export function relativeTime(iso: string, now = Date.now()) {
  const time = Date.parse(iso);
  if (Number.isNaN(time)) return iso;
  const seconds = Math.round((time - now) / 1000);
  for (const [unit, size] of STEPS) {
    if (Math.abs(seconds) >= size) return relative.format(Math.round(seconds / size), unit);
  }
  return "baru saja";
}

export function absoluteTime(iso: string) {
  const time = Date.parse(iso);
  return Number.isNaN(time) ? iso : new Date(time).toLocaleString("id-ID", { dateStyle: "medium", timeStyle: "short" });
}

/** [lng, lat] as "lintang, bujur" with four decimals. */
export function formatCoords([lng, lat]: [number, number]) {
  return `${lat.toFixed(4)}, ${lng.toFixed(4)}`;
}
