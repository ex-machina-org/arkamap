import type { ReactNode } from "react";
import { CategoryBarChart } from "@/components/application/data-viz/category-bar-chart";
import { SERIES, statusTone } from "@/components/application/data-viz/format";
import { HistoryChart, SeriesLegend, StatGrid } from "@/components/application/data-viz/history-chart";
import { ThresholdBars } from "@/components/application/data-viz/threshold-bars";
import { TimeSeriesChart } from "@/components/application/data-viz/time-series-chart";
import { PolarAngleAxis, RadialBar, RadialBarChart, ResponsiveContainer } from "recharts";
import { Skeleton } from "@/components/ui/skeleton";
import { StatusBadge } from "@/components/ui/status-badge";
import type { DTO } from "@/lib/api/client";
import { formatDecimal } from "../format";
import { prettifyId } from "../labels";
import { TREND_DAYS, useRegionSummary, useRegionWeek, useStandards, type WeekPoint } from "../use-region-data";
import { day, MetricRankingWidget, trendDelta } from "./configurable-widgets";
import { DashboardCard, LegendTiles, PanelUnavailable } from "./dashboard-card";
import type { WidgetContext } from "./widget-renderer";

/*
 * The dashboard panels of app/panels.py: one fixed shape each, filled with the profile's
 * region. The AI picks which ones a profile starts with; the gallery offers all of them.
 */

type Indicator = DTO<"IndicatorValue">;
type Standard = DTO<"AirStandard">;
type Level = { kategori: string; tingkat: number };
type PanelProps = { ctx: WidgetContext; title: string; now: Record<string, Indicator> };

const POLLUTANTS = ["pm25_mean", "pm10_mean", "no2_mean", "so2_mean", "o3_max8h", "co_mean"];
const SHORT: Record<string, string> = { pm25_mean: "PM2.5", pm10_mean: "PM10", no2_mean: "NO₂", so2_mean: "SO₂", o3_max8h: "O₃", co_mean: "CO" };

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
const modelled = (...items: (Indicator | undefined)[]) => items.some(item => item?.is_modelled) ? " · nilai model" : "";
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

function AqIndex({ title, now }: PanelProps) {
  const standards = useStandards();
  const aqi = now.aqi_forecast_max;
  if (!aqi) return <PanelUnavailable title={title} description="Indeks kualitas udara belum tersedia untuk wilayah profil." />;
  const standard = standards?.aqi_forecast_max;
  const level = assess(standard, aqi.value);
  const good = standard?.kategori?.[0]?.sampai;
  return <DashboardCard title={title} value={<span className="flex items-center gap-2">{formatDecimal(aqi.value)}<Badge level={level} /></span>}
    description={`Prakiraan tertinggi 48 jam, US AQI${modelled(aqi)}`}
    footer={<LegendTiles items={[
      { key: "now", label: "Sekarang", value: level?.kategori ?? formatDecimal(aqi.value) },
      { key: "good", label: "Baik", value: good != null ? `≤ ${formatDecimal(good)}` : "≤ 50" },
      { key: "limit", label: "Batas normal", value: standard?.batas != null ? `≤ ${formatDecimal(standard.batas)}` : "≤ 100" },
    ]} />}>
    <Ring value={aqi.value} max={300} color={LEVEL_COLOR[level?.tingkat ?? 0]} caption="US AQI, skala 0-300" label={title} />
  </DashboardCard>;
}

