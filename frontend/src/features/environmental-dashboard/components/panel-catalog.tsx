import type { ReactNode } from "react";
import { RiAlarmWarningFill, RiCheckboxCircleFill, RiErrorWarningFill } from "@remixicon/react";
import { PolarAngleAxis, RadialBar, RadialBarChart, ResponsiveContainer } from "recharts";
import { CategoryBarChart } from "@/components/application/data-viz/category-bar-chart";
import { SERIES, statusTone } from "@/components/application/data-viz/format";
import { HistoryChart, SeriesLegend, StatGrid } from "@/components/application/data-viz/history-chart";
import { ThresholdBars } from "@/components/application/data-viz/threshold-bars";
import { TimeSeriesChart } from "@/components/application/data-viz/time-series-chart";
import { StatHint } from "@/components/application/dashboard/stat-cards";
import { Skeleton } from "@/components/ui/skeleton";
import { StatusBadge } from "@/components/ui/status-badge";
import type { DTO } from "@/lib/api/client";
import { cx } from "@/utils/cx";
import { formatDecimal } from "../format";
import { prettifyId } from "../labels";
import { TREND_DAYS, useRegionSummary, useRegionWeek, useStandards, type WeekPoint } from "../use-region-data";
import { day, MetricRankingWidget, trendDelta } from "./configurable-widgets";
import { DashboardCard, insetClass, LegendTiles, PanelUnavailable } from "./dashboard-card";
import type { WidgetContext } from "./widget-renderer";

/*
 * The dashboard panels of app/panels.py: one fixed shape each, filled with the profile's
 * region. The AI picks which ones a profile starts with; the gallery offers all of them.
 */

type Indicator = DTO<"IndicatorValue">;
type Standard = DTO<"AirStandard">;
type Level = { kategori: string; tingkat: number };
/** `about`: what this is and what is normal, in plain words. `info`: the ⓘ with why it is shown and the technical source. */
type PanelProps = { ctx: WidgetContext; title: string; now: Record<string, Indicator>; about: string; info: ReactNode };

const POLLUTANTS = ["pm25_mean", "pm10_mean", "no2_mean", "so2_mean", "o3_max8h", "co_mean"];
const SHORT: Record<string, string> = { pm25_mean: "PM2.5", pm10_mean: "PM10", no2_mean: "NO₂", so2_mean: "SO₂", o3_max8h: "O₃", co_mean: "CO" };
/** What each pollutant is, for a reader who does not know the formula. */
const PLAIN: Record<string, string> = { pm25_mean: "Debu halus", pm10_mean: "Debu", no2_mean: "Gas kendaraan", so2_mean: "Gas industri", o3_max8h: "Ozon", co_mean: "Karbon monoksida" };
const named = (metric: string) => `${PLAIN[metric]} (${SHORT[metric]})`;

/** A value against its limits, as app/agent/standards.py assess() reads it. */
export function assess(standard: Standard | undefined, value: number): Level | undefined {
  if (!standard) return undefined;
  const band = standard.kategori?.find(item => item.sampai == null || value <= item.sampai);
  if (band) return { kategori: band.nama, tingkat: band.tingkat };
  if (standard.batas != null && value > standard.batas) return { kategori: "Melebihi baku mutu", tingkat: 3 };
  if (standard.pedoman != null) return value > standard.pedoman ? { kategori: "Di atas pedoman WHO", tingkat: 1 } : { kategori: "Di bawah pedoman WHO", tingkat: 0 };
  return undefined;
}

// Heat index (NOAA, in °C) and UV index (WHO) bands: the same words BMKG uses on its forecasts.
const HEAT: [number, Level][] = [[27, { kategori: "Normal", tingkat: 0 }], [32, { kategori: "Waspada", tingkat: 1 }], [41, { kategori: "Sangat waspada", tingkat: 2 }], [54, { kategori: "Bahaya", tingkat: 3 }], [Infinity, { kategori: "Sangat bahaya", tingkat: 4 }]];
const UV: [number, Level][] = [[2, { kategori: "Rendah", tingkat: 0 }], [5, { kategori: "Sedang", tingkat: 1 }], [7, { kategori: "Tinggi", tingkat: 2 }], [10, { kategori: "Sangat tinggi", tingkat: 3 }], [Infinity, { kategori: "Ekstrem", tingkat: 4 }]];
const band = (bands: [number, Level][], value: number) => bands.find(([upTo]) => value < upTo)![1];

