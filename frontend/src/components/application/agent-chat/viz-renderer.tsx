import { RiMapPin2Line } from "@remixicon/react";
import { Badge } from "@/components/base/badges/badge";
import { Button } from "@/components/base/buttons/button";
import { Alert } from "@/components/ui/alert";
import { StatusBadge } from "@/components/ui/status-badge";
import { CategoryBarChart, CategoryTable } from "@/components/application/data-viz/category-bar-chart";
import { ChartCard, ValueTable } from "@/components/application/data-viz/chart-card";
import { formatDateTime, formatNumber, formatValue } from "@/components/application/data-viz/format";
import { SeriesTable, TimeSeriesChart } from "@/components/application/data-viz/time-series-chart";
import { DataFacts } from "./data-facts";

type Item = Record<string, unknown>;
const rows = (value: unknown): Item[] => Array.isArray(value) ? value.filter((row): row is Item => !!row && typeof row === "object") : [];
const text = (value: unknown, fallback = "") => typeof value === "string" ? value : value == null ? fallback : String(value);
const num = (value: unknown) => typeof value === "number" && Number.isFinite(value) ? value : null;

const KIND_LABEL: Record<string, string> = { hotspot: "Titik panas", quake: "Gempa", disaster: "Bencana",
  power_plant: "Pembangkit listrik", transit_stop: "Halte TransJakarta" };
/** Facility layers have no time window: they are counted where they stand, not "in the last N days". */
const FACILITY = new Set(["power_plant", "transit_stop"]);

function RankingViz({ viz }: { viz: Item }) {
  const results = rows(viz.results);
  const data = results.flatMap(row => num(row.score) == null ? [] : [{ label: text(row.name, text(row.region_id)), value: num(row.score)!,
    note: Number(row.modelled_share) > 0 ? `MODEL ${Math.round(Number(row.modelled_share) * 100)}%` : "Observasi" }]);
  const labels = viz.labels && typeof viz.labels === "object" ? Object.values(viz.labels as Item).map(label => text(label)) : [];
  return <ChartCard title={`Peringkat ${text(viz.level, "wilayah")}`} description={labels.length ? `Bobot: ${labels.join(", ")}` : undefined}
    meta={data.some(item => item.note !== "Observasi") && <Badge>MODEL</Badge>}
    empty={data.length ? false : "Tidak ada wilayah yang bisa diperingkat"}
    table={<CategoryTable data={data} label="Skor perhatian" />}
    footer={text(viz.score_meaning, "Skor 0–100: makin tinggi makin perlu perhatian. Bukan probabilitas bencana.")}>
    <CategoryBarChart data={data} label="Skor perhatian" domain={[0, 100]} />
  </ChartCard>;
}

function RegionCardViz({ viz }: { viz: Item }) {
  const indicators = rows(viz.indicators).filter(row => row.value != null);
  const population = num(viz.population);
  return <ChartCard title={text(viz.name, "Ringkasan wilayah")} description={[text(viz.level), population != null && `${formatNumber(population)} jiwa`].filter(Boolean).join(" · ")}
    empty={indicators.length ? false : "Belum ada indikator untuk wilayah ini"}
    table={<ValueTable columns={["Indikator", "Nilai", "Periode"]} rows={indicators.map(row => [text(row.label), formatValue(row.value, text(row.unit)), text(row.period)])} />}
    footer={text(viz.score_meaning)}>
    <div className="grid gap-2 sm:grid-cols-2">{indicators.slice(0, 8).map((row, index) => <div key={index} className="rounded-lg bg-background-secondary-default p-3">
      <p className="flex items-center justify-between gap-2 text-caption-1 text-text-secondary"><span className="truncate">{text(row.label)}</span>{row.is_modelled === true && <Badge>MODEL</Badge>}</p>
      <p className="mt-1 text-heading-md tabular-nums text-text-primary">{formatValue(row.value, text(row.unit))}</p>
      <p className="text-caption-1 text-text-tertiary">{[text(row.period), text(row.source_id)].filter(Boolean).join(" · ")}</p>
    </div>)}</div>
    {indicators.length > 8 && <p className="text-caption-1 text-text-secondary">+{indicators.length - 8} indikator lain di tampilan tabel.</p>}
  </ChartCard>;
}