function AqPollutants({ title, now }: PanelProps) {
  const standards = useStandards();
  // Each pollutant as a share of its national limit (WHO guideline when there is none): 100% is the line.
  const items = POLLUTANTS.flatMap(metric => {
    const indicator = now[metric], standard = standards?.[metric];
    const limit = standard?.batas ?? standard?.pedoman;
    return indicator && limit ? [{ key: metric, name: `${SHORT[metric]} (${withUnit(indicator.value, indicator.unit)})`, value: Math.round(indicator.value / limit * 100),
      status: assess(standard, indicator.value), overWho: standard?.pedoman != null && indicator.value > standard.pedoman }] : [];
  }).sort((a, b) => b.value - a.value);
  if (standards === undefined) return <DashboardCard title={title}><Skeleton className="min-h-32 flex-1 rounded-2lg" /></DashboardCard>;
  if (!items.length) return <DashboardCard title={title}><PanelUnavailable title="Belum ada pembanding" description="Baku mutu atau nilai polutan wilayah ini belum tersedia." /></DashboardCard>;
  const over = items.filter(item => item.value > 100).length;
  const overWho = items.filter(item => item.overWho).map(item => SHORT[item.key]);
  // Under the national limit is not the same as clean: the WHO guideline is stricter, so say so.
  return <DashboardCard title={title} value={over ? `${over} melewati baku mutu` : "Di bawah baku mutu"}
    delta={over ? { label: "Perlu perhatian", color: "rose" } : overWho.length ? { label: `Di atas WHO: ${overWho.join(", ")}`, color: "yellow" } : { label: "Sesuai pedoman WHO", color: "lime" }}
    description="Persen baku mutu nasional 24 jam (PP 22/2021); pedoman WHO bila tidak ada baku mutu">
    <ThresholdBars items={items} unit="%" limits={[{ value: 100, label: "Batas" }]} label={title} />
  </DashboardCard>;
}

function AqPm25Week({ ctx, title, now }: PanelProps) {
  const standards = useStandards();
  const pm = now.pm25_mean, standard = standards?.pm25_mean;
  const limits = [standard?.pedoman != null && { value: standard.pedoman, label: "WHO" }, standard?.batas != null && { value: standard.batas, label: "Baku mutu" }].filter(Boolean) as { value: number; label: string }[];
  return <DashboardCard title={title} value={show(pm)} description={`${ctx.view.focus?.name}: rata-rata 7 hari bergulir${modelled(pm)}`}>
    <Week ctx={ctx} metrics={["pm25_mean"]}>{week => {
      const points = week.pm25_mean ?? [];
      return <div className="flex min-h-32 flex-1 flex-col gap-2">
        {points.length >= 2 && <Badge level={assess(standard, points[points.length - 1].value)} />}
        <HistoryChart label={title} unit="µg/m³" limits={limits} height={180}
          series={[{ key: "pm25", name: "PM2.5", color: SERIES[0], points: toPoints(points) }]} />
      </div>;
    }}</Week>
  </DashboardCard>;
}

function AqPollutantsWeek({ ctx, title }: PanelProps) {
  const metrics = ["pm25_mean", "pm10_mean", "no2_mean", "so2_mean"];
  return <DashboardCard title={title} description="µg/m³ per hari; polutan yang naik bersamaan biasanya dari sumber yang sama">
    <Week ctx={ctx} metrics={metrics}>{week => {
      const series = metrics.filter(metric => week[metric]?.length).map((metric, index) => ({ key: metric, name: SHORT[metric], color: SERIES[index], points: toPoints(week[metric]) }));
      return <Body>
        <SeriesLegend items={series} />
        <HistoryChart label={title} unit="µg/m³" series={series} height={180} />
      </Body>;
    }}</Week>
  </DashboardCard>;
}

function AqOutlook({ title, now }: PanelProps) {
  const standards = useStandards();
  const current = now.pm25_mean, ahead = now.pm25_forecast_max, limit = standards?.pm25_mean?.batas;
  const data = [current && { label: "Sekarang (7 hari)", value: current.value }, ahead && { label: "Tertinggi 48 jam", value: ahead.value }].filter(Boolean) as { label: string; value: number }[];
  const rising = current && ahead ? ahead.value > current.value : undefined;
  return <DashboardCard title={title} value={ahead ? show(ahead) : show(current)}
    delta={rising === undefined ? undefined : { label: rising ? "Akan memburuk" : "Membaik", color: rising ? "rose" : "lime" }}
    description={`PM2.5${limit != null ? `, baku mutu ${formatDecimal(limit)} µg/m³` : ""}${modelled(current, ahead)}`}>
    <CategoryBarChart data={data} unit="µg/m³" label={title} domain={limit != null ? [0, Math.max(limit, ...data.map(item => item.value))] : undefined} />
  </DashboardCard>;
}