const LEVEL_COLOR = ["var(--color-green-500)", "var(--color-yellow-400)", "var(--color-orange-400)", "var(--color-orange-600)", "var(--color-red-600)", "var(--color-purple-700)"];
const Badge = ({ level }: { level?: Level }) => level ? <StatusBadge tone={statusTone(level.tingkat)} className="w-fit">{level.kategori}</StatusBadge> : null;

const withUnit = (value: number, unit?: string | null) => `${formatDecimal(value)}${unit ? ` ${unit}` : ""}`;
const show = (indicator?: Indicator) => indicator ? withUnit(indicator.value, indicator.unit) : "Belum ada";
const labelOf = (ctx: WidgetContext, metric: string, now: Record<string, Indicator>) => now[metric]?.label ?? ctx.metric(metric)?.label ?? prettifyId(metric);
const modelled = (...items: (Indicator | undefined)[]) => items.some(item => item?.is_modelled) ? " Sebagian nilai hasil model, bukan pengukuran langsung." : "";
const toPoints = (points: WeekPoint[] = []) => points.map(point => ({ t: point.period, v: point.value }));

/** Ring gauge in the same shape as the combined score card: value and caption in the middle. */
function Ring({ value, max, color, caption, label }: { value: number; max: number; color: string; caption: string; label: string }) {
  return <div className="relative mx-auto min-h-32 w-full max-w-64 flex-1" role="img" aria-label={`${label} ${formatDecimal(value)} ${caption}`}>
    <ResponsiveContainer width="100%" height="100%">
      <RadialBarChart data={[{ value: Math.min(value, max) }]} startAngle={210} endAngle={-30} innerRadius="74%" outerRadius="100%" barSize={16}>
        <PolarAngleAxis type="number" domain={[0, max]} tick={false} />
        <RadialBar dataKey="value" cornerRadius={10} fill={color} background={{ fill: "var(--color-chart-track)" }} isAnimationActive={false} />
      </RadialBarChart>
    </ResponsiveContainer>
    <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
      <span className="text-display-4-medium text-text-primary tabular-nums">{formatDecimal(value)}</span>
      <span className="text-body-2-regular text-text-secondary">{caption}</span>
    </div>
  </div>;
}

/** A chart body that fills the card; two of them share the card's height. */
const Body = ({ children }: { children: ReactNode }) => <div className="flex min-h-32 flex-1 flex-col gap-2">{children}</div>;

/** The last week of the given metrics, with loading and empty states handled once. */
function Week({ ctx, metrics, children }: { ctx: WidgetContext; metrics: string[]; children: (week: Record<string, WeekPoint[]>) => ReactNode }) {
  const week = useRegionWeek(ctx.view.focus?.id ?? null, metrics);
  if (week === undefined) return <Skeleton className="min-h-32 flex-1 rounded-2lg" />;
  if (week === null) return <PanelUnavailable title="Riwayat gagal dimuat" description="Coba muat ulang halaman." />;
  if (!metrics.some(metric => (week[metric]?.length ?? 0) >= 2))
    return <PanelUnavailable title="Riwayat belum cukup" description={`Garis tampil setelah ada data dua hari atau lebih dalam ${TREND_DAYS} hari terakhir.`} />;
  return <>{children(week)}</>;
}

const weekChart = (points: WeekPoint[] | undefined, label: string, unit?: string | null, variant: "line" | "bar" = "line", color = SERIES[0]) =>
  <TimeSeriesChart points={toPoints(points)} label={label} unit={unit} variant={variant} color={color} height="100%" formatTime={t => day.format(new Date(t))} />;

/**
 * Plain words per panel: what the data is and what is normal, so a reader without the
 * background still gets it. `tech` (sources, standards) goes behind the ⓘ instead.
 */
