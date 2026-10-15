import { useState } from "react";
import { createPortal } from "react-dom";
import { RiAddLine, RiCheckLine, RiLayoutGridLine, RiRefreshLine } from "@remixicon/react";
import { ArkamapLockup } from "@/components/foundations/brand/arkamap-brand";
import { Button } from "@/components/base/buttons/button";
import { useApi } from "@/hooks/use-api";
import type { DTO } from "@/lib/api/client";
import { useMetricCatalog } from "../use-metric-catalog";
import { useWidgetLayout } from "../use-widget-layout";
import { defaultWidgets } from "../widget-layout";
import { CurationAnnouncement } from "./curation-announcement";
import { PanelUnavailable } from "./dashboard-card";
import { DashboardSkeleton } from "./dashboard-skeleton";
import { WidgetGallery } from "./widget-gallery";
import { WidgetGrid } from "./widget-grid";
import { defaultTitle, renderWidget, type WidgetContext } from "./widget-renderer";
import { WidgetSettings } from "./widget-settings";

const openProfile = () => window.dispatchEvent(new Event("arkamap-profile-open"));

/**
 * The whole dashboard as one grid of widgets: KPI tiles, device numbers, region cards and
 * every sensor field. "Atur Tampilan" arranges them; widgets can be added from the gallery
 * and configured or removed from their settings.
 */
function CustomisableDashboard({ data, view, refresh, actionSlot }: { data: DTO<"Dashboard">; view: DTO<"DashboardView">; refresh: () => void; actionSlot?: HTMLElement | null }) {
  const catalog = useMetricCatalog();
  const devices = data.devices ?? [];
  const region = data.ours?.region;
  const ctx: WidgetContext = { view, region, devices, metric: catalog.get };
  const dashboard = useWidgetLayout(view.profile_id, defaultWidgets(view, devices, !!region?.indicators.length));
  const [editing, setEditing] = useState(false);
  const [galleryOpen, setGalleryOpen] = useState(false);
  const [settingsId, setSettingsId] = useState<string>();
  const settingsItem = dashboard.items.find(item => item.id === settingsId);
  // Device numbers mean nothing without a device: hidden (not removed) until one is registered and the data reloads.
  const shown = devices.length ? dashboard.items : dashboard.items.filter(item => item.type !== "kpi-iot");
  const widgets = shown.map(item => ({ id: item.id, type: item.type, title: item.title ?? defaultTitle(item, ctx), node: renderWidget(item, ctx) }));

  const controls = <div className="flex flex-wrap items-center justify-end gap-2">
    {editing && dashboard.customised && <Button size="small" variant="ghost" leadingIcon={RiRefreshLine} onClick={dashboard.reset}>Kembalikan Bawaan</Button>}
    {editing && <Button size="small" variant="secondary" leadingIcon={RiAddLine} onClick={() => setGalleryOpen(true)}>Tambah Widget</Button>}
    {editing ? <Button size="small" leadingIcon={RiCheckLine} onClick={() => setEditing(false)}>Selesai</Button>
      : <Button size="small" variant="secondary" leadingIcon={RiLayoutGridLine} onClick={() => setEditing(true)}>Atur Tampilan</Button>}
  </div>;

  return <section aria-label="Dashboard" className="flex min-w-0 flex-col gap-3">
    {/* In the page header beside the greeting when the shell offers a slot; above the grid otherwise. */}
    {actionSlot ? createPortal(controls, actionSlot) : controls}
    {editing && <p className="rounded-xl bg-background-supporting-default px-3 py-2 text-body-2-regular text-text-secondary" aria-live="polite">
      Seret judul widget untuk memindahkan, tarik sudut kanan bawah untuk mengubah ukuran, atau buka pengaturan widget untuk mengubah dan menghapusnya. Tersimpan di browser ini untuk profil aktif.
    </p>}
    {widgets.length ? <WidgetGrid widgets={widgets} layout={dashboard.layout} editing={editing}
      onLayoutChange={dashboard.setLayout} onMove={dashboard.move} onSettings={setSettingsId} />
      : <PanelUnavailable title="Dashboard kosong" description="Tambahkan widget lewat Atur Tampilan, atau kembalikan tata letak bawaan."
        action={<Button variant="secondary" leadingIcon={RiAddLine} onClick={() => { setEditing(true); setGalleryOpen(true); }}>Tambah Widget</Button>} />}
    <WidgetGallery open={galleryOpen} onOpenChange={setGalleryOpen} ctx={ctx} items={dashboard.items} onAdd={dashboard.add} />
    <WidgetSettings item={settingsItem} width={dashboard.layout.find(place => place.i === settingsId)?.w ?? 6} ctx={ctx}
      onSave={(next, width) => dashboard.update(settingsId!, next, width)} onRemove={dashboard.remove}
      onClose={() => setSettingsId(undefined)} onDevicesChanged={refresh} />
  </section>;
}

export function ApiDashboard({ actionSlot }: { actionSlot?: HTMLElement | null } = {}) {
  const { data: fresh, loading, error, refresh } = useApi("/me/dashboard?hours=24", "Dashboard");
  // A reload (after a sensor setting changes) keeps the last data on screen, so the grid and edit mode stay put.
  const [last, setLast] = useState(fresh);
  if (fresh && fresh !== last) setLast(fresh);
  const data = fresh ?? (loading ? last : undefined);
  if (loading && !data) return <DashboardSkeleton />;
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

  return <div className="flex min-w-0 flex-col gap-4">
    <CustomisableDashboard data={data} view={view} refresh={refresh} actionSlot={actionSlot} />
    {(view.message || view.unsupported.length > 0) && <CurationAnnouncement view={view} />}
  </div>;
}
