import { useState, type ReactNode } from "react";
import { RiAddLine, RiCheckLine } from "@remixicon/react";
import { Button } from "@/components/base/buttons/button";
import { Select, SelectItem } from "@/components/base/select/select";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { EVENT_KINDS } from "../event-kinds";
import { useRegionSummary } from "../use-region-data";
import { instance, type IotStat, type WidgetInstance, type WidgetType } from "../widget-layout";
import { defaultTitle, type WidgetContext } from "./widget-renderer";

type Entry = { item: WidgetInstance; description: string; reason?: string };

const IOT_STATS: IotStat[] = ["devices", "active", "reporting", "rejected"];

/** Every fixed widget this profile could show, with why it cannot when its data is missing. */
function fixedEntries(ctx: WidgetContext): { title: string; entries: Entry[] }[] {
  const { view, region, devices } = ctx;
  const entry = (type: WidgetType, description: string, reason?: string, config = {}): Entry => ({ item: instance(type, config), description, reason });
  const noRegion = view.focus ? undefined : "Butuh wilayah profil; profil ini memantau seluruh Indonesia.";
  const noDevices = devices.length ? undefined : "Belum ada perangkat IoT di akun ini.";
  return [
    { title: "Ringkasan", entries: [
      entry("kpi-mode", "Mode, wilayah, dan kecocokan data profil."),
      ...view.events.map(event => entry("kpi-event", `Jumlah ${EVENT_KINDS[event.kind].label.toLowerCase()} tercatat dalam ${event.days} hari terakhir.`, undefined, { kind: event.kind })),
      entry("kpi-alerts", "Peringatan yang sedang berlaku untuk bidang dan wilayah profil."),
      ...IOT_STATS.map(stat => entry("kpi-iot", "Angka ringkas perangkat IoT akun ini.", noDevices, { stat })),
    ] },
    { title: "Wilayah", entries: [
      entry("map", "Batas wilayah dan titik kejadian sesuai jendela waktu mode.", noRegion),
      entry("ranking", "Wilayah tetangga pada metrik utama bidang profil.", view.ranking.results.length ? undefined : "Belum ada data peringkat."),
      entry("insight", "Daftar peringatan dan kejadian terbaru."),
      entry("impact", "Gempa dan peringatan cuaca beserta penduduk dalam jangkauannya.", view.impact ? undefined : "Hanya dihitung untuk mode Tanggap darurat."),
      entry("score", "Skor perhatian gabungan risiko kebakaran, gempa, dan air.", noRegion),
      entry("indicators", "Tabel indikator yang dipilih AI untuk profil.", region?.indicators.length ? undefined : "Profil ini belum punya indikator wilayah."),
      ...view.events.map(event => entry("history", "Jumlah kejadian per bulan selama setahun.", view.history?.some(series => series.kind === event.kind) ? undefined : "Hanya dihitung untuk mode Perencanaan.", { kind: event.kind })),
    ] },
    { title: "Perangkat IoT", entries: devices.flatMap(({ device, widgets }) => widgets.filter(widget => !widget.hidden)
      .map(widget => entry("sensor", `${device.name}${widget.unit ? `, satuan ${widget.unit}` : ""}.`, undefined, { deviceId: device.id, field: widget.field }))) },
  ];
}

function Row({ title, description, reason, action }: { title: string; description: string; reason?: string; action: ReactNode }) {
  return <li className="flex items-start justify-between gap-3 rounded-xl border border-border-button-default p-3">
    <div className="min-w-0">
      <p className="text-body-medium text-text-primary">{title}</p>
      <p className="mt-0.5 text-caption-1 text-text-secondary">{reason ?? description}</p>
    </div>
    <div className="shrink-0">{action}</div>
  </li>;
}