const GUIDE: Record<string, { about: string; tech: string }> = {
  aq_index: { about: "AQI (indeks kualitas udara) merangkum polusi udara jadi satu angka. Normalnya 0-50 (baik); di atas 100 mulai tidak sehat.",
    tech: "Nilai tertinggi prakiraan 48 jam ke depan, skala US AQI (US EPA), dari model CAMS lewat Open-Meteo." },
  aq_pollutants: { about: "Udara mengandung beberapa jenis polutan. Batang menunjukkan seberapa dekat tiap polutan ke batas aman pemerintah; 100% berarti tepat di batas.",
    tech: "Rata-rata 7 hari dibanding baku mutu udara ambien nasional 24 jam (PP 22/2021); ozon dan CO memakai pedoman WHO 2021 karena tidak punya baku mutu 24 jam. Model CAMS." },
  aq_pm25_week: { about: "PM2.5 adalah debu sangat halus dari asap kendaraan, industri, dan kebakaran yang bisa masuk ke paru-paru. Anjuran WHO di bawah 15, batas pemerintah 55.",
    tech: "Satuan µg/m³, rata-rata 7 hari bergulir per hari, model CAMS (Open-Meteo). Garis putus-putus: pedoman WHO 2021 dan baku mutu PP 22/2021." },
  aq_pollutants_week: { about: "Naik-turun beberapa polutan selama seminggu. Kalau naik bersamaan, biasanya sumbernya sama, misalnya asap kebakaran atau lalu lintas padat.",
    tech: "Satuan µg/m³, rata-rata 7 hari bergulir, model CAMS." },
  aq_outlook: { about: "Kadar debu halus (PM2.5) sekarang dibanding perkiraan puncaknya 2 hari ke depan. Batas aman pemerintah 55.",
    tech: "Sekarang = rata-rata 7 hari; ke depan = nilai tertinggi prakiraan 48 jam (CAMS). Satuan µg/m³." },
  aq_ranking: { about: "", tech: "" },
  fire_smoke_week: { about: "Atas: jumlah titik api yang terlihat satelit. Bawah: debu halus (PM2.5) di udara. Bila keduanya naik bersamaan, asap kebakaran kemungkinan ikut memperburuk udara.",
    tech: "Titik panas NASA FIRMS (jumlah 7 hari bergulir); PM2.5 model CAMS." },
  fire_risk: { about: "Seberapa mudah lahan terbakar di wilayah ini, skala 0-100. Makin tinggi makin mudah terbakar, terutama setelah lama tidak hujan.", tech: "" },
  fire_week: { about: "Jumlah titik api yang terdeteksi satelit. Makin banyak, makin banyak kebakaran yang sedang terjadi.",
    tech: "NASA FIRMS, jumlah 7 hari bergulir per hari." },
  heat_week: { about: "Suhu paling panas tiap hari selama seminggu terakhir.", tech: "" },
  heat_now: { about: "Suhu terasa = panas yang dirasakan tubuh (suhu ditambah kelembapan). Indeks UV 3 ke atas perlu pelindung kulit, 8 ke atas sangat tinggi.",
    tech: "Nilai tertinggi prakiraan 3 hari (Open-Meteo). Kategori suhu terasa menurut NOAA, kategori UV menurut WHO." },
  rain_outlook: { about: "Total hujan sebulan terakhir dibanding perkiraan sebulan ke depan: akan lebih basah atau lebih kering.",
    tech: "Open-Meteo; ke depan = prakiraan 30 hari." },
  water_now: { about: "Debit = banyaknya air sungai yang mengalir tiap detik. Turun terus bisa menandakan kekeringan, naik tajam bisa menandakan banjir.",
    tech: "Debit GloFAS lewat Open-Meteo. Tekanan air bersih = pasokan hujan per orang, indeks model." },
  marine_week: { about: "Tinggi gelombang dan suhu permukaan laut seminggu. Menurut BMKG, gelombang di atas 1,25 m perlu diwaspadai perahu nelayan.",
    tech: "Prakiraan gelombang dan suhu laut Open-Meteo Marine." },
  quake_hazard: { about: "Seberapa rawan wilayah ini terhadap gempa, skala 0-100, dari sejarah gempa 30 tahun terakhir. Makin tinggi makin rawan.", tech: "" },
  solar_week: { about: "Banyaknya sinar matahari yang bisa diubah jadi listrik. Di atas 4 kWh/m² per hari umumnya bagus untuk panel surya.", tech: "" },
  city_services: { about: "Layanan dasar dibanding wilayah lain. Makin panjang batang, makin tertinggal (0 paling baik, 100 paling kurang).", tech: "" },
  profile_attention: { about: "Indikator yang dipilih untuk Anda. Makin panjang batang, makin perlu diperhatikan dibanding wilayah lain (0-100).", tech: "" },
};
// Panels whose source is one metric: its catalogue description is the technical note.
const TECH_METRIC: Record<string, string> = { fire_risk: "fire_risk", heat_week: "temp_max_mean", quake_hazard: "seismic_hazard", solar_week: "solar_ghi" };

