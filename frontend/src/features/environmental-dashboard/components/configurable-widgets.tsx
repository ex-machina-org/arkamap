import { lazy, Suspense } from "react";
import { TimeSeriesChart } from "@/components/application/data-viz/time-series-chart";
import { Skeleton } from "@/components/ui/skeleton";
import type { DTO } from "@/lib/api/client";
import { prettifyId } from "../labels";
import { formatDecimal } from "../format";
import { TREND_DAYS, useMetricRanking, useRegionSummary, useRegionWeek } from "../use-region-data";
import { DashboardCard, PanelUnavailable, type CardDelta } from "./dashboard-card";
import { IndicatorKpi } from "./kpi-tiles";
import { RankingCard } from "./ranking-card";
import type { WidgetContext } from "./widget-renderer";

/* Widgets that load their own data: a metric the user picked, or the map with its layers. */

// maplibre comes with the map, after the cards around it have shown
const RegionMapPanel = lazy(() => import("./region-map-panel").then(module => ({ default: module.RegionMapPanel })));

export function LazyRegionMap({ focus, layers, title }: { focus: DTO<"Focus">; layers: DTO<"DashboardView">["layers"]; title?: string }) {
  return <Suspense fallback={<div aria-hidden className="h-full rounded-2xl bg-background-secondary-default" />}>
    <RegionMapPanel focus={focus} layers={layers} title={title} />
  </Suspense>;
}

export function IndicatorKpiWidget({ metric, ctx, title }: { metric?: string; ctx: WidgetContext; title?: string }) {
  const focus = ctx.view.focus;
  const summary = useRegionSummary(focus?.id ?? null);
  if (!focus || !metric) return <PanelUnavailable title="Butuh wilayah profil" description="KPI indikator membaca data satu wilayah; profil ini memantau seluruh Indonesia." />;
  if (summary === undefined) return <Skeleton className="h-full rounded-2xl" />;
  return <IndicatorKpi indicator={summary?.indicators?.find(item => item.metric === metric)} regionName={focus.name} title={title} />;
}

export function MetricRankingWidget({ metric, ctx, title }: { metric: string; ctx: WidgetContext; title?: string }) {
  const ranking = useMetricRanking(metric, ctx.view.focus);
  const def = ctx.metric(metric);
  const label = def?.label ?? prettifyId(metric);
  if (ranking === undefined) return <DashboardCard title={title ?? `Peringkat ${label.toLowerCase()}`}><Skeleton className="min-h-0 flex-1 rounded-2lg" /></DashboardCard>;
  if (ranking === null) return <DashboardCard title={title ?? `Peringkat ${label.toLowerCase()}`}><PanelUnavailable title="Peringkat gagal dimuat" description="Coba muat ulang halaman." /></DashboardCard>;
  return <RankingCard ranking={ranking} metricLabel={label} unit={def?.unit} focusName={ctx.view.focus?.name} title={title} />;
}


export const day = new Intl.DateTimeFormat("id-ID", { weekday: "short", day: "numeric", month: "short", timeZone: "UTC" });

/** Change from the first day to the last, coloured by whether that direction is good for this metric. */
export function trendDelta(first: number, last: number, polarity?: string): CardDelta {
  const change = first ? (last - first) / Math.abs(first) * 100 : 0;
  if (Math.abs(change) < 1) return { label: "Stabil", color: "neutral" };
  const worse = polarity === "high_good" ? change < 0 : change > 0;
  return { label: `${change > 0 ? "Naik" : "Turun"} ${formatDecimal(Math.round(Math.abs(change)))}%`, color: worse ? "rose" : "lime" };
}

/** One metric of the profile's region over the last week, as a line: is it getting better or worse? */
export function MetricTrendWidget({ metric, ctx, title }: { metric?: string; ctx: WidgetContext; title?: string }) {
  const focus = ctx.view.focus;
  const week = useRegionWeek(focus?.id ?? null, metric ? [metric] : []);
  const points = week && metric ? week[metric] ?? [] : week === null ? null : undefined;
  const def = metric ? ctx.metric(metric) : undefined;
  const label = def?.label ?? prettifyId(metric ?? "");
  const name = title ?? `${label}, ${TREND_DAYS} Hari`;
  if (!focus || !metric) return <PanelUnavailable title="Butuh wilayah profil" description="Tren membaca data satu wilayah; profil ini memantau seluruh Indonesia." />;
  if (points === undefined) return <DashboardCard title={name}><Skeleton className="min-h-0 flex-1 rounded-2lg" /></DashboardCard>;
  if (points === null) return <DashboardCard title={name}><PanelUnavailable title="Tren gagal dimuat" description="Coba muat ulang halaman." /></DashboardCard>;
  if (points.length < 2) return <DashboardCard title={name}>
    <PanelUnavailable title="Riwayat belum cukup" description={`Data ${focus.name} baru ${points.length} hari; garis tampil setelah ada dua hari atau lebih.`} />
  </DashboardCard>;
  const first = points[0], last = points[points.length - 1];
  const unit = def?.unit ?? "";
  return <DashboardCard title={name} value={`${formatDecimal(last.value)}${unit ? ` ${unit}` : ""}`} delta={trendDelta(first.value, last.value, def?.polarity)}
    description={`${focus.name}, dibanding ${day.format(new Date(first.period))}${points.some(point => point.is_modelled) ? " · nilai model" : ""}`}>
    <div className="min-h-32 flex-1">
      <TimeSeriesChart points={points.map(point => ({ t: point.period, v: point.value }))} unit={unit} label={label} height="100%" formatTime={t => day.format(new Date(t))} />
    </div>
  </DashboardCard>;
}
