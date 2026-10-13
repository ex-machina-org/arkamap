import type { ComponentType } from "react";
import { Badge } from "@/components/base/badges/badge";
import type { DTO } from "@/lib/api/client";
import { ChartCard, ValueTable } from "./chart-card";
import { formatDateTime, formatNumber, formatValue, relativeTime } from "./format";
import { LocationMap } from "./location-map";
import { SeriesTable, TimeSeriesChart, type SeriesPoint } from "./time-series-chart";
import { GaugeMeter, StatValue, StatusValue } from "./value-displays";

type Widget = DTO<"Widget">;
type Device = DTO<"DeviceOut">;
type Body = ComponentType<{ widget: Widget; device: Device; series: SeriesPoint[] }>;

const numeric = (series: SeriesPoint[]) => series.flatMap(point => typeof point.v === "number" && Number.isFinite(point.v) ? [point.v] : []);
const latestNumber = (widget: Widget) => typeof widget.latest === "number" && Number.isFinite(widget.latest) ? widget.latest : null;

function Line({ widget, series }: { widget: Widget; series: SeriesPoint[] }) {
  if (numeric(series).length < 2) return <Stat widget={widget} series={series} />;
  const compare = widget.compare && widget.compare.unit === widget.unit ? widget.compare : null;
  return <TimeSeriesChart points={series} unit={widget.unit} label={widget.label}
    reference={compare ? { value: compare.value, label: `${compare.region_name ?? "Wilayah"}: ${formatNumber(compare.value)}` } : undefined} />;
}

function Bars({ widget, series }: { widget: Widget; series: SeriesPoint[] }) {
  return numeric(series).length < 2 ? <Stat widget={widget} series={series} /> : <TimeSeriesChart points={series} unit={widget.unit} label={widget.label} variant="bar" />;
}

function Stat({ widget, series }: { widget: Widget; series: SeriesPoint[] }) {
  const values = numeric(series);
  return <StatValue value={widget.latest} unit={widget.unit} previous={values.length > 1 ? values[values.length - 2] : null} trend={values.slice(-24)} />;
}

function Gauge({ widget, series }: { widget: Widget; series: SeriesPoint[] }) {
  const value = latestNumber(widget);
  if (value == null) return <Stat widget={widget} series={series} />;
  // A percentage has a true 0–100 range; anything else is placed within what this sensor has reported.
  if (widget.unit === "%" && value >= 0 && value <= 100) return <GaugeMeter value={value} min={0} max={100} unit="%" rangeLabel="Rentang 0–100%" />;
  const values = numeric(series);
  if (values.length < 3) return <Stat widget={widget} series={series} />;
  return <GaugeMeter value={value} min={Math.min(...values)} max={Math.max(...values)} unit={widget.unit} rangeLabel={`Rentang ${values.length} pembacaan terakhir`} />;
}

function Status({ widget }: { widget: Widget }) {
  return <div className="py-2"><StatusValue value={widget.latest} /></div>;
}

function Location({ widget, device }: { widget: Widget; device: Device }) {
  const lat = latestNumber(widget);
  const lon = typeof widget.pair_latest === "number" ? widget.pair_latest : null;
  return lat == null || lon == null ? <Stat widget={widget} series={[]} /> : <LocationMap lat={lat} lon={lon} label={device.name} />;
}

function Table({ widget }: { widget: Widget }) {
  const value = widget.latest;
  if (value && typeof value === "object" && !Array.isArray(value)) {
    return <ValueTable columns={["Field", "Nilai"]} rows={Object.entries(value).map(([key, item]) => [key, formatValue(item)])} />;
  }
  return <p className="break-words text-body-regular text-text-primary">{formatValue(value, widget.unit)}</p>;
}

/** Widget type chosen by the backend layout (AI or rules) → the component that renders it. */
const WIDGET_COMPONENTS: Record<Widget["widget"], Body> = {
  line: Line, bar: Bars, stat: Stat, gauge: Gauge, status: Status, map: Location, table: Table,
};

const BY_LABEL: Record<string, string> = { ai: "Ditata AI", rule: "Aturan", user: "Diatur pengguna" };

/**
 * One sensor field from GET /me/dashboard, rendered with the component its layout asks for.
 * Values always come from the API; the layout only decides presentation.
 */
export function SensorWidget({ widget, device }: { widget: Widget; device: Device }) {
  const series = (widget.series ?? []).map(point => ({ t: point.t, v: point.v }));
  const Body = WIDGET_COMPONENTS[widget.widget] ?? Table;
  const plotsSeries = (widget.widget === "line" || widget.widget === "bar") && numeric(series).length >= 2;
  const compare = widget.compare;
  return <ChartCard title={widget.label}
    description={[widget.group, widget.unit && `satuan ${widget.unit}`].filter(Boolean).join(" · ")}
    meta={<Badge>{BY_LABEL[widget.by ?? "rule"] ?? "Aturan"}</Badge>}
    empty={widget.latest == null && series.length === 0 ? "Belum menerima pembacaan" : false}
    table={plotsSeries ? <SeriesTable points={series} unit={widget.unit} label={widget.label} /> : undefined}
    footer={<>
      {widget.latest_at ? <span title={formatDateTime(widget.latest_at)}>Diperbarui {relativeTime(widget.latest_at)}</span> : "Belum ada waktu pembacaan"}
      {compare && compare.unit === widget.unit && <span className="block">Pembanding {compare.region_name ?? "wilayah"}: {formatNumber(compare.value)} {compare.unit} · {compare.period}{compare.is_modelled ? " · MODEL" : ""} · {compare.source_id}</span>}
      {compare && compare.unit !== widget.unit && <span className="block">Pembanding wilayah tidak ditampilkan karena satuannya berbeda.</span>}
    </>}>
    <Body widget={widget} device={device} series={series} />
  </ChartCard>;
}

/** All devices from GET /me/dashboard: one section per device, fields grouped by the layout's group. */
export function SensorWidgetGrid({ devices }: { devices: DTO<"DeviceDashboard">[] }) {
  const visible = devices.map(entry => ({ ...entry, widgets: entry.widgets.filter(widget => !widget.hidden) })).filter(entry => entry.widgets.length);
  if (!visible.length) return null;
  return <div className="flex flex-col gap-6">{visible.map(({ device, widgets }) => {
    const groups = new Map<string, Widget[]>();
    for (const widget of widgets) groups.set(widget.group || "Lainnya", [...(groups.get(widget.group || "Lainnya") ?? []), widget]);
    return <section key={device.id} aria-label={`Perangkat ${device.name}`} className="flex flex-col gap-3">
      <header className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="text-heading-md text-text-primary">{device.name}</h2>
        <p className="text-caption-1 text-text-secondary">{device.last_seen_at ? `Terakhir mengirim ${relativeTime(device.last_seen_at)}` : "Belum pernah mengirim data"}</p>
      </header>
      {[...groups].map(([group, items]) => <div key={group} className="flex flex-col gap-2">
        {groups.size > 1 && <h3 className="text-body-semibold text-text-secondary">{group}</h3>}
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">{items.map(widget => <SensorWidget key={widget.field} widget={widget} device={device} />)}</div>
      </div>)}
    </section>;
  })}</div>;
}