const VERDICT = [
  { at: 0, label: "Aman", icon: RiCheckboxCircleFill, color: "text-green-500" },
  { at: 1, label: "Perlu diperhatikan", icon: RiErrorWarningFill, color: "text-amber-400" },
  { at: 3, label: "Waspada", icon: RiAlarmWarningFill, color: "text-red-500" },
];

/**
 * One plain-language conclusion on a neutral inset tile (the same surface as the footer tiles):
 * a small status icon carries the only colour, its word says it without colour, then the sentence.
 */
function Verdict({ tingkat = 0, children }: { tingkat?: number; children: ReactNode }) {
  const status = [...VERDICT].reverse().find(item => tingkat >= item.at)!;
  return <div className={cx(insetClass, "flex items-start gap-2.5 px-3 py-2.5")}>
    <status.icon aria-hidden className={cx("mt-0.5 size-4 shrink-0", status.color)} />
    <p className="text-body-2-regular text-pretty text-text-secondary">
      <span className="text-body-2-medium text-text-primary">{status.label}.</span> {children}
    </p>
  </div>;
}

// US EPA's advice per AQI level, in everyday words.
const AQI_ADVICE = [
  "Udara bersih. Aman untuk beraktivitas di luar.",
  "Masih dapat diterima. Orang yang sangat sensitif sebaiknya tidak terlalu lama di luar.",
  "Anak-anak, lansia, dan penderita asma sebaiknya mengurangi aktivitas berat di luar.",
  "Semua orang sebaiknya mengurangi aktivitas di luar dan memakai masker.",
  "Hindari aktivitas di luar, tutup jendela, dan pakai masker N95 bila harus keluar.",
  "Hindari aktivitas di luar, tutup jendela, dan pakai masker N95 bila harus keluar.",
];

function AqIndex({ title, now, about, info }: PanelProps) {
  const standards = useStandards();
  const aqi = now.aqi_forecast_max;
  if (!aqi) return <PanelUnavailable title={title} description="Indeks kualitas udara belum tersedia untuk wilayah profil." />;
  const standard = standards?.aqi_forecast_max;
  const level = assess(standard, aqi.value);
  const good = standard?.kategori?.[0]?.sampai;
  return <DashboardCard title={title} action={info} value={<span className="flex items-center gap-2">{formatDecimal(aqi.value)}<Badge level={level} /></span>}
    description={about}
    footer={<LegendTiles items={[
      { key: "good", label: "Baik", value: good != null ? `0-${formatDecimal(good)}` : "0-50" },
      { key: "limit", label: "Batas normal", value: standard?.batas != null ? `≤ ${formatDecimal(standard.batas)}` : "≤ 100" },
    ]} />}>
    {level && <Verdict tingkat={level.tingkat}>{AQI_ADVICE[level.tingkat]}</Verdict>}
    <Ring value={aqi.value} max={300} color={LEVEL_COLOR[level?.tingkat ?? 0]} caption="2 hari ke depan" label={title} />
  </DashboardCard>;
}

/** Shorter words for the narrow badge column; the ⓘ names the standards in full. */
const short = (level?: Level) => level && { ...level, kategori: level.kategori.replace("Di bawah pedoman WHO", "Sesuai WHO").replace("Di atas pedoman WHO", "Di atas WHO").replace("Melebihi baku mutu", "Lewat batas") };
const list = (names: string[]) => names.length > 1 ? `${names.slice(0, -1).join(", ")} dan ${names.at(-1)}` : names[0];

