import { RiArrowDownLine, RiArrowRightLine, RiArrowUpLine } from "@remixicon/react";
import { Line, LineChart, PolarAngleAxis, RadialBar, RadialBarChart, ResponsiveContainer } from "recharts";
import { StatusBadge } from "@/components/ui/status-badge";
import { SERIES, formatNumber, formatValue } from "./format";

/** Headline number with the change since the previous reading and an optional sparkline. */
export function StatValue({ value, unit, previous, trend, color = SERIES[0] }: {
  value: unknown; unit?: string | null; previous?: number | null; trend?: number[]; color?: string;
}) {
  const numeric = typeof value === "number" && Number.isFinite(value);
  const delta = numeric && typeof previous === "number" ? value - previous : null;
  const Icon = delta == null || delta === 0 ? RiArrowRightLine : delta > 0 ? RiArrowUpLine : RiArrowDownLine;
  return <div className="flex items-end justify-between gap-3">
    <div className="min-w-0">
      <p className="truncate text-heading-xl tabular-nums text-text-primary">
        {numeric ? formatNumber(value) : formatValue(value)}{numeric && unit && <span className="ml-1 text-body-regular text-text-secondary">{unit}</span>}
      </p>
      {delta != null && <p className="mt-1 flex items-center gap-1 text-caption-1 text-text-secondary">
        <Icon className="size-3.5" aria-hidden />{delta === 0 ? "Sama dengan" : `${delta > 0 ? "+" : "−"}${formatNumber(Math.abs(delta))}${unit ? ` ${unit}` : ""} dari`} pembacaan sebelumnya
      </p>}
    </div>
    {trend && trend.length > 2 && <div className="h-10 w-24 shrink-0" aria-hidden>
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={trend.map((v, i) => ({ i, v }))}><Line dataKey="v" stroke={color} strokeWidth={2} dot={false} isAnimationActive={false} /></LineChart>
      </ResponsiveContainer>
    </div>}
  </div>;
}

/**
 * Half-circle meter for a value inside a known range. The range must be real (0–100 for
 * percentages, or the observed min/max); it never implies a danger threshold.
 */
export function GaugeMeter({ value, min, max, unit, rangeLabel, color = SERIES[0] }: {
  value: number; min: number; max: number; unit?: string | null; rangeLabel?: string; color?: string;
}) {
  const span = max - min || 1;
  const clamped = Math.min(max, Math.max(min, value));
  return <div className="flex flex-col items-center">
    <div className="relative h-28 w-full max-w-56" role="img" aria-label={`${formatNumber(value)}${unit ? ` ${unit}` : ""} pada rentang ${formatNumber(min)}–${formatNumber(max)}`}>
      <ResponsiveContainer width="100%" height="100%">
        <RadialBarChart data={[{ v: ((clamped - min) / span) * 100 }]} cy="100%" innerRadius="140%" outerRadius="190%" startAngle={180} endAngle={0} barSize={12}>
          <PolarAngleAxis type="number" domain={[0, 100]} tick={false} />
          <RadialBar dataKey="v" fill={color} background={{ fill: "var(--color-background-secondary-default)" }} cornerRadius={6} isAnimationActive={false} />
        </RadialBarChart>
      </ResponsiveContainer>
      <p className="absolute inset-x-0 bottom-0 text-center text-heading-lg tabular-nums text-text-primary">
        {formatNumber(value)}{unit && <span className="ml-1 text-body-compact text-text-secondary">{unit}</span>}
      </p>
    </div>
    <div className="flex w-full max-w-56 justify-between text-caption-1 tabular-nums text-text-tertiary"><span>{formatNumber(min)}</span><span>{formatNumber(max)}</span></div>
    {rangeLabel && <p className="text-caption-1 text-text-secondary">{rangeLabel}</p>}
  </div>;
}

const STATUS_WORDS: [RegExp, "success" | "warning" | "danger"][] = [
  [/^(ok|oke|normal|baik|aman|aktif|active|on|online|ready|siap|good|sehat)$/i, "success"],
  [/^(warn|warning|waspada|siaga|peringatan|low|rendah|lemah|degraded|maintenance|kalibrasi)$/i, "warning"],
  [/^(error|err|fail|failed|gagal|rusak|mati|off|offline|down|kritis|critical|bahaya|awas|alarm|fault)$/i, "danger"],
];

/** Text/boolean state as a labelled badge. Unknown words stay neutral instead of guessing a severity. */
export function StatusValue({ value }: { value: unknown }) {
  if (value == null || value === "") return <StatusBadge tone="neutral">Belum ada data</StatusBadge>;
  if (typeof value === "boolean") return <StatusBadge tone={value ? "success" : "neutral"}>{value ? "Ya / aktif" : "Tidak / nonaktif"}</StatusBadge>;
  const text = String(value).trim();
  const tone = STATUS_WORDS.find(([pattern]) => pattern.test(text))?.[1] ?? "neutral";
  return <StatusBadge tone={tone}>{text}</StatusBadge>;
}