function FireSmokeWeek({ ctx, title }: PanelProps) {
  return <DashboardCard title={title} description="Batang: titik panas 7 hari bergulir. Garis: PM2.5. Asap yang naik setelah api menandakan kebakaran sebagai sumbernya.">
    <Week ctx={ctx} metrics={["hotspot_count_7d", "pm25_mean"]}>{week => <Body>
      <div className="min-h-20 flex-1">{weekChart(week.hotspot_count_7d, "Titik panas", "titik", "bar", "var(--color-orange-500)")}</div>
      <div className="min-h-20 flex-1">{weekChart(week.pm25_mean, "PM2.5", "µg/m³", "line", SERIES[0])}</div>
    </Body>}</Week>
  </DashboardCard>;
}

function GaugePanel({ title, value, description, stats }: { title: string; value?: Indicator; description: string; stats: { label: string; value: string }[] }) {
  if (!value) return <DashboardCard title={title}><PanelUnavailable title="Belum ada data" description="Indeks ini belum tersedia untuk wilayah profil." /></DashboardCard>;
  const level = Math.min(5, Math.floor(value.value / 20));
  return <DashboardCard title={title} description={`${description}${modelled(value)}`} footer={<LegendTiles items={stats.map(stat => ({ key: stat.label, ...stat }))} />}>
    <Ring value={value.value} max={100} color={LEVEL_COLOR[level]} caption="dari 100, makin tinggi makin rawan" label={title} />
  </DashboardCard>;
}