function AqPollutants({ title, about, info, now }: PanelProps) {
  const standards = useStandards();
  // Each pollutant as a share of its national limit (WHO guideline when there is none): 100% is the line.
  const items = POLLUTANTS.flatMap(metric => {
    const indicator = now[metric], standard = standards?.[metric];
    const limit = standard?.batas ?? standard?.pedoman;
    return indicator && limit ? [{ key: metric, name: named(metric), value: Math.round(indicator.value / limit * 100),
      status: short(assess(standard, indicator.value)), overWho: standard?.pedoman != null && indicator.value > standard.pedoman }] : [];
  }).sort((a, b) => b.value - a.value);
  if (standards === undefined) return <DashboardCard title={title}><Skeleton className="min-h-32 flex-1 rounded-2lg" /></DashboardCard>;
  if (!items.length) return <DashboardCard title={title}><PanelUnavailable title="Belum ada pembanding" description="Batas aman atau nilai polutan wilayah ini belum tersedia." /></DashboardCard>;
  const over = items.filter(item => item.value > 100).map(item => PLAIN[item.key].toLowerCase());
  const overWho = items.filter(item => item.overWho && item.value <= 100).map(item => PLAIN[item.key].toLowerCase());
  // Under the government limit is not the same as clean: the WHO guideline is stricter, so say so.
  return <DashboardCard title={title} action={info} value={over.length ? `${over.length} melewati batas aman` : "Di bawah batas aman"} description={about}>
    <Verdict tingkat={over.length ? 3 : overWho.length ? 1 : 0}>
      {over.length ? `${list(over)} melewati batas aman pemerintah.`
        : overWho.length ? `Semua di bawah batas pemerintah, tapi ${list(overWho)} masih di atas anjuran WHO yang lebih ketat.`
        : "Semua polutan di bawah batas aman."}
    </Verdict>
    <ThresholdBars items={items} unit="%" limits={[{ value: 100, label: "Batas aman" }]} label={title} />
  </DashboardCard>;
}

function pm25Verdict(value: number, standard?: Standard) {
  const who = standard?.pedoman ?? 15, limit = standard?.batas ?? 55;
  return value <= who ? { tingkat: 0, text: `Di bawah anjuran WHO (${who}): udara bersih dari debu halus.` }
    : value <= limit ? { tingkat: 1, text: `Di atas anjuran WHO (${who}), tapi masih di bawah batas pemerintah (${limit}).` }
    : { tingkat: 3, text: `Melewati batas aman pemerintah (${limit}). Kurangi aktivitas di luar dan pakai masker.` };
}

function AqPm25Week({ ctx, title, now, about, info }: PanelProps) {
  const standards = useStandards();
  const pm = now.pm25_mean, standard = standards?.pm25_mean;
  const limits = [standard?.pedoman != null && { value: standard.pedoman, label: "Anjuran WHO" }, standard?.batas != null && { value: standard.batas, label: "Batas pemerintah" }].filter(Boolean) as { value: number; label: string }[];
  return <DashboardCard title={title} action={info} value={show(pm)} description={about}>
    <Week ctx={ctx} metrics={["pm25_mean"]}>{week => {
      const points = week.pm25_mean ?? [];
      const last = points[points.length - 1], verdict = last && pm25Verdict(last.value, standard);
      const trend = points.length >= 2 ? trendDelta(points[0].value, last.value, "high_bad").label.toLowerCase() : undefined;
      return <div className="flex min-h-32 flex-1 flex-col gap-2">
        {verdict && <Verdict tingkat={verdict.tingkat}>{verdict.text}{trend ? ` Seminggu ini ${trend}.` : ""}</Verdict>}
        <HistoryChart label={title} unit="µg/m³" limits={limits} height={180}
          series={[{ key: "pm25", name: "Debu halus (PM2.5)", color: SERIES[0], points: toPoints(points) }]} />
      </div>;
    }}</Week>
  </DashboardCard>;
}