function EventMapViz({ viz, onEvents }: { viz: Item; onEvents?: (geojson: unknown) => void }) {
  const kind = text(viz.kind);
  const top = rows(viz.top);
  const region = viz.region && typeof viz.region === "object" ? text((viz.region as Item).name) : "Nasional";
  const total = num(viz.total_count) ?? top.length;
  const where = (row: Item) => [text(row.kabkota), text(row.provinsi)].filter(Boolean).join(", ") || "—";
  const columns = kind === "quake" ? ["Lokasi", "Magnitudo", "Waktu"] : kind === "hotspot" ? ["Waktu", "FRP (MW)", "Keyakinan"]
    : kind === "power_plant" ? ["Nama", "Kapasitas", "Bahan bakar", "Lokasi"] : kind === "transit_stop" ? ["Nama", "Lokasi"] : ["Nama", "Jenis", "Waktu"];
  const tableRows = top.map(row => kind === "quake" ? [text(row.place, "—"), formatValue(row.mag), formatDateTime(text(row.observed_at))]
    : kind === "hotspot" ? [formatDateTime(text(row.observed_at)), formatValue(row.frp), text(row.confidence, "—")]
    : kind === "power_plant" ? [text(row.name, "—"), formatValue(row.capacity_mw, "MW"), text(row.fuel, "—"), where(row)]
    : kind === "transit_stop" ? [text(row.name, "—"), where(row)]
    : [text(row.name, "—"), text(row.type, "—"), formatDateTime(text(row.observed_at))]);
  const facility = FACILITY.has(kind);
  const capacity = num(viz.total_capacity_mw);
  return <ChartCard title={`${KIND_LABEL[kind] ?? "Kejadian"} · ${region}`}
    description={facility ? `${formatNumber(total)} ${KIND_LABEL[kind].toLowerCase()}${capacity != null ? `, total ${formatValue(capacity, "MW")}` : ""}`
      : `${formatNumber(total)} tercatat dalam ${text(viz.days, "?")} hari terakhir`}
    meta={kind === "hotspot" && <Badge>Bukan konfirmasi kebakaran</Badge>}
    footer={onEvents && viz.geojson ? <Button size="small" variant="secondary" leadingIcon={RiMapPin2Line} onClick={() => onEvents(viz.geojson)}>Tampilkan di peta</Button> : undefined}>
    {tableRows.length ? <ValueTable caption={`${KIND_LABEL[kind] ?? "Kejadian"} ${facility ? "terbesar" : "teratas"}`} columns={columns} rows={tableRows} />
      : <p className="text-body-compact text-text-secondary">{facility ? "Tidak ada fasilitas di wilayah ini." : "Tidak ada kejadian pada periode ini."}</p>}
  </ChartCard>;
}

function TrendViz({ viz }: { viz: Item }) {
  const raw = rows(viz.points);
  const points = raw.flatMap(row => num(row.value) == null ? [] : [{ t: text(row.period), v: num(row.value) }]);
  // a region indicator names its region; a user's own sensor (my_readings) names "device · table" in `subject`
  const subject = text(viz.subject) || (viz.region && typeof viz.region === "object" ? text((viz.region as Item).name) : "");
  const change = viz.perubahan && typeof viz.perubahan === "object" ? viz.perubahan as Item : null;
  const stats = viz.stats && typeof viz.stats === "object" ? viz.stats as Item : null;
  const unit = text(viz.unit) || null;
  const label = text(viz.label, text(viz.metric, "Tren"));
  const percent = change ? num(change.persen) : null;
  const since = change && text(change.dari).includes("T") ? formatDateTime(text(change.dari)) : text(change?.dari);
  const span = num(viz.hours) != null ? `${formatNumber(num(viz.hours)!)} jam terakhir`
    : viz.since ? "rentang ini" : `${text(viz.days, "?")} hari terakhir`;
  return <ChartCard title={[label, subject].filter(Boolean).join(" · ")}
    description={[change && `${text(change.arah)} ${formatValue(Math.abs(num(change.nilai) ?? 0), unit)}${percent != null ? ` (${formatNumber(Math.abs(percent))}%)` : ""} sejak ${since}`,
      stats && `rata-rata ${formatValue(stats.mean, unit)}, ${formatValue(stats.min)}–${formatValue(stats.max, unit)}`].filter(Boolean).join(" · ")
      || `${formatNumber(points.length)} periode tersimpan`}
    meta={raw.some(row => row.is_modelled === true) && <Badge>MODEL</Badge>}
    empty={points.length ? false : `Belum ada data dalam ${span}`}
    table={<SeriesTable points={points} unit={unit} label={label} />}>
    <TimeSeriesChart points={points} unit={unit} label={label} />
  </ChartCard>;
}

/** Rows of the user's own IoT data table (my_table): only the columns and period asked for, newest first. */
function DataTableViz({ viz }: { viz: Item }) {
  const columns = rows(viz.columns);
  const data = rows(viz.rows);
  const total = num(viz.total) ?? data.length;
  const shown = num(viz.shown) ?? data.length;
  const span = (from: unknown, to: unknown) => `${formatDateTime(text(from))} – ${formatDateTime(text(to))}`;
  const versions = rows(viz.versions);
  const missing = Array.isArray(viz.tidak_ada) ? viz.tidak_ada.map(item => text(item)) : [];
  const cell = (value: unknown) => value == null || value === "" ? "—" : formatValue(value);
  const notes = [shown < total && `Menampilkan ${formatNumber(shown)} baris terbaru dari ${formatNumber(total)}.`,
    missing.length > 0 && `Kolom ${missing.join(", ")} tidak ada di tabel ini.`].filter(Boolean).join(" ");
  return <ChartCard title={[text(viz.table, "Tabel data"), text(viz.device)].filter(Boolean).join(" · ")}
    description={[`${formatNumber(total)} baris`, viz.since ? span(viz.since, viz.until) : ""].filter(Boolean).join(" · ")}
    meta={versions.length > 1 && <Badge>{`${versions.length} versi`}</Badge>}
    empty={data.length ? false : `Tidak ada baris pada rentang ini.${viz.table_first ? ` Data tabel ini ada pada ${span(viz.table_first, viz.table_last)}.` : ""}`}
    footer={notes || undefined}>
    <ValueTable caption={`Isi tabel ${text(viz.table)}`} columns={["Waktu", ...columns.map(column => text(column.label, text(column.key)))]}
      rows={data.map(row => [formatDateTime(text(row.waktu)), ...columns.map(column => cell(row[text(column.key)]))])} />
  </ChartCard>;
}

