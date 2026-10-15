import { TimeSeriesChart } from "@/components/application/data-viz/time-series-chart";
import type { DTO } from "@/lib/api/client";
import { EVENT_KINDS } from "../event-kinds";
import { formatDecimal, formatInteger, formatMonth, periodLabel } from "../format";
import { monthSeries } from "../insights";
import { DashboardCard, LegendTiles } from "./dashboard-card";

/**
 * Recorded events per month as bars. Every month of the period is drawn, empty ones as zero,
 * so a quiet stretch reads as quiet instead of disappearing. Partial months (where the window
 * starts, and the running month) are drawn but kept out of the average and the peak.
 */
export function HistoryCard({ series, title }: { series: DTO<"HistoryPanel">; title?: string }) {
  const kind = EVENT_KINDS[series.kind];
  const months = monthSeries(series.months, series.days);
  const complete = months.filter(month => !month.partial);
  const total = months.reduce((sum, month) => sum + month.count, 0);
  const average = complete.length ? complete.reduce((sum, month) => sum + month.count, 0) / complete.length : null;
  const lastComplete = complete.at(-1);
  const peak = complete.reduce<(typeof complete)[number] | undefined>((best, month) => !best || month.count > best.count ? month : best, undefined);
  const label = `${kind.label} per bulan`;
  return <DashboardCard
    title={title ?? label}
    value={formatInteger(total)}
    description={`Total ${periodLabel(series.days)}, termasuk bulan berjalan`}
    footer={<LegendTiles items={[
      { key: "last", label: lastComplete ? formatMonth(lastComplete.month) : "Bulan lalu", value: lastComplete ? formatInteger(lastComplete.count) : "Belum ada" },
      { key: "avg", label: "Rata-rata per bulan", value: average != null ? formatDecimal(Math.round(average * 10) / 10) : "Belum ada" },
      { key: "peak", label: "Bulan tertinggi", value: peak && peak.count > 0 ? `${formatMonth(peak.month)} (${formatInteger(peak.count)})` : "Tidak ada" },
    ]} />}>
    <div className="min-h-32 flex-1">
      <TimeSeriesChart points={months.map(month => ({ t: month.month, v: month.count }))} label={label} variant="bar" color={kind.chartVar} height="100%"
        // With the year: a 365-day window touches the same month name twice.
        formatTime={t => formatMonth(new Date(t).toISOString())}
        reference={average != null && average > 0 ? { value: average, label: "rata-rata" } : undefined} />
    </div>
  </DashboardCard>;
}