/** A widget built from a metric the user picks; `options` are the metrics that have data. */
function MetricRow({ title, description, reason, options, onAdd, exists }: {
  title: string; description: string; reason?: string; options: { id: string; label: string }[];
  onAdd: (metric: string) => void; exists: (metric: string) => boolean;
}) {
  const [metric, setMetric] = useState<string>();
  return <li className="flex flex-col gap-2 rounded-xl border border-border-button-default p-3">
    <div>
      <p className="text-body-medium text-text-primary">{title}</p>
      <p className="mt-0.5 text-caption-1 text-text-secondary">{reason ?? description}</p>
    </div>
    {!reason && <div className="flex items-center gap-2">
      <Select aria-label={`Metrik untuk ${title}`} placeholder="Pilih metrik" className="min-w-0 flex-1" triggerClassName="w-full" size="sm"
        selectedKey={metric ?? null} onSelectionChange={value => setMetric(value == null ? undefined : String(value))}>
        {options.map(option => <SelectItem key={option.id} id={option.id}>{option.label}</SelectItem>)}
      </Select>
      <Button size="small" variant="secondary" leadingIcon={metric && exists(metric) ? RiCheckLine : RiAddLine} disabled={!metric || exists(metric)}
        onClick={() => { if (metric) onAdd(metric); }}>{metric && exists(metric) ? "Sudah Ada" : "Tambah"}</Button>
    </div>}
  </li>;
}

/** Side panel listing every widget the profile can show; adding puts it at the bottom of the grid. */
export function WidgetGallery({ open, onOpenChange, ctx, items, onAdd }: {
  open: boolean; onOpenChange: (open: boolean) => void; ctx: WidgetContext; items: WidgetInstance[]; onAdd: (item: WidgetInstance) => void;
}) {
  const summary = useRegionSummary(open ? ctx.view.focus?.id ?? null : null);
  const has = (id: string) => items.some(item => item.id === id);
  const regionMetrics = (summary?.indicators ?? []).map(indicator => ({ id: indicator.metric, label: indicator.label })).sort((a, b) => a.label.localeCompare(b.label));
  const allMetrics = ctx.view.focus ? regionMetrics : [];
  const noRegion = ctx.view.focus ? undefined : "Butuh wilayah profil; profil ini memantau seluruh Indonesia.";

  return <Sheet open={open} onOpenChange={onOpenChange}>
    <SheetContent side="right" className="w-full overflow-y-auto sm:max-w-md">
      <SheetHeader>
        <SheetTitle>Tambah Widget</SheetTitle>
        <SheetDescription>Widget baru diletakkan di bagian bawah dashboard. Geser untuk memindahkannya.</SheetDescription>
      </SheetHeader>
      <div className="flex flex-col gap-6 px-4 pb-6">
        <section className="flex flex-col gap-2">
          <h3 className="text-heading-sm text-text-primary">Pilih Metrik Sendiri</h3>
          <ul className="flex flex-col gap-2">
            <MetricRow title="KPI Indikator" description="Nilai satu indikator wilayah Anda, dengan satuan dan tingkat perhatiannya."
              reason={noRegion ?? (summary === undefined ? "Memuat daftar indikator..." : !regionMetrics.length ? "Belum ada indikator untuk wilayah ini." : undefined)}
              options={regionMetrics} exists={metric => has(instance("kpi-indicator", { metric }).id)} onAdd={metric => onAdd(instance("kpi-indicator", { metric }))} />
            <MetricRow title="Peringkat Metrik Lain" description="Wilayah tetangga pada metrik pilihan Anda; wilayah Anda selalu tampil."
              reason={noRegion ?? (summary === undefined ? "Memuat daftar metrik..." : undefined)}
              options={allMetrics} exists={metric => has(instance("ranking", { metric }).id) || (metric === ctx.view.ranking.metric && has("ranking"))}
              onAdd={metric => onAdd(metric === ctx.view.ranking.metric ? instance("ranking") : instance("ranking", { metric }))} />
          </ul>
        </section>
        {fixedEntries(ctx).map(group => <section key={group.title} className="flex flex-col gap-2">
          <h3 className="text-heading-sm text-text-primary">{group.title}</h3>
          {group.entries.length ? <ul className="flex flex-col gap-2">{group.entries.map(({ item, description, reason }) => {
            const added = has(item.id);
            return <Row key={item.id} title={defaultTitle(item, ctx)} description={description} reason={reason}
              action={<Button size="small" variant="secondary" leadingIcon={added ? RiCheckLine : RiAddLine} disabled={added || !!reason} onClick={() => onAdd(item)}>
                {added ? "Sudah Ada" : "Tambah"}
              </Button>} />;
          })}</ul> : <p className="text-caption-1 text-text-secondary">Belum ada perangkat IoT yang mengirim data.</p>}
        </section>)}
      </div>
    </SheetContent>
  </Sheet>;
}