const URGENCY_TONE: Record<string, "danger" | "warning" | "info"> = { tinggi: "danger", high: "danger", sedang: "warning", medium: "warning", rendah: "info", low: "info" };

function AlertsViz({ viz }: { viz: Item }) {
  const weather = rows(viz.weather_warnings), quakes = rows(viz.quake_alerts), regions = rows(viz.region_alerts), disasters = rows(viz.disaster_alerts), sources = rows(viz.source_alerts);
  const count = num(viz.count) ?? weather.length + quakes.length + regions.length + disasters.length;
  return <ChartCard title="Peringatan aktif" description={`${formatNumber(count)} hal perlu perhatian`} empty={count || sources.length ? false : "Tidak ada peringatan saat ini"}>
    <div className="flex flex-col gap-3">
      {weather.length > 0 && <AlertGroup title="Peringatan cuaca BMKG" items={weather.map(row => ({ tone: /severe|extreme|awas/i.test(text(row.severity)) ? "danger" : "warning", label: text(row.severity, "Peringatan"),
        text: `${text(row.event)} · ${text(row.area)}`, detail: row.expires ? `Berlaku hingga ${formatDateTime(text(row.expires))}` : "" }))} />}
      {quakes.length > 0 && <AlertGroup title="Gempa" items={quakes.map(row => ({ tone: URGENCY_TONE[text(row.urgency).toLowerCase()] ?? "warning", label: `M ${formatValue(row.mag)}`,
        text: text(row.place, "Lokasi tidak tersedia"), detail: formatDateTime(text(row.observed_at)) }))} />}
      {disasters.length > 0 && <AlertGroup title="Bencana" items={disasters.map(row => ({ tone: "warning", label: text(row.type, "Bencana"), text: text(row.name, "—"), detail: text(row.observed_at) ? formatDateTime(text(row.observed_at)) : "" }))} />}
      {regions.length > 0 && <AlertGroup title="Indikator wilayah tinggi" items={regions.map(row => ({ tone: "info", label: `${formatValue(row.normalised)}/100`,
        text: `${text(row.name)} · ${text(row.label)}`, detail: formatValue(row.value) }))} />}
      {num(viz.not_shown) ? <p className="text-caption-1 text-text-secondary">+{formatNumber(num(viz.not_shown)!)} peringatan wilayah lain tidak ditampilkan.</p> : null}
      {sources.length > 0 && <AlertGroup title="Sumber data bermasalah" items={sources.map(row => ({ tone: "neutral", label: "Sumber", text: text(row.title, text(row.id)),
        detail: row.last_ok_at ? `Terakhir berhasil ${formatDateTime(text(row.last_ok_at))}` : "Belum pernah berhasil" }))} />}
    </div>
  </ChartCard>;
}

function AlertGroup({ title, items }: { title: string; items: { tone: "danger" | "warning" | "info" | "neutral"; label: string; text: string; detail?: string }[] }) {
  return <div><h4 className="mb-1.5 text-body-semibold text-text-secondary">{title}</h4>
    <ul className="flex flex-col gap-1.5">{items.map((item, index) => <li key={index} className="flex items-start gap-2 text-body-compact">
      <StatusBadge tone={item.tone} className="shrink-0">{item.label}</StatusBadge>
      <span className="min-w-0"><span className="text-text-primary">{item.text}</span>{item.detail && <span className="block text-caption-1 text-text-secondary">{item.detail}</span>}</span>
    </li>)}</ul>
  </div>;
}

/** Renders one `viz` item from the AI stream by its `type`. A type this UI has no component for yet
 *  says so, and still lists its data so nothing the answer refers to goes missing. */
export function VizRenderer({ viz, onEvents }: { viz: Item; onEvents?: (geojson: unknown) => void }) {
  switch (viz.type) {
    case "ranking": return <RankingViz viz={viz} />;
    case "region_card": return <RegionCardViz viz={viz} />;
    case "event_map": return <EventMapViz viz={viz} onEvents={onEvents} />;
    case "alerts": return <AlertsViz viz={viz} />;
    case "trend": return <TrendViz viz={viz} />;
    case "data_table": return <DataTableViz viz={viz} />;
    default: return <ChartCard title={text(viz.type, "Data")}>
      <Alert tone="info" title="Komponen belum tersedia">{`Tampilan untuk "${text(viz.type, "data ini")}" belum siap; berikut data mentahnya.`}</Alert>
      <DataFacts value={Object.fromEntries(Object.entries(viz).filter(([key]) => key !== "geojson"))} />
    </ChartCard>;
  }
}
