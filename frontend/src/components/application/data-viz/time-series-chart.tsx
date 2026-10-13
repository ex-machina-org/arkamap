import { Bar, BarChart, CartesianGrid, Line, LineChart, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { ValueTable } from "./chart-card";
import { SERIES, formatCompact, formatDateTime, formatNumber, timeTick } from "./format";

export type SeriesPoint = { t: string; v: number | null };

const axis = { axisLine: false, tickLine: false, tick: { fill: "var(--color-text-tertiary)", fontSize: 11 } } as const;

/** Tooltip body shared by all charts: time or label on top, value with unit below. */
export function ChartTooltip({ active, label, payload, unit, labelFormat }: {
  active?: boolean; label?: string | number; payload?: readonly { value?: unknown; name?: unknown }[]; unit?: string | null;
  labelFormat?: (label: string | number) => string;
}) {
  if (!active || !payload?.length) return null;
  return <div className="rounded-lg border border-border-button-default bg-background-primary-default px-3 py-2 text-body-compact shadow-dropdown">
    {label != null && <p className="text-caption-1 text-text-secondary">{labelFormat ? labelFormat(label) : String(label)}</p>}
    {payload.map((item, index) => <p key={index} className="font-medium tabular-nums text-text-primary">
      {typeof item.value === "number" ? formatNumber(item.value) : String(item.value ?? "—")}{unit ? ` ${unit}` : ""}
    </p>)}
  </div>;
}

/**
 * One measure over time. `line` for continuous readings, `bar` for counts per reading.
 * A `reference` draws a labelled dashed line, e.g. the regional value to compare against.
 */
export function TimeSeriesChart({ points, unit, label, variant = "line", color = SERIES[0], reference, height = 176 }: {
  points: SeriesPoint[]; unit?: string | null; label: string; variant?: "line" | "bar"; color?: string;
  reference?: { value: number; label: string }; height?: number;
}) {
  const data = points.map(point => ({ t: new Date(point.t).getTime(), v: point.v })).filter(point => Number.isFinite(point.t)).sort((a, b) => a.t - b.t);
  const span = data.length > 1 ? data[data.length - 1].t - data[0].t : 0;
  const tick = timeTick(span);
  const common = { data, margin: { top: 8, right: 8, bottom: 0, left: 0 } };
  const children = [
    <CartesianGrid key="grid" vertical={false} stroke="var(--color-border-button-default)" strokeDasharray="2 4" />,
    <XAxis key="x" dataKey="t" type="number" scale="time" domain={["dataMin", "dataMax"]} tickFormatter={tick} minTickGap={32} {...axis} />,
    <YAxis key="y" width={44} domain={variant === "bar" ? [0, "auto"] : ["auto", "auto"]} tickFormatter={value => formatCompact(Number(value))} {...axis} />,
    <Tooltip key="tip" cursor={variant === "line" ? { stroke: "var(--color-text-tertiary)", strokeWidth: 1 } : { fill: "var(--color-background-secondary-default)" }}
      content={props => <ChartTooltip {...props} unit={unit} labelFormat={value => formatDateTime(value)} />} />,
    reference && <ReferenceLine key="ref" y={reference.value} ifOverflow="extendDomain" stroke="var(--color-text-tertiary)" strokeDasharray="4 4"
      label={{ value: reference.label, position: "insideTopRight", fill: "var(--color-text-secondary)", fontSize: 11 }} />,
  ];
  return <div className="w-full" style={{ height }} role="img" aria-label={`${label}: ${data.length} pembacaan${unit ? ` dalam ${unit}` : ""}`}>
    <ResponsiveContainer width="100%" height="100%">
      {variant === "bar"
        ? <BarChart {...common}>{children}<Bar dataKey="v" name={label} fill={color} radius={[4, 4, 0, 0]} maxBarSize={28} isAnimationActive={false} /></BarChart>
        : <LineChart {...common}>{children}<Line dataKey="v" name={label} type="monotone" stroke={color} strokeWidth={2} dot={data.length <= 2 ? { r: 4, fill: color } : false}
            activeDot={{ r: 4, stroke: "var(--color-background-primary-default)", strokeWidth: 2 }} connectNulls isAnimationActive={false} /></LineChart>}
    </ResponsiveContainer>
  </div>;
}

/** Table view for a time series, newest first. */
export function SeriesTable({ points, unit, label }: { points: SeriesPoint[]; unit?: string | null; label: string }) {
  const rows = [...points].sort((a, b) => new Date(b.t).getTime() - new Date(a.t).getTime())
    .map(point => [formatDateTime(point.t), point.v == null ? "—" : `${formatNumber(point.v)}${unit ? ` ${unit}` : ""}`]);
  return <ValueTable caption={label} columns={["Waktu", label]} rows={rows} />;
}