function AqPollutantsWeek({ ctx, title, about, info }: PanelProps) {
  const metrics = ["pm25_mean", "pm10_mean", "no2_mean", "so2_mean"];
  return <DashboardCard title={title} action={info} description={about}>
    <Week ctx={ctx} metrics={metrics}>{week => {
      const series = metrics.filter(metric => week[metric]?.length).map((metric, index) => ({ key: metric, name: named(metric), color: SERIES[index], points: toPoints(week[metric]) }));
      return <Body>
        <SeriesLegend items={series} />
        <HistoryChart label={title} unit="µg/m³" series={series} height={180} />
      </Body>;
    }}</Week>
  </DashboardCard>;
}

function AqOutlook({ title, now, about, info }: PanelProps) {
  const standards = useStandards();
  const current = now.pm25_mean, ahead = now.pm25_forecast_max, limit = standards?.pm25_mean?.batas ?? 55;
  const data = [current && { label: "Sekarang", value: current.value }, ahead && { label: "Puncak 2 hari ke depan", value: ahead.value }].filter(Boolean) as { label: string; value: number }[];
  const rising = current && ahead ? ahead.value > current.value : undefined;
  const verdict = !ahead ? undefined : ahead.value > limit ? { tingkat: 3, text: "Diperkirakan melewati batas aman dalam 2 hari ke depan. Siapkan masker bila harus keluar." }
    : rising ? { tingkat: 1, text: "Diperkirakan memburuk dalam 2 hari ke depan, tapi masih di bawah batas aman." }
    : { tingkat: 0, text: "Diperkirakan tetap atau membaik dalam 2 hari ke depan." };
  return <DashboardCard title={title} action={info} value={ahead ? show(ahead) : show(current)} description={about}>
    {verdict && <Verdict tingkat={verdict.tingkat}>{verdict.text}</Verdict>}
    <CategoryBarChart data={data} unit="µg/m³" label={title} domain={[0, Math.max(limit, ...data.map(item => item.value))]} />
  </DashboardCard>;
}

const change = (points: WeekPoint[] = []) => points.length >= 2 ? points[points.length - 1].value - points[0].value : 0;

function FireSmokeWeek({ ctx, title, about, info }: PanelProps) {
  return <DashboardCard title={title} action={info} description={about}>
    <Week ctx={ctx} metrics={["hotspot_count_7d", "pm25_mean"]}>{week => {
      const fire = change(week.hotspot_count_7d), smoke = change(week.pm25_mean);
      return <Body>
        <Verdict tingkat={fire > 0 && smoke > 0 ? 2 : fire > 0 ? 1 : 0}>
          {fire > 0 && smoke > 0 ? "Titik api dan debu halus sama-sama naik minggu ini: asap kebakaran kemungkinan ikut memperburuk udara."
            : fire > 0 ? "Titik api bertambah minggu ini, tapi udara belum ikut memburuk."
            : smoke > 0 ? "Debu halus naik minggu ini, tapi bukan karena titik api bertambah; sumbernya kemungkinan lain."
            : "Titik api tidak bertambah minggu ini."}
        </Verdict>
        <div className="min-h-20 flex-1">{weekChart(week.hotspot_count_7d, "Titik api", "titik", "bar", "var(--color-orange-500)")}</div>
        <div className="min-h-20 flex-1">{weekChart(week.pm25_mean, "Debu halus (PM2.5)", "µg/m³", "line", SERIES[0])}</div>
      </Body>;
    }}</Week>
  </DashboardCard>;
}

function GaugePanel({ title, value, about, info, stats }: { title: string; value?: Indicator; about: string; info: ReactNode; stats: { label: string; value: string }[] }) {
  if (!value) return <DashboardCard title={title}><PanelUnavailable title="Belum ada data" description="Indeks ini belum tersedia untuk wilayah profil." /></DashboardCard>;
  const level = Math.min(5, Math.floor(value.value / 20));
  return <DashboardCard title={title} action={info} description={about} footer={<LegendTiles items={stats.map(stat => ({ key: stat.label, ...stat }))} />}>
    <Ring value={value.value} max={100} color={LEVEL_COLOR[level]} caption="dari 100" label={title} />
  </DashboardCard>;
}

