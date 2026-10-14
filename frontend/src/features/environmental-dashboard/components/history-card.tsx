import { OrdersChartCard } from "@/components/application/dashboard/orders-chart-card";
import type { DTO } from "@/lib/api/client";
import { EVENT_KINDS } from "../event-kinds";
import { formatMonth, formatMonthShort, periodLabel } from "../format";
import { monthDelta } from "../insights";

/** BoardUI Orders chart card, one series of recorded events per month. */
export function HistoryCard({ series }: { series: DTO<"HistoryPanel"> }) {
  const kind = EVENT_KINDS[series.kind];
  return <OrdersChartCard
    title={`${kind.label} per bulan`}
    locale="id-ID"
    color={kind.chartVar}
    legend={{ current: kind.label }}
    caption={`Total ${periodLabel(series.days)}`}
    delta={monthDelta(series.months)}
    data={series.months.map(month => ({ label: formatMonthShort(month.month), fullLabel: formatMonth(month.month), current: month.count }))}
  />;
}
