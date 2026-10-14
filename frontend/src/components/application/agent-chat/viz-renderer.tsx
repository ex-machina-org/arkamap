import { RiMapPin2Line } from "@remixicon/react";
import { Badge } from "@/components/base/badges/badge";
import { Button } from "@/components/base/buttons/button";
import { Alert } from "@/components/ui/alert";
import { StatusBadge } from "@/components/ui/status-badge";
import { CategoryBarChart, CategoryTable } from "@/components/application/data-viz/category-bar-chart";
import { ChartCard, ValueTable } from "@/components/application/data-viz/chart-card";
import { SERIES, formatDateTime, formatNumber, formatValue, formatWhen, statusTone } from "@/components/application/data-viz/format";
import { HistoryChart, SeriesLegend, StatGrid, type HistoryPoint, type Mark } from "@/components/application/data-viz/history-chart";
import { ThresholdBars, type Limit } from "@/components/application/data-viz/threshold-bars";
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

type Status = { kategori: string; tingkat: number };
const statusOf = (value: unknown): Status | null => {
  const s = value && typeof value === "object" ? value as Item : null;
  return s && typeof s.kategori === "string" && typeof s.tingkat === "number" ? { kategori: s.kategori, tingkat: s.tingkat } : null;
};
/** The official limits of a metric as chart lines: the national limit first, then the WHO guideline. */
function limitsOf(standard: unknown): Limit[] {
  const s = standard && typeof standard === "object" ? standard as Item : null;
  if (!s) return [];
  // the national limit is a "baku mutu"; an index scale (US AQI) only has the upper end of "Sedang"
  return [num(s.batas) != null && { value: num(s.batas)!, label: text(s.batas_nama).startsWith("baku mutu") ? "baku mutu" : "batas Sedang" },
    num(s.pedoman) != null && { value: num(s.pedoman)!, label: "WHO" }].filter(Boolean) as Limit[];
}
/** "Baku mutu nasional 55 µg/m³ (PP 22/2021) · pedoman WHO 15 µg/m³": where the numbers come from. */
function limitText(standard: unknown, unit: string | null) {
  const s = standard && typeof standard === "object" ? standard as Item : null;
  if (!s) return "";
  return [num(s.batas) != null && `${text(s.batas_nama)}: ${formatValue(s.batas, unit)}`,
    num(s.pedoman) != null && `${text(s.pedoman_nama)}: ${formatValue(s.pedoman, unit)}`, text(s.skala)].filter(Boolean).join(" · ");
}

/** One metric compared by its real value (µg/m³), against its official limits, region under discussion in view. */
function ValueRankingViz({ viz }: { viz: Item }) {
  const metric = Object.keys(viz.weights as Item)[0];
  const unit = text((viz.units as Item | undefined)?.[metric]) || null;
  const label = text((viz.labels as Item | undefined)?.[metric], metric);
  const standard = (viz.standar as Item | undefined)?.[metric];
  const over = viz.melebihi_batas && typeof viz.melebihi_batas === "object" ? viz.melebihi_batas as Item : null;
  const level = text(viz.level) === "kabkota" ? "kab/kota" : "provinsi";
  const items = rows(viz.results).flatMap(row => {
    const value = num((row.values as Item | undefined)?.[metric]);
    return value == null ? [] : [{ key: text(row.region_id), rank: num(row.peringkat), name: text(row.name, text(row.region_id)), value,
      status: statusOf(row.status), highlight: row.region_id === viz.sorot }];
  });
  const here = items.find(item => item.highlight);
  return <ChartCard title={`${label} per ${level}`}
    description={[viz.sort === "value_asc" ? "terendah dulu" : "tertinggi dulu",
      over && `${formatNumber(num(over.jumlah) ?? 0)} dari ${formatNumber(num(over.dari) ?? 0)} ${level} melebihi baku mutu`,
      here && `${here.name}: peringkat ${here.rank}`].filter(Boolean).join(" · ")}
    meta={rows(viz.results).some(row => Number(row.modelled_share) > 0) && <Badge>MODEL</Badge>}
    empty={items.length ? false : "Tidak ada wilayah dengan data ini"}
    table={<ValueTable caption={label} columns={["Peringkat", "Wilayah", label, ...(items.some(i => i.status) ? ["Kategori"] : [])]}
      rows={items.map(item => [String(item.rank ?? ""), item.name, formatValue(item.value, unit), ...(items.some(i => i.status) ? [item.status?.kategori ?? "—"] : [])])} />}
    footer={limitText(standard, unit) ? `Acuan: ${limitText(standard, unit)}. Nilai = rata-rata 7 hari dari model, bukan stasiun ukur.` : undefined}>
    <ThresholdBars items={items} unit={unit} limits={limitsOf(standard)} label={label} />
  </ChartCard>;
}