const weekPanel = (metric: string, variant: "line" | "bar" = "line", color?: string) => function WeekPanel({ ctx, title, now, about, info }: PanelProps) {
  const indicator = now[metric];
  return <DashboardCard title={title} action={info} value={show(indicator)} description={about}>
    <Week ctx={ctx} metrics={[metric]}>{week => {
      const points = week[metric] ?? [];
      return <Body>
        {points.length >= 2 && <span className="text-caption-1 text-text-secondary">
          {trendDelta(points[0].value, points[points.length - 1].value, ctx.metric(metric)?.polarity).label} sejak {day.format(new Date(points[0].period))}
        </span>}
        <div className="min-h-24 flex-1">{weekChart(points, labelOf(ctx, metric, now), indicator?.unit, variant, color)}</div>
      </Body>;
    }}</Week>
  </DashboardCard>;
};

function HeatNow({ title, now, about, info }: PanelProps) {
  const heat = now.heat_index_max, uv = now.uv_index_max, wet = now.wet_bulb_max;
  return <DashboardCard title={title} action={info} description={about}>
    <StatGrid items={[
      { label: "Suhu terasa", value: show(heat), hint: heat && <Badge level={band(HEAT, heat.value)} /> },
      { label: "Indeks UV", value: show(uv), hint: uv && <Badge level={band(UV, uv.value)} /> },
      { label: "Panas lembap", value: show(wet), hint: wet && (wet.value >= 31 ? "Berbahaya untuk kerja berat" : "Di bawah 31 °C, aman") },
    ]} />
  </DashboardCard>;
}

function RainOutlook({ title, now, about, info }: PanelProps) {
  const past = now.rain_30d, ahead = now.rain_forecast_30d;
  const data = [past && { label: "Sebulan terakhir", value: past.value }, ahead && { label: "Sebulan ke depan", value: ahead.value }].filter(Boolean) as { label: string; value: number }[];
  const wetter = past && ahead ? ahead.value > past.value : undefined;
  return <DashboardCard title={title} action={info} value={show(ahead ?? past)} delta={wetter === undefined ? undefined : { label: wetter ? "Lebih basah" : "Lebih kering", color: "neutral" }}
    description={about}>
    <CategoryBarChart data={data} unit="mm" label={title} />
  </DashboardCard>;
}

function WaterNow({ ctx, title, now, about, info }: PanelProps) {
  const stress = now.water_stress;
  return <DashboardCard title={title} action={info} value={show(now.river_discharge)} description={`${about}${stress ? ` Tekanan air bersih ${formatDecimal(stress.value)} dari 100.` : ""}`}>
    <Week ctx={ctx} metrics={["river_discharge"]}>{week => <div className="min-h-24 flex-1">{weekChart(week.river_discharge, "Debit sungai", "m³/detik")}</div>}</Week>
  </DashboardCard>;
}

function MarineWeek({ ctx, title, about, info }: PanelProps) {
  return <DashboardCard title={title} action={info} description={about}>
    <Week ctx={ctx} metrics={["wave_height_max", "sea_surface_temp"]}>{week => <Body>
      <div className="min-h-20 flex-1">{weekChart(week.wave_height_max, "Gelombang", "m", "line", SERIES[0])}</div>
      <div className="min-h-20 flex-1">{weekChart(week.sea_surface_temp, "Suhu laut", "°C", "line", SERIES[2])}</div>
    </Body>}</Week>
  </DashboardCard>;
}

function SolarWeek({ ctx, title, now, about, info }: PanelProps) {
  return <DashboardCard title={title} action={info} value={show(now.solar_ghi)} description={`${about}${now.solar_rooftop_mwp ? ` Potensi panel surya di atap: ${show(now.solar_rooftop_mwp)}.` : ""}`}>
    <Week ctx={ctx} metrics={["solar_ghi"]}>{week => <div className="min-h-24 flex-1">{weekChart(week.solar_ghi, "Sinar matahari", "kWh/m²/hari", "line", SERIES[3])}</div>}</Week>
  </DashboardCard>;
}

