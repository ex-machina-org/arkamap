import { Bar, BarChart, CartesianGrid, LabelList, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { ValueTable } from "./chart-card";
import { SERIES, formatCompact, formatNumber } from "./format";
import { ChartTooltip } from "./time-series-chart";

export type CategoryDatum = { label: string; value: number; note?: string };

/**
 * Horizontal bars for comparing named items (regions, fields, sources). One hue: bars are
 * one measure, so color carries no identity; values are printed at the bar ends.
 */
export function CategoryBarChart({ data, unit, label, domain, color = SERIES[0] }: {
  data: CategoryDatum[]; unit?: string | null; label: string; domain?: [number, number]; color?: string;
}) {
  const height = Math.max(120, data.length * 32 + 16);
  return <div className="w-full" style={{ height }} role="img" aria-label={`${label}: ${data.map(item => `${item.label} ${formatNumber(item.value)}`).join(", ")}`}>
    <ResponsiveContainer width="100%" height="100%">
      <BarChart data={data} layout="vertical" margin={{ top: 0, right: 48, bottom: 0, left: 0 }} barCategoryGap={6}>
        <CartesianGrid horizontal={false} stroke="var(--color-border-button-default)" strokeDasharray="2 4" />
        <XAxis type="number" domain={domain ?? [0, "dataMax"]} hide />
        <YAxis type="category" dataKey="label" width={128} axisLine={false} tickLine={false} interval={0}
          tick={{ fill: "var(--color-text-secondary)", fontSize: 12 }} tickFormatter={value => String(value).length > 18 ? `${String(value).slice(0, 17)}…` : String(value)} />
        <Tooltip cursor={{ fill: "var(--color-background-secondary-default)" }} content={props => <ChartTooltip {...props} unit={unit} />} />
        <Bar dataKey="value" name={label} fill={color} radius={[0, 4, 4, 0]} maxBarSize={20} isAnimationActive={false}>
          <LabelList dataKey="value" position="right" formatter={(value: unknown) => formatCompact(Number(value))} fill="var(--color-text-primary)" fontSize={12} />
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  </div>;
}

export function CategoryTable({ data, unit, label }: { data: CategoryDatum[]; unit?: string | null; label: string }) {
  return <ValueTable caption={label} columns={["Nama", label, ...(data.some(item => item.note) ? ["Keterangan"] : [])]}
    rows={data.map(item => [item.label, `${formatNumber(item.value)}${unit ? ` ${unit}` : ""}`, ...(data.some(row => row.note) ? [item.note ?? ""] : [])])} />;
}