function RankingViz({ viz }: { viz: Item }) {
  // one metric ranked by its value: show the value itself, not the 0-100 attention score
  if (viz.weights && Object.keys(viz.weights as Item).length === 1 && (viz.sort === "value_desc" || viz.sort === "value_asc" || viz.standar))
    return <ValueRankingViz viz={viz} />;
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

/** The verdict on the air as a whole: the worst pollutant decides, as ISPU reads it; what was weighed and what is missing. */
function AirVerdict({ air }: { air: Item }) {
  const list = (value: unknown) => Array.isArray(value) ? value.map(item => text(item)).filter(Boolean) : [];
  const level = num(air.tingkat) ?? 0;
  const lead = list(air.dominan), over = list(air.melebihi_batas), who = list(air.melebihi_pedoman_who), missing = list(air.belum_ada);
  return <div className="flex flex-col gap-1.5 rounded-lg border border-border-button-default p-3">
    <p className="flex flex-wrap items-center gap-2 text-body-compact text-text-secondary">
      <span className="text-body-semibold text-text-primary">Kualitas udara</span>
      <StatusBadge tone={statusTone(level)}>{text(air.kategori)}</StatusBadge>
      {lead.length > 0 && <span>ditentukan oleh {lead.join(", ")}</span>}
    </p>
    <p className="text-caption-1 text-text-secondary">
      {over.length ? `Melebihi baku mutu nasional: ${over.join(", ")}.` : "Tidak ada polutan yang melebihi baku mutu nasional."}
      {who.filter(item => !over.includes(item)).length > 0 && ` Di atas pedoman WHO: ${who.filter(item => !over.includes(item)).join(", ")}.`}
    </p>
    <p className="text-caption-1 text-text-tertiary">
      Dinilai dari {list(air.dinilai).join(", ")}{missing.length ? `; belum ada data ${missing.join(", ")}, jadi penilaian belum lengkap` : ""}.
    </p>
  </div>;
}

function RegionCardViz({ viz }: { viz: Item }) {
  const air = viz.kualitas_udara && typeof viz.kualitas_udara === "object" ? viz.kualitas_udara as Item : null;
  const indicators = rows(viz.indicators).filter(row => row.value != null);
  const population = num(viz.population);
  return <ChartCard title={text(viz.name, "Ringkasan wilayah")} description={[text(viz.level), population != null && `${formatNumber(population)} jiwa`].filter(Boolean).join(" · ")}
    empty={indicators.length ? false : "Belum ada indikator untuk wilayah ini"}
    table={<ValueTable columns={["Indikator", "Nilai", "Kategori", "Periode"]} rows={indicators.map(row => [text(row.label), formatValue(row.value, text(row.unit)), statusOf(row.status)?.kategori ?? "—", text(row.period)])} />}
    footer={indicators.some(row => statusOf(row.status)) ? "Kategori dibaca dari baku mutu nasional (PP 22/2021), pedoman WHO 2021, dan ISPU. Nilai udara = rata-rata 7 hari dari model." : undefined}>
    {air && <AirVerdict air={air} />}
    <div className="grid gap-2 sm:grid-cols-2">{indicators.slice(0, 8).map((row, index) => <div key={index} className="rounded-lg bg-background-secondary-default p-3">
      <p className="flex items-center justify-between gap-2 text-caption-1 text-text-secondary"><span className="truncate">{text(row.label)}</span>{row.is_modelled === true && <Badge>MODEL</Badge>}</p>
      <p className="mt-1 text-heading-md text-text-primary">{formatValue(row.value, text(row.unit))}</p>
      {statusOf(row.status) && <div className="mt-1.5 flex flex-wrap items-center gap-x-2 gap-y-1">
        <StatusBadge tone={statusTone(statusOf(row.status)!.tingkat)}>{statusOf(row.status)!.kategori}</StatusBadge>
        {limitsOf(row.standar).length > 0 && <span className="text-caption-1 text-text-secondary">
          {limitsOf(row.standar).map(limit => `${limit.label} ${formatValue(limit.value, text(row.unit))}`).join(" · ")}</span>}
      </div>}
      <p className="mt-1 text-caption-1 text-text-tertiary">{[text(row.period), text(row.source_id)].filter(Boolean).join(" · ")}</p>
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

const obj = (value: unknown) => value && typeof value === "object" ? value as Item : null;
/** "naik 22,3 µg/m³ (24,2%)" from a tool's perubahan, or null. */
function changeText(change: Item | null, unit: string | null) {
  if (!change) return null;
  const percent = num(change.persen);
  return `${text(change.arah)} ${formatValue(Math.abs(num(change.nilai) ?? 0), unit)}${percent != null ? ` (${formatNumber(Math.abs(percent))}%)` : ""}`;
}
/** A point's time as the chart reads it: a timestamp string, or a date for daily data. */
const at = (value: unknown) => text(value);
/** The time window in words: "7 hari terakhir", "24 jam terakhir", "rentang ini". */
function windowText(viz: Item) {
  const hours = num(viz.hours);
  if (hours != null) return hours >= 48 && hours % 24 === 0 ? `${formatNumber(hours / 24)} hari terakhir` : `${formatNumber(hours)} jam terakhir`;
  return viz.since ? "rentang ini" : `${text(viz.days, "?")} hari terakhir`;
}
function historyPoints(value: unknown) {
  return rows(value).flatMap(row => num(row.value) == null ? [] : [{ t: at(row.period), v: num(row.value), lo: num(row.min), hi: num(row.max) }]);
}
/** The highest and lowest point, labelled on the chart where they happened. */
function extremes(summary: Item | null): Mark[] {
  const out: Mark[] = [];
  for (const [key, label] of [["tertinggi", "tertinggi"], ["terendah", "terendah"]] as const) {
    const mark = obj(summary?.[key]);
    if (mark && num(mark.nilai) != null) out.push({ t: at(mark.waktu), v: num(mark.nilai)!, label });
  }
  return out.length === 2 && out[0].t === out[1].t && out[0].v === out[1].v ? [] : out;
}

function TrendViz({ viz }: { viz: Item }) {
  const raw = rows(viz.points);
  const points = historyPoints(viz.points);
  // a region indicator names its region; a user's own sensor (my_readings) names "device · table" in `subject`
  const subject = text(viz.subject) || text(obj(viz.region)?.name);
  const summary = obj(viz.ringkasan);
  const unit = text(viz.unit) || null;
  const label = text(viz.label, text(viz.metric, "Tren"));
  const per = text(viz.per);
  const latest = raw.length ? raw[raw.length - 1] : null;
  const high = obj(summary?.tertinggi), low = obj(summary?.terendah);
  const stats = [
    latest && { label: "Terakhir", value: formatValue(latest.value, unit), hint: formatWhen(at(latest.period)) },
    summary?.rata_rata != null && { label: "Rata-rata", value: formatValue(summary.rata_rata, unit), hint: windowText(viz) },
    high && { label: "Tertinggi", value: formatValue(high.nilai, unit), hint: formatWhen(at(high.waktu)) },
    low && { label: "Terendah", value: formatValue(low.nilai, unit), hint: formatWhen(at(low.waktu)) },
  ].filter(Boolean) as { label: string; value: string; hint?: string }[];
  const change = changeText(obj(viz.perubahan), unit);
  const status = statusOf(viz.status_terakhir);
  const over = num(viz.periode_melebihi_batas);
  return <ChartCard title={[label, subject].filter(Boolean).join(" · ")}
    footer={limitText(viz.standar, unit) ? `Acuan: ${limitText(viz.standar, unit)}.` : undefined}
    description={[change && `${change} dalam ${windowText(viz)}`, per && `garis = ${per}, pita = rentang tiap periode`,
      num(viz.count) != null && `${formatNumber(num(viz.count)!)} bacaan`].filter(Boolean).join(" · ") || `${formatNumber(points.length)} periode tersimpan`}
    meta={raw.some(row => row.is_modelled === true) && <Badge>MODEL</Badge>}
    empty={points.length ? false : `Belum ada data dalam ${windowText(viz)}`}
    table={<SeriesTable points={points.map(p => ({ t: p.t, v: p.v }))} unit={unit} label={label} />}>
    <div className="flex flex-col gap-3">
      {status && <p className="flex flex-wrap items-center gap-2 text-body-compact text-text-secondary">
        <StatusBadge tone={statusTone(status.tingkat)}>{status.kategori}</StatusBadge>
        <span>{over ? `melebihi baku mutu di ${formatNumber(over)} dari ${formatNumber(points.length)} periode` : "nilai terakhir"}</span>
      </p>}
      {stats.length > 1 && <StatGrid items={stats} />}
      <HistoryChart series={[{ key: "v", name: label, color: SERIES[0], points }]} unit={unit} label={label}
        mean={num(summary?.rata_rata)} marks={extremes(summary)} limits={limitsOf(viz.standar)} />
    </div>
  </ChartCard>;
}

/** Several lines over one window (compare, my_compare). One metric across regions shares one chart;
 *  different metrics or sensor fields get a chart each, on the same time axis, never a second y-axis. */
function TrendCompareViz({ viz }: { viz: Item }) {
  const series: (Item & { key: string; color: string; points: HistoryPoint[] })[] = rows(viz.series).slice(0, SERIES.length)
    .map((s, index) => ({ ...s, key: `s${index}`, color: SERIES[index], points: historyPoints(s.points) }));
  const same = viz.same_metric === true;
  const unit = same ? text(series[0]?.unit) || null : null;
  const all = series.flatMap(s => s.points.map(p => new Date(p.t).getTime())).filter(Number.isFinite);
  const domain: [number, number] | undefined = all.length ? [Math.min(...all), Math.max(...all)] : undefined;
  const title = same ? text(viz.label, "Perbandingan") : `Perbandingan · ${text(viz.subject)}`;
  const latest = (s: Item) => obj(s.terakhir);
  const detail = (s: Item & { unit?: unknown }) => {
    const last = latest(s), change = changeText(obj(s.perubahan), text(s.unit) || null);
    const status = statusOf(s.status_terakhir);
    return [last && `terakhir ${formatValue(last.nilai, text(s.unit) || null)}`, status?.kategori, change].filter(Boolean).join(" · ");
  };
  // who leads at the end: the reader's first question in a comparison of one metric
  const ranked = same ? [...series].filter(s => latest(s)).sort((a, b) => (num(latest(b)!.nilai) ?? 0) - (num(latest(a)!.nilai) ?? 0)) : [];
  const table = <ValueTable caption={title} columns={["Waktu", ...series.map(s => text(s.name))]}
    rows={[...new Set(series.flatMap(s => s.points.map(p => p.t)))].sort((a, b) => new Date(b).getTime() - new Date(a).getTime())
      .map(t => [formatWhen(t), ...series.map(s => { const p = s.points.find(x => x.t === t); return p ? formatValue(p.v, text(s.unit) || null) : "—"; })])} />;
  return <ChartCard title={title}
    description={[windowText(viz), ranked.length > 1 && `tertinggi terakhir: ${text(ranked[0].name)}`].filter(Boolean).join(" · ")}
    empty={series.some(s => s.points.length) ? false : `Belum ada data dalam ${windowText(viz)}`} table={table}>
    {same ? <div className="flex flex-col gap-3">
      <SeriesLegend items={series.map(s => ({ key: s.key, name: text(s.name), color: s.color, detail: detail(s) }))} />
      <HistoryChart series={series.map(s => ({ key: s.key, name: text(s.name), color: s.color, points: s.points }))} unit={unit} label={title} height={220}
        limits={limitsOf(series[0]?.standar)} />
    </div> : <div className="flex flex-col gap-4">{series.map(s => {
      const summary = obj(s.ringkasan);
      return <div key={s.key} className="flex flex-col gap-1">
        <SeriesLegend items={[{ key: s.key, name: text(s.label, text(s.name)), color: s.color, detail: detail(s) }]} />
        <HistoryChart series={[{ key: s.key, name: text(s.name), color: s.color, points: s.points }]} unit={text(s.unit) || null}
          label={text(s.name)} domain={domain} mean={num(summary?.rata_rata)} marks={extremes(summary)} height={150} limits={limitsOf(s.standar)} />
      </div>;
    })}</div>}
  </ChartCard>;
}

const EVENT_LABEL: Record<string, string> = { quake: "Gempa", hotspot: "Titik panas", disaster: "Bencana" };

/** How often events were recorded per day or week: bars, the average, the busiest period,
 *  and the stretch before Arkamap held this data marked as not yet recorded rather than zero. */
function EventTrendViz({ viz }: { viz: Item }) {
  const kind = text(viz.kind);
  const per = text(viz.per, "hari");
  const summary = obj(viz.ringkasan);
  const half = obj(viz.paruh);
  const region = text(obj(viz.region)?.name) || "Nasional";
  const points = rows(viz.points).map(row => ({ t: at(row.period), v: num(row.value) ?? 0,
    note: num(row.terkuat) != null ? `terkuat M ${formatNumber(num(row.terkuat)!)}` : undefined }));
  const peak = obj(summary?.tertinggi), strongest = obj(summary?.terkuat);
  const since = text(viz.data_sejak);
  const stats = [
    { label: "Total", value: formatNumber(num(viz.total) ?? 0), hint: `${text(viz.days)} hari terakhir` },
    summary?.rata_rata != null && { label: `Rata-rata/${per}`, value: formatNumber(num(summary.rata_rata)!) },
    peak && { label: `${per === "hari" ? "Hari" : "Minggu"} tersibuk`, value: formatNumber(num(peak.nilai) ?? 0), hint: formatWhen(at(peak.waktu)) },
    strongest ? { label: "Terkuat", value: `M ${formatNumber(num(strongest.nilai)!)}`, hint: formatWhen(at(strongest.waktu)) }
      : summary?.tanpa_kejadian != null && { label: `${per === "hari" ? "Hari" : "Minggu"} kosong`, value: formatNumber(num(summary.tanpa_kejadian)!) },
  ].filter(Boolean) as { label: string; value: string; hint?: string }[];
  const label = EVENT_LABEL[kind] ?? text(viz.label, "Kejadian");
  return <ChartCard title={`${label} per ${per} · ${region}`}
    description={[half && `paruh akhir ${formatNumber(num(half.akhir) ?? 0)} vs paruh awal ${formatNumber(num(half.awal) ?? 0)} (${text(half.arah)})`,
      since && `data tersimpan sejak ${formatWhen(since)}`].filter(Boolean).join(" · ")}
    meta={kind === "hotspot" && <Badge>Bukan konfirmasi kebakaran</Badge>}
    empty={points.length ? false : "Tidak ada data pada periode ini"}
    table={<ValueTable caption={`${label} per ${per}`} columns={["Tanggal", "Jumlah", ...(kind === "quake" ? ["Terkuat"] : [])]}
      rows={[...points].reverse().map(p => [formatWhen(p.t), formatNumber(p.v), ...(kind === "quake" ? [p.note?.replace("terkuat ", "") ?? "—"] : [])])} />}>
    <div className="flex flex-col gap-3">
      <StatGrid items={stats} />
      <HistoryChart series={[{ key: "v", name: label, color: SERIES[0], points }]} variant="bar" label={`${label} per ${per}`}
        mean={num(summary?.rata_rata)} unrecorded={since && points.length && since > points[0].t ? { from: points[0].t, to: since } : undefined}
        marks={peak && num(peak.nilai) ? [{ t: at(peak.waktu), v: num(peak.nilai)!, label: "tersibuk" }] : []} />
    </div>
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
  const table = <ValueTable caption={`Isi tabel ${text(viz.table)}`} columns={["Waktu", ...columns.map(column => text(column.label, text(column.key)))]}
    rows={data.map(row => [formatDateTime(text(row.waktu)), ...columns.map(column => cell(row[text(column.key)]))])} />;
  // A chart only earns its place for history: several moments in time and a column of numbers to follow across them.
  const history = new Set(data.map(row => text(row.waktu))).size >= 3;
  const numeric = history ? columns.filter(column => {
    const values = data.map(row => row[text(column.key)]).filter(value => value != null && value !== "");
    return values.length >= 2 && values.every(value => num(value) != null);
  }).slice(0, 3) : [];
  return <ChartCard title={[text(viz.table, "Tabel data"), text(viz.device)].filter(Boolean).join(" · ")}
    description={[`${formatNumber(total)} baris`, viz.since ? span(viz.since, viz.until) : ""].filter(Boolean).join(" · ")}
    meta={versions.length > 1 && <Badge>{`${versions.length} versi`}</Badge>}
    empty={data.length ? false : `Tidak ada baris pada rentang ini.${viz.table_first ? ` Data tabel ini ada pada ${span(viz.table_first, viz.table_last)}.` : ""}`}
    table={numeric.length ? table : undefined}
    footer={notes || undefined}>
    {numeric.length ? <div className="flex flex-col gap-4">{numeric.map((column, index) => {
      const label = text(column.label, text(column.key));
      const points = data.map(row => ({ t: text(row.waktu), v: num(row[text(column.key)]) }));
      return <div key={text(column.key)} className="flex flex-col gap-1">
        {numeric.length > 1 && <p className="text-caption-1 text-text-secondary">{label}</p>}
        <TimeSeriesChart points={points} label={label} color={SERIES[index]} height={numeric.length > 1 ? 140 : 176} />
      </div>;
    })}</div> : table}
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
    case "trend_compare": return <TrendCompareViz viz={viz} />;
    case "event_trend": return <EventTrendViz viz={viz} />;
    case "data_table": return <DataTableViz viz={viz} />;
    default: return <ChartCard title={text(viz.type, "Data")}>
      <Alert tone="info" title="Komponen belum tersedia">{`Tampilan untuk "${text(viz.type, "data ini")}" belum siap; berikut data mentahnya.`}</Alert>
      <DataFacts value={Object.fromEntries(Object.entries(viz).filter(([key]) => key !== "geojson"))} />
    </ChartCard>;
  }
}