/** 0-100 attention bars (100 = most in need of attention against other regions) for the given indicators. */
function AttentionBars({ title, about, info, indicators }: { title: string; about: string; info: ReactNode; indicators: Indicator[] }) {
  if (!indicators.length) return <DashboardCard title={title}><PanelUnavailable title="Belum ada data" description="Indikator ini belum tersedia untuk wilayah profil." /></DashboardCard>;
  const data = indicators.map(item => ({ label: item.label, value: Math.round(item.normalised), note: withUnit(item.value, item.unit) })).sort((a, b) => b.value - a.value);
  return <DashboardCard title={title} action={info} description={about}>
    <CategoryBarChart data={data} label={title} domain={[0, 100]} />
  </DashboardCard>;
}

const CITY = ["health_facilities_per_10k", "schools_per_10k", "transit_stop_density", "road_density"];

const RENDERERS: Record<string, (props: PanelProps) => ReactNode> = {
  aq_index: AqIndex,
  aq_pollutants: AqPollutants,
  aq_pm25_week: AqPm25Week,
  aq_pollutants_week: AqPollutantsWeek,
  aq_outlook: AqOutlook,
  aq_ranking: ({ ctx, title }) => <MetricRankingWidget metric="pm25_mean" ctx={ctx} title={title} />,
  fire_smoke_week: FireSmokeWeek,
  fire_risk: ({ title, now, about, info }) => <GaugePanel title={title} value={now.fire_risk} about={about} info={info}
    stats={[{ label: "Hari tanpa hujan", value: show(now.dry_days) }, { label: "Titik api 7 hari", value: show(now.hotspot_count_7d) }]} />,
  fire_week: weekPanel("hotspot_count_7d", "bar", "var(--color-orange-500)"),
  heat_week: weekPanel("temp_max_mean", "line", SERIES[1]),
  heat_now: HeatNow,
  rain_outlook: RainOutlook,
  water_now: WaterNow,
  marine_week: MarineWeek,
  quake_hazard: ({ title, now, about, info }) => <GaugePanel title={title} value={now.seismic_hazard} about={about} info={info}
    stats={[{ label: "Gempa 30 tahun", value: show(now.quake_count_30y) }, { label: "Paling kuat", value: show(now.quake_max_mag_30y) }]} />,
  solar_week: SolarWeek,
  city_services: ({ title, now, about, info }) => <AttentionBars title={title} about={about} info={info} indicators={CITY.flatMap(metric => now[metric] ? [now[metric]] : [])} />,
  profile_attention: ({ ctx, title, about, info }) => <AttentionBars title={title} about={about} info={info} indicators={ctx.region?.indicators ?? []} />,
};

/** One catalogue panel for the profile's region. */
export function PanelWidget({ id, ctx, title }: { id?: string; ctx: WidgetContext; title: string }) {
  const summary = useRegionSummary(ctx.view.focus?.id ?? null);
  const Render = id ? RENDERERS[id] : undefined;
  if (!Render) return <PanelUnavailable title={title} description="Panel ini tidak dikenal; hapus dari Atur Tampilan." />;
  if (!ctx.view.focus) return <PanelUnavailable title={title} description="Panel membaca satu wilayah; profil ini memantau seluruh Indonesia." />;
  if (summary === undefined) return <Skeleton className="h-full rounded-2xl" />;
  const now = Object.fromEntries((summary?.indicators ?? []).map(item => [item.metric, item]));
  const guide = GUIDE[id!] ?? { about: "", tech: "" };
  const reason = ctx.view.panels?.find(panel => panel.id === id)?.reason;
  const source = TECH_METRIC[id!];
  const tech = [guide.tech, source && ctx.metric(source)?.description, modelled(...Object.values(now))].filter(Boolean).join(" ");
  const hint = [reason && `Kenapa ditampilkan untuk Anda: ${reason}`, tech].filter(Boolean).join(" ");
  const info = hint ? <StatHint label={title} hint={hint} /> : undefined;
  // Rendered as a component (not called), so each panel keeps its own hooks.
  return <Render ctx={ctx} title={title} now={now} about={guide.about} info={info} />;
}
