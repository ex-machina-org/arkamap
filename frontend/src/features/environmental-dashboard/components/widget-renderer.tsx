import type { ReactNode } from "react";
import { SensorWidget } from "@/components/application/data-viz/sensor-widget";
import type { DTO } from "@/lib/api/client";
import { EVENT_KINDS } from "../event-kinds";
import { alertCount } from "../insights";
import { prettifyId } from "../labels";
import type { DashboardView } from "../types";
import type { WidgetInstance } from "../widget-layout";
import { DashboardCard, PanelUnavailable } from "./dashboard-card";
import { HistoryCard } from "./history-card";
import { ImpactCard } from "./impact-card";
import { IndicatorTable } from "./indicator-table";
import { InsightTabs, type ListTab } from "./insight-tabs";
import { alertsStat, eventStat, iotStat, IOT_STAT_LABELS, modeStat } from "../kpi-stats";
import { IndicatorKpiWidget, LazyRegionMap, MetricRankingWidget } from "./configurable-widgets";
import { KpiTile } from "./kpi-tiles";
import { RankingCard } from "./ranking-card";
import { ScoreCard } from "./score-card";


export type WidgetContext = {
  view: DashboardView;
  region: DTO<"OurRegion"> | null | undefined;
  devices: DTO<"DeviceDashboard">[];
  metric: (id: string) => DTO<"MetricDef"> | undefined;
};

const findSensor = (devices: WidgetContext["devices"], deviceId?: number, field?: string) => {
  const entry = devices.find(item => item.device.id === deviceId);
  const widget = entry?.widgets.find(item => item.field === field);
  return entry && widget ? { device: entry.device, widget } : undefined;
};

/** The widget's own name, used when the user has not given it one and in the gallery and edit bar. */
export function defaultTitle(item: Pick<WidgetInstance, "type" | "config">, ctx: WidgetContext): string {
  const { kind, stat, metric, deviceId, field } = item.config;
  const metricLabel = (id?: string) => id ? ctx.metric(id)?.label ?? prettifyId(id) : "";
  switch (item.type) {
    case "kpi-mode": return "Mode Profil";
    case "kpi-event": return kind ? EVENT_KINDS[kind].label : "Kejadian";
    case "kpi-alerts": return "Peringatan Aktif";
    case "kpi-iot": return stat ? IOT_STAT_LABELS[stat] : "Perangkat IoT";
    case "kpi-indicator": return metricLabel(metric) || "Indikator";
    case "ranking": return `Peringkat ${metricLabel(metric ?? ctx.view.ranking.metric)}`;
    case "map": return "Peta Wilayah";
    case "impact": return "Dampak Tercatat";
    case "insight": return "Sorotan Wilayah";
    case "score": return "Skor Perhatian Gabungan";
    case "indicators": return "Indikator Pilihan";
    case "history": return `${kind ? EVENT_KINDS[kind].label : "Kejadian"} Per Bulan`;
    case "sensor": {
      const sensor = findSensor(ctx.devices, deviceId, field);
      return sensor ? `${sensor.widget.label} · ${sensor.device.name}` : "Sensor";
    }
  }
}

const unavailable = (title: string, description: string) => <DashboardCard title={title}><PanelUnavailable title="Data tidak tersedia" description={description} /></DashboardCard>;

/** Renders one widget instance; a widget whose data is gone says so instead of disappearing. */
export function renderWidget(item: WidgetInstance, ctx: WidgetContext): ReactNode {
  const { view, region, devices } = ctx;
  const { kind, stat, metric, deviceId, field } = item.config;
  const title = item.title;
  const name = title ?? defaultTitle(item, ctx);
  switch (item.type) {
    case "kpi-mode": return <KpiTile stat={modeStat(view)} title={title} />;
    case "kpi-event": {
      const value = kind && eventStat(view, kind);
      return value ? <KpiTile stat={value} title={title} /> : <PanelUnavailable title={name} description="Bidang profil ini tidak memantau jenis kejadian ini." />;
    }
    case "kpi-alerts": return <KpiTile stat={alertsStat(alertCount(view.alerts))} title={title} />;
    case "kpi-iot": return stat ? <KpiTile stat={iotStat(devices, stat)} variant="plain" title={title} /> : null;
    case "kpi-indicator": return <IndicatorKpiWidget metric={metric} ctx={ctx} title={title} />;
    case "ranking": return metric && metric !== view.ranking.metric ? <MetricRankingWidget metric={metric} ctx={ctx} title={title} />
      : view.ranking.results.length ? <RankingCard ranking={view.ranking} metricLabel={ctx.metric(view.ranking.metric)?.label ?? prettifyId(view.ranking.metric)}
        unit={ctx.metric(view.ranking.metric)?.unit ?? region?.indicators.find(item => item.metric === view.ranking.metric)?.unit} focusName={view.focus?.name} title={title} />
      : unavailable(name, "Belum ada wilayah dengan data untuk peringkat ini.");
    case "map": return view.focus ? <LazyRegionMap focus={view.focus} layers={view.layers} title={title} /> : unavailable(name, "Peta wilayah butuh wilayah profil; profil ini memantau seluruh Indonesia.");
    case "impact": return view.impact ? <ImpactCard impact={view.impact} title={title} /> : unavailable(name, "Dampak tercatat hanya dihitung untuk mode Tanggap darurat.");
    case "insight": {
      const tabs = view.mode.panels.filter((id): id is ListTab => id === "events" || id === "alerts");
      return <InsightTabs view={view} tabs={tabs.length ? tabs : ["alerts", "events"]} />;
    }
    case "score": return view.focus ? <ScoreCard regionId={view.focus.id} title={title} /> : unavailable(name, "Skor gabungan butuh wilayah profil.");
    case "indicators": return region?.indicators.length ? <div className="h-full overflow-auto rounded-2xl"><IndicatorTable region={region} title={title} /></div>
      : unavailable(name, "Profil ini belum punya indikator wilayah.");
    case "history": {
      const series = view.history?.find(entry => entry.kind === kind);
      return series ? <HistoryCard series={series} title={title} /> : unavailable(name, "Riwayat bulanan hanya dihitung untuk mode Perencanaan dan jenis kejadian yang dipantau bidang ini.");
    }
    case "sensor": {
      const sensor = findSensor(devices, deviceId, field);
      // ChartCard sizes to its content; the cell scrolls if the user makes it smaller.
      return sensor ? <div className="h-full overflow-auto rounded-xl [&>section]:min-h-full"><SensorWidget widget={sensor.widget} device={sensor.device} /></div>
        : unavailable(name, "Perangkat atau field ini sudah tidak ada. Hapus widget ini lewat Atur Tampilan.");
    }
  }
}
