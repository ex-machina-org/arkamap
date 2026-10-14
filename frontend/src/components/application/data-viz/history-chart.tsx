import type { ReactNode } from "react";
import { Area, Bar, CartesianGrid, ComposedChart, Line, ReferenceArea, ReferenceDot, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { formatCompact, formatNumber, formatWhen, timeTick } from "./format";

/** One point of a history line: when, the value, and for averaged buckets the bucket's range. */
export type HistoryPoint = { t: string; v: number | null; lo?: number | null; hi?: number | null; note?: string };
export type HistorySeries = { key: string; name: string; color: string; points: HistoryPoint[] };
/** A value the chart points at by itself: the highest, the lowest. */
export type Mark = { t: string; v: number; label: string };

const axis = { axisLine: false, tickLine: false, tick: { fill: "var(--color-text-tertiary)", fontSize: 11 } } as const;
const time = (t: string) => new Date(t).getTime();

function HistoryTooltip({ active, label, payload, series, unit }: {
  active?: boolean; label?: number; payload?: readonly { payload?: Record<string, unknown> }[]; series: HistorySeries[]; unit?: string | null;
}) {
  const row = payload?.[0]?.payload;
  if (!active || !row || label == null) return null;
  const at = String(row.at ?? label);
  return <div className="rounded-lg border border-border-button-default bg-background-primary-default px-3 py-2 text-body-compact shadow-dropdown">
    <p className="text-caption-1 text-text-secondary">{formatWhen(at)}</p>
    {series.map(s => {
      const v = row[s.key];
      if (typeof v !== "number") return null;
      const lo = row[`${s.key}_lo`], hi = row[`${s.key}_hi`], note = row[`${s.key}_note`];
      return <div key={s.key} className="mt-0.5">
        <p className="flex items-center gap-1.5 text-text-primary">
          {series.length > 1 && <span className="size-2 shrink-0 rounded-full" style={{ background: s.color }} aria-hidden />}
          {series.length > 1 && <span className="text-text-secondary">{s.name}</span>}
          <span className="font-medium tabular-nums">{formatNumber(v)}{unit ? ` ${unit}` : ""}</span>
        </p>
        {typeof lo === "number" && typeof hi === "number" && lo !== hi &&
          <p className="text-caption-1 text-text-tertiary">rentang {formatNumber(lo)}–{formatNumber(hi)}</p>}
        {typeof note === "string" && <p className="text-caption-1 text-text-tertiary">{note}</p>}
      </div>;
    })}
  </div>;
}

/**
 * History on a time axis, built to be read without the table: an optional mean line, the
 * highest and lowest points labelled where they happened, the range of each averaged bucket
 * as a faint band, and a shaded stretch where nothing was recorded yet. One y-axis always;
 * series of different units belong in separate charts sharing `domain`.
 */
export function HistoryChart({ series, unit, variant = "line", mean, marks = [], limits = [], unrecorded, domain, height = 200, label }: {
  series: HistorySeries[]; unit?: string | null; variant?: "line" | "bar"; mean?: number | null; marks?: Mark[];
  /** Official limits (baku mutu, WHO), drawn as labelled lines so a reader sees when the line crosses them. */
  limits?: { value: number; label: string }[];
  /** From the start of the window up to this time the data was not collected yet. */
  unrecorded?: { from: string; to: string }; domain?: [number, number]; height?: number; label: string;
}) {
  const rows = new Map<number, Record<string, unknown>>();
  for (const s of series) for (const p of s.points) {
    const t = time(p.t);
    if (!Number.isFinite(t)) continue;
    const row = rows.get(t) ?? { t, at: p.t };
    row[s.key] = p.v;
    if (p.lo != null && p.hi != null) { row[`${s.key}_lo`] = p.lo; row[`${s.key}_hi`] = p.hi; row[`${s.key}_band`] = [p.lo, p.hi]; }
    if (p.note) row[`${s.key}_note`] = p.note;
    rows.set(t, row);
  }
  const data = [...rows.values()].sort((a, b) => (a.t as number) - (b.t as number));
  const first = data[0]?.t as number | undefined, last = data[data.length - 1]?.t as number | undefined;
  const span = domain ? domain[1] - domain[0] : first != null && last != null ? last - first : 0;
  const tick = timeTick(span);
  const single = series.length === 1 ? series[0] : null;
  const banded = single && data.some(row => row[`${single.key}_band`]);
  const points = data.length;
  // a mark's label sits beside its dot near either edge, so it is never cut off by the plot
  const lo = domain?.[0] ?? first ?? 0, width = (domain?.[1] ?? last ?? 0) - lo || 1;
  const side = (t: string) => { const f = (time(t) - lo) / width; return f > 0.8 ? "left" : f < 0.2 ? "right" : "top"; };
  // sparse lines show each real point, so a gap between dates never reads as smooth measured data
  const dotted = points <= 40;
  // a limit far from the data would flatten the line against the axis: drawn only when near it, else named in the key
  const values = series.flatMap(s => s.points.map(p => p.hi ?? p.v)).filter((v): v is number => v != null);
  const top = Math.max(...values, 0), bottom = Math.min(...values, top);
  const near = (v: number) => v <= Math.max(top * 1.8, 1) && v >= bottom * 0.5;
  return <div className="w-full"><div className="w-full" style={{ height }} role="img"
    aria-label={`${label}: ${points} titik${unit ? ` dalam ${unit}` : ""}${mean != null ? `, rata-rata ${formatNumber(mean)}` : ""}`}>
    <ResponsiveContainer width="100%" height="100%">
      <ComposedChart data={data} margin={{ top: 26, right: 12, bottom: 0, left: 0 }}>
        <CartesianGrid vertical={false} stroke="var(--color-border-button-default)" />
        <XAxis dataKey="t" type="number" scale="time" domain={domain ?? ["dataMin", "dataMax"]} tickFormatter={tick} minTickGap={32}
          padding={variant === "bar" ? { left: 12, right: 12 } : undefined} {...axis} />
        <YAxis width={44} domain={variant === "bar" ? [0, "auto"] : ["auto", "auto"]} allowDecimals={variant !== "bar"}
          tickFormatter={value => formatCompact(Number(value))} {...axis} />
        <Tooltip cursor={variant === "line" ? { stroke: "var(--color-text-tertiary)", strokeWidth: 1 } : { fill: "var(--color-background-secondary-default)" }}
          content={props => <HistoryTooltip active={props.active} label={props.label as number | undefined}
            payload={props.payload as readonly { payload?: Record<string, unknown> }[] | undefined} series={series} unit={unit} />} />
        {unrecorded && <ReferenceArea x1={time(unrecorded.from)} x2={time(unrecorded.to)} ifOverflow="hidden"
          fill="var(--color-background-secondary-default)" fillOpacity={0.9}
          label={{ value: "Belum tercatat", position: "insideTop", fill: "var(--color-text-tertiary)", fontSize: 11 }} />}
        {banded && <Area dataKey={`${single!.key}_band`} stroke="none" fill={single!.color} fillOpacity={0.12} isAnimationActive={false} activeDot={false} />}
        {variant === "bar"
          ? series.map(s => <Bar key={s.key} dataKey={s.key} name={s.name} fill={s.color} radius={[4, 4, 0, 0]} maxBarSize={24} isAnimationActive={false} />)
          : series.map(s => <Line key={s.key} dataKey={s.key} name={s.name} type="linear" stroke={s.color} strokeWidth={2} connectNulls
              dot={dotted ? { r: 4, fill: s.color, stroke: "var(--color-background-primary-default)", strokeWidth: 2 } : false} activeDot={{ r: 4, stroke: "var(--color-background-primary-default)", strokeWidth: 2 }}
              isAnimationActive={false} />)}
        {limits.map((limit, index) => near(limit.value) && <ReferenceLine key={limit.label} y={limit.value} ifOverflow="extendDomain"
          stroke={index === 0 ? "var(--color-text-primary)" : "var(--color-text-tertiary)"} strokeWidth={1} strokeDasharray={index === 0 ? undefined : "1 3"} />)}
        {mean != null && <ReferenceLine y={mean} ifOverflow="extendDomain" stroke="var(--color-text-tertiary)" strokeDasharray="4 4" />}
        {marks.map(mark => <ReferenceDot key={mark.label} x={time(mark.t)} y={mark.v} r={4} ifOverflow="extendDomain"
          fill={single?.color ?? "var(--color-text-secondary)"} stroke="var(--color-background-primary-default)" strokeWidth={2}
          label={{ value: `${mark.label} ${formatNumber(mark.v)}`, position: side(mark.t), offset: 8, fill: "var(--color-text-secondary)", fontSize: 11 }} />)}
      </ComposedChart>
    </ResponsiveContainer>
    </div>
    {(mean != null || limits.length > 0) && <ul className="mt-1 flex flex-wrap gap-x-4 gap-y-1 text-caption-1 text-text-secondary">
      {limits.map((limit, index) => <li key={limit.label} className="flex items-center gap-1.5">
        <span className={`w-4 border-t ${index === 0 ? "border-text-primary" : "border-dotted border-text-tertiary"}`} aria-hidden />
        {limit.label} {formatNumber(limit.value)}{unit ? ` ${unit}` : ""}{!near(limit.value) && (limit.value > top ? " (jauh di atas grafik)" : " (di bawah grafik)")}
      </li>)}
      {mean != null && <li className="flex items-center gap-1.5"><span className="w-4 border-t border-dashed border-text-tertiary" aria-hidden />
        rata-rata {formatNumber(mean)}{unit ? ` ${unit}` : ""}</li>}
    </ul>}
  </div>;
}

/** The numbers a reader checks first, above the chart: label, value, and when or how. */
export function StatGrid({ items }: { items: { label: string; value: ReactNode; hint?: ReactNode }[] }) {
  return <dl className="grid grid-cols-2 gap-2 sm:grid-cols-4">{items.map(item => <div key={item.label} className="min-w-0 rounded-lg bg-background-secondary-default px-3 py-2">
    <dt className="truncate text-caption-1 text-text-secondary">{item.label}</dt>
    <dd className="mt-0.5 truncate text-body-semibold text-text-primary">{item.value}</dd>
    {item.hint && <dd className="truncate text-caption-1 text-text-tertiary">{item.hint}</dd>}
  </div>)}</dl>;
}

/** Legend for two or more lines: identity by a swatch beside the name, never by text color. */
export function SeriesLegend({ items }: { items: { key: string; name: string; color: string; detail?: ReactNode }[] }) {
  return <ul className="flex flex-wrap gap-x-4 gap-y-1.5 text-body-compact">{items.map(item => <li key={item.key} className="flex min-w-0 items-center gap-1.5">
    <span className="h-0.5 w-3 shrink-0 rounded-full" style={{ background: item.color }} aria-hidden />
    <span className="shrink-0 text-text-primary">{item.name}</span>
    {item.detail && <span className="text-text-secondary">{item.detail}</span>}
  </li>)}</ul>;
}
