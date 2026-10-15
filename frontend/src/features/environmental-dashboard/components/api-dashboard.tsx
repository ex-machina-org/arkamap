import { lazy, Suspense, type ReactNode } from "react";
import { RiBroadcastLine, RiCheckboxCircleLine, RiPulseLine, RiErrorWarningLine } from "@remixicon/react";
import { ArkamapLockup } from "@/components/foundations/brand/arkamap-brand";
import { StatCards, type Stat } from "@/components/application/dashboard/stat-cards";
import { Button } from "@/components/base/buttons/button";
import { useApi } from "@/hooks/use-api";
import { cx } from "@/utils/cx";
import type { DTO } from "@/lib/api/client";
import { alertCount } from "../insights";
import { prettifyId } from "../labels";
import { CurationAnnouncement } from "./curation-announcement";
import { PanelUnavailable } from "./dashboard-card";
import { DashboardSkeleton } from "./dashboard-skeleton";
import { SensorWidgetGrid } from "@/components/application/data-viz/sensor-widget";
import { EventKpiRow } from "./event-kpi-row";
import { HistoryCard } from "./history-card";
import { ImpactCard } from "./impact-card";
import { IndicatorTable } from "./indicator-table";
import { InsightTabs, type ListTab } from "./insight-tabs";
import { RankingCard } from "./ranking-card";
import { ScoreCard } from "./score-card";

// maplibre comes with the map, after the cards around it have shown
const RegionMapPanel = lazy(() => import("./region-map-panel").then(module => ({ default: module.RegionMapPanel })));

const openProfile = () => window.dispatchEvent(new Event("arkamap-profile-open"));

type DeviceDashboard = DTO<"DeviceDashboard">;
const DAY_MS = 24 * 60 * 60 * 1000;

/** Essential numbers for the account's own IoT devices; every value falls back to 0. */
function iotStats(devices: DeviceDashboard[]): Stat[] {
  const now = Date.now();
  const active = devices.filter(({ device }) => device.last_seen_at && now - Date.parse(device.last_seen_at) < DAY_MS).length;
  const fields = devices.flatMap(({ widgets }) => widgets.filter(widget => !widget.hidden));
  const reporting = fields.filter(widget => widget.latest != null).length;
  const rejected = devices.reduce((sum, { device }) => sum + (device.rejected_count ?? 0), 0);
  return [
    { icon: RiBroadcastLine, label: "Perangkat IoT", value: String(devices.length), delta: "Terdaftar", deltaColor: "neutral" },
    { icon: RiCheckboxCircleLine, label: "Aktif 24 jam", value: String(active), delta: `${devices.length - active} tidak aktif`, deltaColor: active ? "lime" : "neutral" },
    { icon: RiPulseLine, label: "Sensor mengirim", value: String(reporting), delta: `dari ${fields.length} field`, deltaColor: "neutral" },
    { icon: RiErrorWarningLine, label: "Data ditolak", value: String(rejected), delta: rejected ? "Periksa payload" : "Aman", deltaColor: rejected ? "rose" : "neutral" },
  ];
}

export function ApiDashboard() {
  const { data, loading, error, refresh } = useApi("/me/dashboard?hours=24", "Dashboard");
  if (loading) return <DashboardSkeleton />;
  if (error) return <div className="flex flex-col items-center justify-center gap-4 rounded-2xl bg-background-secondary-default px-4 py-10 text-center">
    <ArkamapLockup />
    <p role="alert" className="text-body-regular text-text-secondary">{error}</p>
    <div className="flex items-center gap-2">
      <Button onClick={() => { window.history.pushState({}, "", "/login"); window.dispatchEvent(new PopStateEvent("popstate")); }}>Masuk</Button>
      <Button variant="secondary" onClick={refresh}>Coba lagi</Button>
    </div>
  </div>;
  if (!data) return null;
  if (data.profile_needed) return <PanelUnavailable title="Lengkapi profil pantauan" description="Kenalan membantu memilih indikator dan wilayah. Map publik tetap dapat digunakan." action={<Button onClick={openProfile}>Kenalan</Button>} />;
  const view = data.view;
  if (!view) return <PanelUnavailable title="Dashboard belum siap" description="Profil aktif belum menghasilkan tampilan. Coba muat ulang." action={<Button variant="secondary" onClick={refresh}>Muat ulang</Button>} />;

  const region = data.ours?.region;
  // Panels outside `view.mode.panels` are not part of this profile's curated view.
  const panels = view.mode.panels;
  const listTabs = panels.filter((id): id is ListTab => id === "events" || id === "alerts");
  const metricLabel = region?.indicators.find(indicator => indicator.metric === view.ranking.metric)?.label ?? prettifyId(view.ranking.metric);
  const history = panels.includes("history") ? (view.history ?? []).filter(series => series.months.length) : [];

  // Fixed-height (344px) BoardUI cards in priority order, paired into rows like the BoardUI Home composition.
  const cards: { key: string; node: ReactNode }[] = [];
  if (panels.includes("ranking") && view.ranking.results.length) cards.push({ key: "ranking", node: <RankingCard ranking={view.ranking} metricLabel={metricLabel} focusName={view.focus?.name} /> });
  if (history[0]) cards.push({ key: `history-${history[0].kind}`, node: <HistoryCard series={history[0]} /> });
  if (view.focus) cards.push({ key: "map", node: <Suspense fallback={<div aria-hidden className="h-[344px] rounded-2xl bg-background-secondary-default" />}>
    <RegionMapPanel focus={view.focus} layers={view.layers} />
  </Suspense> });
  if (panels.includes("impact") && view.impact) cards.push({ key: "impact", node: <ImpactCard impact={view.impact} /> });
  if (listTabs.length) cards.push({ key: "insight", node: <InsightTabs view={view} tabs={listTabs} /> });
  history.slice(1).forEach(series => cards.push({ key: `history-${series.kind}`, node: <HistoryCard series={series} /> }));
  if (view.mode.id === "responden" && view.focus) cards.push({ key: "score", node: <ScoreCard regionId={view.focus.id} /> });
  const rows = Array.from({ length: Math.ceil(cards.length / 2) }, (_, index) => cards.slice(index * 2, index * 2 + 2));

  return <div className="flex min-w-0 flex-col gap-4">
    <StatCards stats={iotStats(data.devices ?? [])} />
    <EventKpiRow view={view} alerts={alertCount(view.alerts)} deviceCount={data.devices?.length ?? 0} />
    {rows.map((row, index) => <div key={row.map(card => card.key).join()} className={cx("grid min-w-0 gap-4", row.length === 2 && (index === 0 ? "xl:grid-cols-[minmax(0,532fr)_minmax(0,673fr)]" : "xl:grid-cols-2"))}>
      {row.map(card => <div key={card.key} className="min-w-0">{card.node}</div>)}
    </div>)}
    {!!region?.indicators.length && <IndicatorTable region={region} />}
    <SensorWidgetGrid devices={data.devices ?? []} />
    {(view.message || view.unsupported.length > 0) && <CurationAnnouncement view={view} />}
  </div>;
}
