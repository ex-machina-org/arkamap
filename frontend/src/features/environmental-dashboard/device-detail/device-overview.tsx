import { useId, useMemo, type ReactNode } from "react";
import { RiDatabase2Line, RiErrorWarningLine, RiPulseLine, RiUploadCloud2Line } from "@remixicon/react";
import { StatCards, type Stat } from "@/components/application/dashboard/stat-cards";
import { Skeleton } from "@/components/ui/skeleton";
import { Area, AreaChart, Bar, BarChart, CartesianGrid, PolarAngleAxis, RadialBar, RadialBarChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { Chip } from "@/components/base/badges/chip";
import { Map, MapMarker, MarkerContent } from "@/components/ui/map";
import type { DTO } from "@/lib/api/client";
import { formatRelative, isOnline } from "../device-api";
import { DashboardCard, PanelUnavailable, insetClass } from "../components/dashboard-card";
import { Notice } from "../components/device-ui";
import { CATEGORY_LABEL, fieldRef, formatTick, formatValue, latestOf, readingTime, seriesOf } from "./readings";

type FieldView = Pick<DTO<"WidgetSpec">, "field" | "label" | "unit" | "widget" | "group" | "pair_field" | "category">;

/** Before the AI layout exists, show every field the streams carry with a type-based widget. */
function fallbackWidgets(streams: DTO<"Stream">[]): FieldView[] {
  return streams.flatMap(stream => stream.fields.map(field => ({
    field: `${stream.slug}/${field.key}`, label: field.label, unit: null, group: stream.name, pair_field: null, category: field.category,
    widget: field.type === "number" ? "line" as const : "status" as const,
  })));
}

const CHART_COLOR = "var(--color-chart-1-active)";
// a warning stops mattering once the device has sent correctly for a while
const isRecent = (iso?: string | null) => !!iso && Date.now() - Date.parse(iso) < 24 * 60 * 60_000;

const AXIS_TICK = { fontSize: 11, fill: "var(--color-text-tertiary)" };

function FieldChart({ view, points, hours }: { view: FieldView; points: { t: number; v: number }[]; hours: number }) {
  const gradientId = useId();
  const tick = formatTick(hours);
  const values = points.map(point => point.v);
  const summary = [
    ["Min", Math.min(...values)],
    ["Rata-rata", values.reduce((sum, value) => sum + value, 0) / values.length],
    ["Maks", Math.max(...values)],
  ] as const;
  const tooltip = <Tooltip labelFormatter={value => new Date(Number(value)).toLocaleString("id-ID")} formatter={value => [formatValue(value, view.unit), view.label]}
    cursor={view.widget === "bar" ? { fill: "var(--color-background-tertiary-default)" } : { stroke: "var(--color-chart-cursor)", strokeWidth: 1, strokeDasharray: "4 4" }}
    contentStyle={{ background: "var(--color-background-primary-default)", border: "1px solid var(--color-border-button-default)", borderRadius: 12 }} />;
  const xAxis = <XAxis dataKey="t" type="number" scale="time" domain={["dataMin", "dataMax"]} tickFormatter={tick} tick={AXIS_TICK} tickLine={false} axisLine={false} tickMargin={8} minTickGap={24} />;
  const grid = <CartesianGrid vertical={false} stroke="var(--color-border-button-default)" strokeDasharray="3 3" />;
  return <div className="flex flex-col gap-3">
    <div className="h-44">
      <ResponsiveContainer>
        {view.widget === "bar"
          ? <BarChart data={points} margin={{ top: 4, right: 4, bottom: 0, left: 0 }}>{grid}{xAxis}<YAxis width={40} tick={AXIS_TICK} tickLine={false} axisLine={false} />{tooltip}<Bar dataKey="v" fill={CHART_COLOR} radius={[4, 4, 0, 0]} /></BarChart>
          : <AreaChart data={points} margin={{ top: 4, right: 4, bottom: 0, left: 0 }}>
            <defs><linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={CHART_COLOR} stopOpacity={0.3} /><stop offset="100%" stopColor={CHART_COLOR} stopOpacity={0} />
            </linearGradient></defs>
            {grid}{xAxis}<YAxis width={40} tick={AXIS_TICK} tickLine={false} axisLine={false} domain={["auto", "auto"]} />{tooltip}
            <Area type="monotone" dataKey="v" stroke={CHART_COLOR} strokeWidth={2} fill={`url(#${gradientId})`} dot={false} activeDot={{ r: 4, strokeWidth: 2, stroke: "var(--color-background-primary-default)" }} isAnimationActive={false} />
          </AreaChart>}
      </ResponsiveContainer>
    </div>
    <dl className="grid grid-cols-3 gap-2">
      {summary.map(([label, value]) => <div key={label} className={`${insetClass} flex flex-col gap-0.5 px-3 py-2`}>
        <dt className="text-caption-regular text-text-tertiary">{label}</dt>
        <dd className="truncate text-body-2-medium text-text-primary tabular-nums">{formatValue(value, view.unit)}</dd>
      </div>)}
    </dl>
  </div>;
}

function FieldCard({ view, readings, hours, device, streams }: { view: FieldView; readings: DTO<"Reading">[]; hours: number; device: DTO<"DeviceOut">; streams: DTO<"Stream">[] }) {
  const latest = latestOf(readings, fieldRef(view.field, streams));
  const points = seriesOf(readings, fieldRef(view.field, streams));
  const caption = latest ? `Terakhir ${formatRelative(latest.at)}` : "Belum ada nilai pada rentang ini";
  let body;
  if (view.widget === "map") {
    const lat = typeof latest?.value === "number" ? latest.value : device.lat;
    const pair = view.pair_field ? latestOf(readings, fieldRef(view.pair_field, streams))?.value : undefined;
    const lon = typeof pair === "number" ? pair : device.lon;
    body = lat != null && lon != null
      ? <div className="h-44 overflow-hidden rounded-xl"><Map center={[lon, lat]} zoom={11}><MapMarker longitude={lon} latitude={lat}><MarkerContent><span className="block size-3 rounded-full border-2 border-background-primary-default bg-accent-500" /></MarkerContent></MapMarker></Map></div>
      : <PanelUnavailable title="Koordinat Belum Tersedia" />;
  } else if (view.widget === "gauge" && view.unit === "%" && typeof latest?.value === "number" && latest.value >= 0 && latest.value <= 100) {
    body = <div className="h-32"><ResponsiveContainer><RadialBarChart data={[{ value: latest.value }]} innerRadius="70%" outerRadius="100%" startAngle={180} endAngle={0} cy="85%">
      <PolarAngleAxis type="number" domain={[0, 100]} tick={false} /><RadialBar dataKey="value" fill={CHART_COLOR} background={{ fill: "var(--color-background-tertiary-default)" }} cornerRadius={8} />
    </RadialBarChart></ResponsiveContainer></div>;
  } else if ((view.widget === "line" || view.widget === "bar" || view.widget === "gauge" || view.widget === "stat") && points.length > 1) {
    body = <FieldChart view={view} points={points} hours={hours} />;
  } else if (view.widget === "table" && latest && typeof latest.value === "object") {
    body = <pre className={`${insetClass} max-h-40 overflow-auto p-3 font-mono text-body-2-regular text-text-primary`}>{JSON.stringify(latest.value, null, 2)}</pre>;
  }
  return <DashboardCard title={view.label} value={view.widget === "map" ? undefined : formatValue(latest?.value, view.unit)} description={caption}
    action={<Chip variant="caption" color="neutral">{CATEGORY_LABEL[view.category ?? "lainnya"]}</Chip>}>
    {body}
  </DashboardCard>;
}

export function DeviceOverview({ device, streams, readings, latest, hours, loading, error, range, note }: {
  device: DTO<"DeviceOut">;
  streams: DTO<"Stream">[];
  readings?: DTO<"Readings">;
  /** newest readings outside the range, used when the range is empty */
  latest?: DTO<"Readings">;
  hours: number;
  loading: boolean;
  error?: string;
  range: ReactNode;
  note?: string;
}) {
  const rows = readings?.readings ?? [];
  const older = !rows.length && latest?.readings.length ? latest.readings : undefined;
  const truncated = Boolean(readings?.next_before);
  const total = streams.reduce((sum, stream) => sum + stream.reading_count, 0);
  const online = isOnline(device.last_seen_at);
  const views = useMemo(() => {
    const layout = device.layout?.filter(widget => !widget.hidden) ?? [];
    return layout.length ? layout : fallbackWidgets(streams);
  }, [device.layout, streams]);
  // one section per data table ("nama"), whatever group the stored layout names
  const groups = useMemo(() => {
    const names = Object.fromEntries(streams.map(stream => [stream.slug, stream.name]));
    const byGroup: Record<string, FieldView[]> = {};
    for (const view of views) (byGroup[names[view.field.split("/")[0]] ?? view.group] ??= []).push(view);
    return Object.entries(byGroup);
  }, [views, streams]);
  const rangeLabel = hours === 24 ? "24 Jam" : `${hours / 24} Hari`;
  const rejected = device.rejected_count ?? 0;
  const stats: Stat[] = [
    {
      icon: RiPulseLine, tone: online ? "emerald" : "orange", label: "Status Alat",
      value: device.last_seen_at ? online ? "Online" : "Offline" : "Belum Terhubung",
      delta: online ? "Aktif" : "Tidak Aktif", deltaColor: online ? "lime" : "rose",
      caption: `Data terakhir ${formatRelative(device.last_seen_at)}`,
      hint: "Online bila alat mengirim data dalam 15 menit terakhir.",
    },
    {
      icon: RiUploadCloud2Line, tone: "blue", label: `Kiriman ${rangeLabel}`,
      value: readings ? `${rows.length.toLocaleString("id-ID")}${truncated ? "+" : ""}` : "...",
      delta: `${streams.length} Tabel Data`, deltaColor: "neutral",
      caption: truncated ? "Menampilkan 5.000 kiriman terbaru" : "Semua kiriman pada rentang ini",
    },
    {
      icon: RiDatabase2Line, tone: "purple", label: "Total Pembacaan",
      value: total.toLocaleString("id-ID"), delta: "Tersimpan", deltaColor: "neutral",
      caption: `Sejak ${new Date(device.created_at).toLocaleDateString("id-ID", { dateStyle: "medium" })}`,
    },
    {
      icon: RiErrorWarningLine, tone: rejected ? "pink" : "sky", label: "Kiriman Bermasalah",
      value: rejected.toLocaleString("id-ID"), delta: rejected ? "Ditolak" : "Aman", deltaColor: rejected ? "rose" : "lime",
      caption: `${(device.dup_count ?? 0).toLocaleString("id-ID")} kiriman ulang diabaikan`,
      hint: device.last_error ? `Alasan terakhir: ${device.last_error}` : "Kiriman ditolak bila format salah, kunci tidak valid, atau terlalu cepat.",
    },
  ];
  const provisional = device.layout_by === "rule" || (!device.layout?.length && views.length > 0);

  return <div className="flex flex-col gap-4">
    <StatCards variant="footer" columns={4} stats={stats} />
    {device.last_error && rejected > 0 && <Notice tone="danger" title="Kiriman Terakhir Ditolak">{device.last_error}</Notice>}
    {device.last_warning && isRecent(device.last_warning_at) && <Notice tone="warning" title="Format Kiriman Belum Lengkap">
      {device.last_warning} Data tetap disimpan selama masa transisi; lihat template di tab Pengaturan.
    </Notice>}

    <section aria-labelledby="device-charts" className="flex flex-col gap-4">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div className="flex flex-col gap-0.5">
          <h3 id="device-charts" className="text-title-3-medium text-text-primary">Grafik Data Sensor</h3>
          <p className="text-body-2-regular text-text-secondary">Satu kartu per field, dikelompokkan per tabel data (nama kiriman).</p>
        </div>
        {range}
      </header>
      {provisional && <Notice tone="info" title="Tampilan Sementara">Ditata dari tipe data. Server akan menata ulang setelah membaca field baru.</Notice>}
      {older && <Notice tone="info" title={`Tidak Ada Kiriman Dalam ${rangeLabel} Terakhir`}>
        Menampilkan kiriman terakhir, {formatRelative(readingTime(older[0]))}. Grafik akan kembali ke rentang ini begitu alat mengirim data baru.
      </Notice>}
      {note && <p className="text-body-2-regular text-text-secondary">{note}</p>}
      {error && <Notice tone="danger" title="Pembacaan Gagal Dimuat">{error}</Notice>}
      {loading && !readings && <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">{[0, 1, 2].map(index => <Skeleton key={index} className="h-64 rounded-2xl" />)}</div>}
      {!loading && !views.length && <PanelUnavailable title="Belum Ada Data Dari Alat Ini" description="Grafik muncul setelah alat mengirim data pertama. Buka tab Pengaturan untuk contoh kode." />}
      {groups.map(([group, items]) => <section key={group} aria-label={group} className="flex flex-col gap-3">
        <div className="flex items-center gap-2">
          <h4 className="text-body-medium text-text-primary">{group}</h4>
          <Chip variant="caption" color="soft">{items.length} Field</Chip>
        </div>
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          {items.map(view => <FieldCard key={view.field} view={view} readings={older ?? rows} hours={older ? 720 : hours} device={device} streams={streams} />)}
        </div>
      </section>)}
    </section>
  </div>;
}
