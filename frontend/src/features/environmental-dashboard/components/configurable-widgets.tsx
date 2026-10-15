import { lazy, Suspense } from "react";
import { Skeleton } from "@/components/ui/skeleton";
import type { DTO } from "@/lib/api/client";
import { prettifyId } from "../labels";
import { useMetricRanking, useRegionSummary } from "../use-region-data";
import { DashboardCard, PanelUnavailable } from "./dashboard-card";
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