const weekPanel = (metric: string, variant: "line" | "bar" = "line", color?: string) => function WeekPanel({ ctx, title, now }: PanelProps) {
  const indicator = now[metric];
  return <DashboardCard title={title} value={show(indicator)} description={`${ctx.view.focus?.name}, ${labelOf(ctx, metric, now).toLowerCase()}${modelled(indicator)}`}>
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

function HeatNow({ ctx, title, now }: PanelProps) {
  const heat = now.heat_index_max, uv = now.uv_index_max, wet = now.wet_bulb_max;
  return <DashboardCard title={title} description={`Tertinggi 3 hari ke depan${modelled(heat, uv, wet)}`}>
    <StatGrid items={[
      { label: labelOf(ctx, "heat_index_max", now), value: show(heat), hint: heat && <Badge level={band(HEAT, heat.value)} /> },
      { label: "Indeks UV", value: show(uv), hint: uv && <Badge level={band(UV, uv.value)} /> },
      { label: "Wet-bulb", value: show(wet), hint: wet && (wet.value >= 31 ? "Berbahaya untuk kerja berat" : "Di bawah 31 °C") },
    ]} />
  </DashboardCard>;
}

function RainOutlook({ title, now }: PanelProps) {
  const past = now.rain_30d, ahead = now.rain_forecast_30d;
  const data = [past && { label: "30 hari terakhir", value: past.value }, ahead && { label: "30 hari ke depan", value: ahead.value }].filter(Boolean) as { label: string; value: number }[];
  const wetter = past && ahead ? ahead.value > past.value : undefined;
  return <DashboardCard title={title} value={show(ahead ?? past)} delta={wetter === undefined ? undefined : { label: wetter ? "Lebih basah" : "Lebih kering", color: "neutral" }}
    description={`Curah hujan total${modelled(past, ahead)}`}>
    <CategoryBarChart data={data} unit="mm" label={title} />
  </DashboardCard>;
}

function WaterNow({ ctx, title, now }: PanelProps) {
  const stress = now.water_stress;
  return <DashboardCard title={title} value={show(now.river_discharge)} description={`Debit sungai 7 hari${stress ? `; tekanan air bersih ${formatDecimal(stress.value)}/100` : ""}${modelled(now.river_discharge, stress)}`}>
    <Week ctx={ctx} metrics={["river_discharge"]}>{week => <div className="min-h-24 flex-1">{weekChart(week.river_discharge, "Debit sungai", "m³/detik")}</div>}</Week>
  </DashboardCard>;
}

function MarineWeek({ ctx, title }: PanelProps) {
  return <DashboardCard title={title} description="Atas: gelombang tertinggi (m). Bawah: suhu permukaan laut (°C).">
    <Week ctx={ctx} metrics={["wave_height_max", "sea_surface_temp"]}>{week => <Body>
      <div className="min-h-20 flex-1">{weekChart(week.wave_height_max, "Gelombang", "m", "line", SERIES[0])}</div>
      <div className="min-h-20 flex-1">{weekChart(week.sea_surface_temp, "Suhu laut", "°C", "line", SERIES[2])}</div>
    </Body>}</Week>
  </DashboardCard>;
}

function SolarWeek({ ctx, title, now }: PanelProps) {
  return <DashboardCard title={title} value={show(now.solar_ghi)} description={`Rata-rata 30 hari${now.solar_rooftop_mwp ? `; potensi PLTS atap ${show(now.solar_rooftop_mwp)}` : ""}${modelled(now.solar_ghi)}`}>
    <Week ctx={ctx} metrics={["solar_ghi"]}>{week => <div className="min-h-24 flex-1">{weekChart(week.solar_ghi, "Iradiasi", "kWh/m²/hari", "line", SERIES[3])}</div>}</Week>
  </DashboardCard>;
}

/** 0-100 attention bars (100 = most in need of attention against other regions) for the given indicators. */
function AttentionBars({ title, description, indicators }: { title: string; description: string; indicators: Indicator[] }) {
  if (!indicators.length) return <DashboardCard title={title}><PanelUnavailable title="Belum ada data" description="Indikator ini belum tersedia untuk wilayah profil." /></DashboardCard>;
  const data = indicators.map(item => ({ label: item.label, value: Math.round(item.normalised), note: withUnit(item.value, item.unit) })).sort((a, b) => b.value - a.value);
  return <DashboardCard title={title} description={description}>
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
  fire_risk: ({ title, now }) => <GaugePanel title={title} value={now.fire_risk} description="Indeks rawan kebakaran"
    stats={[{ label: "Hari kering", value: show(now.dry_days) }, { label: "Titik panas 7 hari", value: show(now.hotspot_count_7d) }]} />,
  fire_week: weekPanel("hotspot_count_7d", "bar", "var(--color-orange-500)"),
  heat_week: weekPanel("temp_max_mean", "line", SERIES[1]),
  heat_now: HeatNow,
  rain_outlook: RainOutlook,
  water_now: WaterNow,
  marine_week: MarineWeek,
  quake_hazard: ({ title, now }) => <GaugePanel title={title} value={now.seismic_hazard} description="Kerawanan gempa"
    stats={[{ label: "Gempa 30 tahun", value: show(now.quake_count_30y) }, { label: "Terkuat", value: show(now.quake_max_mag_30y) }]} />,
  solar_week: SolarWeek,
  city_services: ({ title, now }) => <AttentionBars title={title} indicators={CITY.flatMap(metric => now[metric] ? [now[metric]] : [])}
    description="Tingkat perhatian 0-100 dibanding wilayah lain; makin panjang makin tertinggal" />,
  profile_attention: ({ ctx, title }) => <AttentionBars title={title} indicators={ctx.region?.indicators ?? []}
    description="Indikator pilihan profil; 100 paling perlu perhatian dibanding wilayah lain" />,
};

/** One catalogue panel for the profile's region. */
export function PanelWidget({ id, ctx, title }: { id?: string; ctx: WidgetContext; title: string }) {
  const summary = useRegionSummary(ctx.view.focus?.id ?? null);
  const Render = id ? RENDERERS[id] : undefined;
  if (!Render) return <PanelUnavailable title={title} description="Panel ini tidak dikenal; hapus dari Atur Tampilan." />;
  if (!ctx.view.focus) return <PanelUnavailable title={title} description="Panel membaca satu wilayah; profil ini memantau seluruh Indonesia." />;
  if (summary === undefined) return <Skeleton className="h-full rounded-2xl" />;
  const now = Object.fromEntries((summary?.indicators ?? []).map(item => [item.metric, item]));
  // Rendered as a component (not called), so each panel keeps its own hooks.
  return <Render ctx={ctx} title={title} now={now} />;
}
