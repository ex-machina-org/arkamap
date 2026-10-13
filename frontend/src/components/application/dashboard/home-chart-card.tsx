import { useId, useState } from "react";
import { Area, CartesianGrid, ComposedChart, Line, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { Chip } from "@/components/base/badges/chip";
import { DashboardPeriodTabs, type DashboardPeriod } from "./dashboard-period-tabs";

const months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const bars = [3000, 6900, 8900, 6600, 3400, 2100, 3500, 4700, 6300, 4100, 10600, 7600];
const line = [1400, 1900, 2700, 2400, 3500, 3200, 2800, 3900, 4700, 4400, 3700, 5300];
const areaData = months.map((label, index) => ({ label, value: line[index] }));
const periodFigures = {
  earned: { Weekly: ["$7,462", "+14.8%", 1], Monthly: ["$31,842", "+11.3%", 0.82], Yearly: ["$96,412", "+21.6%", 1.12] },
  revenue: { Weekly: ["$18,240", "+9.4%", 1], Monthly: ["$72,960", "+7.8%", 0.88], Yearly: ["$218,880", "+12.6%", 1.08] },
} as const;

export function HomeChartCard({ kind }: { kind: "earned" | "revenue" }) {
  const [period, setPeriod] = useState<DashboardPeriod>("Weekly");
  const gradientId = useId();
  const earned = kind === "earned";
  const [amount, delta, factor] = periodFigures[kind][period];
  const chartData = areaData.map(point => ({ ...point, value: Math.round(point.value * factor) }));
  return <section aria-label={earned ? "Earned so far" : "Revenue"} className="flex min-w-0 flex-col gap-6 rounded-2xl bg-background-secondary-default px-4 pb-3 pt-4">
    <div className="flex min-h-14 flex-wrap items-start justify-between gap-2">
      <div><p className="text-sm font-medium leading-5 text-text-secondary">{earned ? "Earned so far" : "Revenue"}</p><div className="mt-0.5 flex items-center gap-2"><strong className="text-[24px] font-medium leading-[34px] text-text-primary">{amount}</strong><Chip variant="bold" color="lime">{delta}</Chip></div></div>
      <DashboardPeriodTabs label={`${earned ? "Earned so far" : "Revenue"} period`} value={period} onChange={setPeriod} />
    </div>
    {earned ? <div className="flex h-[221px] min-w-0 gap-2" role="img" aria-label="Monthly earnings bar chart from January through December">
      <div className="flex w-9 shrink-0 flex-col justify-between pb-7 text-right text-xs text-text-tertiary"><span>$10K</span><span>$5K</span><span>$3K</span><span>$0</span></div>
      <div className="grid min-w-0 flex-1 grid-cols-12 gap-2"><div className="col-span-12 grid h-[190px] grid-cols-12 gap-2">{bars.map((value, index) => <div key={months[index]} className="relative h-full min-w-0 overflow-hidden rounded-[11px] bg-background-tertiary-default"><div className="absolute inset-x-0 bottom-0 rounded-[11px] bg-chart-3" style={{ height: `${Math.min(value * factor / 11000 * 100, 100)}%` }} /></div>)}</div>{months.map(month => <span key={month} className="min-w-0 text-center text-xs text-text-tertiary">{month}</span>)}</div>
    </div> : <div className="h-[229px] min-w-0" role="img" aria-label="Monthly revenue area chart from January through December"><ResponsiveContainer width="100%" height="100%"><ComposedChart data={chartData} margin={{ top: 4, right: 0, left: -10, bottom: 0 }}>
      <defs><linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="var(--color-chart-2-active)" stopOpacity={0.22} /><stop offset="100%" stopColor="var(--color-chart-2-active)" stopOpacity={0} /></linearGradient></defs>
      <CartesianGrid vertical={false} horizontal={false} />
      <YAxis domain={[0, 6000]} ticks={[0, 2000, 4000, 6000]} axisLine={false} tickLine={false} tick={{ fill: "var(--color-text-tertiary)", fontSize: 12 }} tickFormatter={value => value ? `$${value / 1000}K` : "$0"} width={42} />
      <XAxis dataKey="label" axisLine={false} tickLine={false} tick={{ fill: "var(--color-text-tertiary)", fontSize: 12 }} tickMargin={9} />
      <Tooltip formatter={(value) => `$${Number(value).toLocaleString()}`} contentStyle={{ borderRadius: 10, borderColor: "var(--color-border-button-default)", background: "var(--color-background-primary-default)", color: "var(--color-text-primary)" }} />
      <Area dataKey="value" type="monotone" stroke="none" fill={`url(#${gradientId})`} isAnimationActive={false} /><Line dataKey="value" type="monotone" stroke="var(--color-chart-2-active)" strokeWidth={2.5} dot={false} activeDot={{ r: 4 }} isAnimationActive={false} />
    </ComposedChart></ResponsiveContainer></div>}
  </section>;
}
