import { useState, type ReactNode } from "react";
import { RiDeleteBinLine } from "@remixicon/react";
import { Button } from "@/components/base/buttons/button";
import { Input } from "@/components/base/input/input";
import { SegmentedControl, SegmentedControlItem } from "@/components/base/segmented-control/segmented-control";
import { Select, SelectItem } from "@/components/base/select/select";
import { Sheet, SheetContent, SheetDescription, SheetFooter, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { apiList, jsonBody, type DTO } from "@/lib/api/client";
import { WIDGET_LABEL } from "../device-detail/readings";
import { EVENT_KINDS } from "../event-kinds";
import { useRegionSummary } from "../use-region-data";
import { WIDGET_SIZES, WIDTH_PRESETS, widgetId, type WidgetConfig, type WidgetInstance } from "../widget-layout";
import { defaultTitle, type WidgetContext } from "./widget-renderer";

type ChartKind = DTO<"WidgetSpec">["widget"];

function Field({ label, children }: { label: string; children: ReactNode }) {
  return <div className="flex flex-col gap-1.5"><span className="text-body-medium text-text-primary">{label}</span>{children}</div>;
}

/**
 * Settings for one widget: its name, width, and whatever it is built from (event kind,
 * metric, sensor display). A sensor's name and display are the device layout's, saved on
 * the server for every view of that device; everything else is this dashboard's.
 */
function SettingsForm({ item, width, ctx, onSave, onRemove, onClose, onDevicesChanged }: {
  item: WidgetInstance; width: number; ctx: WidgetContext;
  onSave: (next: WidgetInstance, width: number) => boolean; onRemove: () => void; onClose: () => void; onDevicesChanged: () => void;
}) {
  const sensor = item.type === "sensor" ? ctx.devices.find(entry => entry.device.id === item.config.deviceId)?.widgets.find(widget => widget.field === item.config.field) : undefined;
  const [title, setTitle] = useState(sensor ? sensor.label : item.title ?? "");
  const [w, setW] = useState(width);
  const [config, setConfig] = useState<WidgetConfig>(item.config);
  const [chart, setChart] = useState<ChartKind | undefined>(sensor?.widget);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>();
  const summary = useRegionSummary(item.type === "kpi-indicator" || item.type === "ranking" ? ctx.view.focus?.id ?? null : null);
  const regionMetrics = (summary?.indicators ?? []).map(indicator => ({ id: indicator.metric, label: indicator.label })).sort((a, b) => a.label.localeCompare(b.label));
  const minW = WIDGET_SIZES[item.type].minW;
  const kinds = item.type === "history" ? (ctx.view.history ?? []).map(series => series.kind) : ctx.view.events.map(event => event.kind);
  const fallbackTitle = defaultTitle({ type: item.type, config }, ctx);

  async function save() {
    setError(undefined);
    if (item.type === "sensor") {
      if (!sensor || item.config.deviceId == null) return setError("Field sensor ini sudah tidak ada.");
      const edit: { field: string; label?: string; widget?: ChartKind } = { field: sensor.field };
      if (title.trim() && title.trim() !== sensor.label) edit.label = title.trim();
      if (chart && chart !== sensor.widget) edit.widget = chart;
      if (edit.label || edit.widget) {
        setBusy(true);
        try {
          await apiList(`/me/devices/${item.config.deviceId}/layout`, "WidgetSpec", { method: "PUT", ...jsonBody([edit]) });
          onDevicesChanged();
        } catch (cause) {
          setBusy(false);
          return setError(cause instanceof Error ? cause.message : "Pengaturan sensor gagal disimpan.");
        }
        setBusy(false);
      }
      onSave(item, w);
      return onClose();
    }
    // The profile's own ranking metric is the backend panel, not a separate widget.
    const nextConfig = item.type === "ranking" && config.metric === ctx.view.ranking.metric ? {} : config;
    const next: WidgetInstance = { id: widgetId(item.type, nextConfig), type: item.type, config: nextConfig, title: title.trim() || undefined };
    if (!onSave(next, w)) return setError("Widget dengan pengaturan ini sudah ada di dashboard.");
    onClose();
  }

  return <>
    <div className="flex flex-col gap-5 px-4">
      {item.type !== "insight" && <Input label={item.type === "sensor" ? "Nama Field" : "Judul"} value={title} onChange={setTitle} placeholder={fallbackTitle} maxLength={80}
        hint={item.type === "sensor" ? "Tersimpan di perangkat, berlaku di semua tampilan perangkat ini." : "Kosongkan untuk memakai nama bawaan."} />}
      <Field label="Lebar">
        <SegmentedControl aria-label="Lebar widget" selectedKeys={new Set([String(w)])}
          onSelectionChange={keys => { const next = Number([...keys][0]); if (Number.isFinite(next)) setW(next); }}>
          {WIDTH_PRESETS.filter(preset => preset.w >= minW).map(preset => <SegmentedControlItem key={preset.w} id={String(preset.w)}>{preset.label}</SegmentedControlItem>)}
        </SegmentedControl>
      </Field>
      {(item.type === "kpi-event" || item.type === "history") && kinds.length > 1 && <Field label="Jenis Kejadian">
        <Select aria-label="Jenis kejadian" selectedKey={config.kind ?? null} onSelectionChange={value => setConfig({ ...config, kind: value as WidgetConfig["kind"] })}>
          {kinds.map(kind => <SelectItem key={kind} id={kind}>{EVENT_KINDS[kind].label}</SelectItem>)}
        </Select>
      </Field>}
      {(item.type === "kpi-indicator" || item.type === "ranking") && <Field label="Metrik">
        {regionMetrics.length ? <Select aria-label="Metrik" selectedKey={config.metric ?? ctx.view.ranking.metric} onSelectionChange={value => setConfig({ ...config, metric: String(value) })}>
          {regionMetrics.map(metric => <SelectItem key={metric.id} id={metric.id}>{metric.label}</SelectItem>)}
        </Select> : <p className="text-caption-1 text-text-secondary">{summary === undefined && ctx.view.focus ? "Memuat daftar metrik..." : "Butuh wilayah profil dengan data indikator."}</p>}
      </Field>}
      {item.type === "sensor" && sensor && <Field label="Tampilan">
        <Select aria-label="Tampilan sensor" selectedKey={chart ?? null} onSelectionChange={value => setChart(value as ChartKind)}>
          {Object.entries(WIDGET_LABEL).map(([id, label]) => <SelectItem key={id} id={id}>{label}</SelectItem>)}
        </Select>
      </Field>}
      {error && <p role="alert" className="text-body-regular text-text-error-primary">{error}</p>}
    </div>
    <SheetFooter className="flex-row flex-wrap justify-between">
      <Button variant="danger" leadingIcon={RiDeleteBinLine} disabled={busy} onClick={() => { onRemove(); onClose(); }}>Hapus Widget</Button>
      <div className="flex gap-2">
        <Button variant="secondary" disabled={busy} onClick={onClose}>Batal</Button>
        <Button disabled={busy} onClick={() => void save()}>{busy ? "Menyimpan..." : "Simpan"}</Button>
      </div>
    </SheetFooter>
  </>;
}

export function WidgetSettings({ item, width, ctx, onSave, onRemove, onClose, onDevicesChanged }: {
  item: WidgetInstance | undefined; width: number; ctx: WidgetContext;
  onSave: (next: WidgetInstance, width: number) => boolean; onRemove: (id: string) => void; onClose: () => void; onDevicesChanged: () => void;
}) {
  return <Sheet open={!!item} onOpenChange={open => { if (!open) onClose(); }}>
    <SheetContent side="right" className="w-full overflow-y-auto sm:max-w-md">
      <SheetHeader>
        <SheetTitle>Atur Widget</SheetTitle>
        <SheetDescription>{item ? item.title ?? defaultTitle(item, ctx) : ""}</SheetDescription>
      </SheetHeader>
      {/* Keyed so each widget opens with its own values. */}
      {item && <SettingsForm key={item.id} item={item} width={width} ctx={ctx} onSave={onSave} onRemove={() => onRemove(item.id)} onClose={onClose} onDevicesChanged={onDevicesChanged} />}
    </SheetContent>
  </Sheet>;
}
