/**
 * From regional indicators to "where to act first, and what to do": the layer between raw
 * numbers and a decision. It covers fire and smoke, the two hazards the indicator table
 * carries enough data to judge today.
 *
 * Smoke categories follow Permen LHK 14/2020 (Lampiran I, PM2.5 24-hour conversion, and
 * Lampiran II for the advice). Fire tiers are working thresholds on 7-day hotspot density:
 * they are not an official standard and have not been calibrated against real incidents.
 */

/** Indicators the fire and smoke assessment reads from `/indicators`. */
export const DECISION_METRICS = ["hotspot_count_7d", "hotspot_frp_max", "dry_days", "rain_forecast_30d", "pm25_mean", "pm25_forecast_max"] as const;

/** Fields whose work is fire or air quality; every other field keeps the plain ranking. */
export const FIRE_SMOKE_FIELDS: ReadonlySet<string> = new Set(["pemadam", "kesehatan", "lingkungan", "umum"]);

export type PriorityLevel = "siaga" | "waspada";

/** One hazard measured against its own scale, so the UI can draw where it sits instead of describing it. */
export interface PrioritySignal {
  kind: "smoke" | "fire";
  label: string;
  value: string;
  unit: string;
  /** Index into `steps` the value falls in. */
  step: number;
  steps: readonly string[];
  /** A second figure for the same hazard, e.g. the forecast peak or the density behind the step. */
  note?: string;
}

/** Conditions that shape the hazard without being one: dry spell, coming rain, fire intensity. */
export interface PriorityContext {
  kind: "dry" | "rain" | "frp";
  label: string;
  value: string;
}

export interface Priority {
  regionId: string;
  name: string;
  level: PriorityLevel;
  population: number | null;
  /** One sentence per finding, for the assistant and screen readers. */
  reasons: string[];
  /** The same findings as data, for meters. */
  signals: PrioritySignal[];
  context: PriorityContext[];
  /** Label and value pairs, for the region card. */
  facts: [string, string][];
  /** What to do, most specific first. */
  advice: string[];
  /** 1-based place in the priority list. */
  position: number;
  outOf: number;
}

export interface PrioritySummary {
  items: Priority[];
  /** Regions over a threshold, including those past the visible list. */
  total: number;
  /** `total` split by level. */
  levels: Record<PriorityLevel, number>;
}

type IspuCategory = "baik" | "sedang" | "tidak sehat" | "sangat tidak sehat" | "berbahaya";

const CATEGORIES: IspuCategory[] = ["baik", "sedang", "tidak sehat", "sangat tidak sehat", "berbahaya"];

/** Display names of the ISPU categories, in order. */
export const ISPU_STEPS = ["Baik", "Sedang", "Tidak sehat", "Sangat tidak sehat", "Berbahaya"] as const;
/** Display names of the fire tiers below, in order. */
export const FIRE_STEPS = ["Rendah", "Sedang", "Tinggi", "Sangat tinggi"] as const;

/** ISPU value and PM2.5 concentration (ug/m3, 24 h) at the top of each band, Permen LHK 14/2020 Lampiran I. */
const PM25_BANDS: { ispu: number; ug: number }[] = [
  { ispu: 50, ug: 15.5 },
  { ispu: 100, ug: 55.4 },
  { ispu: 200, ug: 150.4 },
  { ispu: 300, ug: 250.4 },
  { ispu: 500, ug: 500 },
];

/** The regulation's linear interpolation between band edges, capped at its 500 ceiling. */
export function pm25ToIspu(ug: number): number {
  let lowerIspu = 0;
  let lowerUg = 0;
  for (const band of PM25_BANDS) {
    if (ug <= band.ug) return ((band.ispu - lowerIspu) / (band.ug - lowerUg)) * (ug - lowerUg) + lowerIspu;
    lowerIspu = band.ispu;
    lowerUg = band.ug;
  }
  return 500;
}

/** Index into CATEGORIES (0 baik ... 4 berbahaya). */
function categoryOf(ug: number): number {
  const ispu = pm25ToIspu(ug);
  return ispu <= 50 ? 0 : ispu <= 100 ? 1 : ispu <= 200 ? 2 : ispu <= 300 ? 3 : 4;
}

/**
 * Working thresholds on hotspot detections per 10,000 km2 over 7 days. A raw count would rank a
 * large province above a burning small one. The top tier sits at the 600 per 10,000 km2 the
 * backend's own fire index treats as "the busiest province in a bad fire week"; the count floor
 * keeps one detection in a tiny city from reading as an emergency.
 */
function fireTier(hotspots: number, areaKm2: number | null): number {
  if (hotspots < 20 || areaKm2 == null || areaKm2 <= 0) return 0;
  const density = (hotspots / areaKm2) * 10_000;
  return density >= 600 && hotspots >= 50 ? 3 : density >= 200 ? 2 : density >= 50 ? 1 : 0;
}

/** 0 to 1, for ordering inside a level: detection density on a log scale against 1,500 per 10,000 km2. */
function fireWeight(hotspots: number, areaKm2: number | null): number {
  if (areaKm2 == null || areaKm2 <= 0) return 0;
  return Math.min(1, Math.log10(1 + (hotspots / areaKm2) * 10_000) / Math.log10(1 + 1500));
}

/** Lampiran II, "apa yang harus dilakukan", by category index. */
const SMOKE_ADVICE: Record<number, string> = {
  2: "Kelompok sensitif boleh beraktivitas di luar, tetapi lebih sering beristirahat dan memilih aktivitas ringan; amati batuk atau sesak napas. Setiap orang mengurangi aktivitas fisik yang lama di luar ruangan.",
  3: "Kelompok sensitif menghindari semua aktivitas di luar; perbanyak aktivitas di dalam ruangan atau jadwalkan ulang. Setiap orang menghindari aktivitas fisik yang lama di luar ruangan.",
  4: "Kelompok sensitif tetap di dalam ruangan dan hanya sedikit beraktivitas. Setiap orang menghindari semua aktivitas di luar.",
};

const FIRE_ADVICE = "Siagakan regu dan peralatan, pantau titik api setiap hari, dan periksa hari kering serta prakiraan hujan sebelum menetapkan status siaga.";

const integer = new Intl.NumberFormat("id-ID");
const decimal = new Intl.NumberFormat("id-ID", { maximumFractionDigits: 1 });

const num = (row: Record<string, unknown>, key: string) => {
  const value = row[key];
  return typeof value === "number" && Number.isFinite(value) ? value : null;
};

/**
 * Ranks the regions of one scope that cross a smoke or fire threshold, most urgent first:
 * the level, then how far past the thresholds, then how many people live there.
 * `areaKm2` maps a region id to its area, which fire density needs.
 */
export function assessPriorities(rows: readonly Record<string, unknown>[], areaKm2: ReadonlyMap<string, number>, visible = 5): PrioritySummary {
  const found: (Omit<Priority, "position" | "outOf"> & { weight: number })[] = [];

  for (const row of rows) {
    const area = areaKm2.get(String(row.region_id)) ?? null;
    const pm = num(row, "pm25_mean");
    const peak = num(row, "pm25_forecast_max");
    const hotspots = num(row, "hotspot_count_7d");
    const smoke = pm == null ? 0 : categoryOf(pm);
    const fire = hotspots == null ? 0 : fireTier(hotspots, area);
    const level: PriorityLevel | null = smoke >= 3 || fire === 3 ? "siaga" : smoke === 2 || fire === 2 ? "waspada" : null;
    if (!level) continue;

    const frp = num(row, "hotspot_frp_max");
    const dry = num(row, "dry_days");
    const rain = num(row, "rain_forecast_30d");
    const population = num(row, "population");
    const reasons: string[] = [];
    const facts: [string, string][] = [["Penduduk wilayah", population != null ? `${integer.format(population)} jiwa` : "Belum ada data"]];

    if (pm != null && smoke >= 2) {
      let line = `PM2.5 rata-rata ${decimal.format(pm)} µg/m³, kategori ISPU ${CATEGORIES[smoke]}`;
      if (peak != null && categoryOf(peak) > smoke) line += peak > 500 ? "; puncak prakiraan 48 jam di atas 500 µg/m³" : `; puncak prakiraan 48 jam ${decimal.format(peak)} µg/m³`;
      reasons.push(line);
    }
    if (pm != null) facts.push(["PM2.5 rata-rata", `${decimal.format(pm)} µg/m³`]);
    if (hotspots != null && fire >= 1 && area != null) {
      const density = (hotspots / area) * 10_000;
      reasons.push(`${integer.format(hotspots)} titik panas dalam 7 hari (${integer.format(Math.round(density))} per 10.000 km²)${frp != null && frp > 0 ? `, intensitas tertinggi ${decimal.format(frp)} MW` : ""}`);
    }
    if (hotspots != null) facts.push(["Titik panas 7 hari", integer.format(hotspots)]);
    if (fire >= 1 && dry != null && dry >= 7) reasons.push(`${integer.format(dry)} hari kering berturut`);
    if (dry != null) facts.push(["Hari kering berturut", `${integer.format(dry)} hari`]);
    if (fire >= 1 && rain != null) reasons.push(`hujan 30 hari ke depan diprakirakan ${decimal.format(rain)} mm`);
    if (rain != null) facts.push(["Hujan 30 hari ke depan", `${decimal.format(rain)} mm`]);

    const signals: PrioritySignal[] = [];
    if (pm != null) {
      signals.push({
        kind: "smoke", label: "Asap (PM2.5)", value: decimal.format(pm), unit: "µg/m³", step: smoke, steps: ISPU_STEPS,
        note: peak != null && categoryOf(peak) > smoke ? `Puncak 48 jam ${peak > 500 ? "di atas 500" : decimal.format(peak)}` : undefined,
      });
    }
    if (hotspots != null) {
      signals.push({
        kind: "fire", label: "Titik panas 7 hari", value: integer.format(hotspots), unit: "titik", step: fire, steps: FIRE_STEPS,
        note: area != null && area > 0 ? `${integer.format(Math.round((hotspots / area) * 10_000))} per 10.000 km²` : undefined,
      });
    }
    const context: PriorityContext[] = [];
    if (dry != null) context.push({ kind: "dry", label: "Hari kering", value: `${integer.format(dry)} hari` });
    if (rain != null) context.push({ kind: "rain", label: "Hujan 30 hari", value: `${decimal.format(rain)} mm` });
    if (frp != null && frp > 0) context.push({ kind: "frp", label: "Api terkuat", value: `${decimal.format(frp)} MW` });

    const advice: string[] = [];
    if (smoke >= 2) advice.push(SMOKE_ADVICE[smoke]);
    if (fire >= 2) advice.push(FIRE_ADVICE);

    // Smoke past "tidak sehat" counts by its ISPU value against the 300 where it turns hazardous; fire by density.
    const smokeWeight = pm == null ? 0 : Math.min(1, pm25ToIspu(pm) / 300);
    const fireShare = hotspots == null ? 0 : fireWeight(hotspots, area);
    const weight = 1 - (1 - smokeWeight) * (1 - fireShare);

    found.push({ regionId: String(row.region_id), name: String(row.name), level, population, reasons, signals, context, facts, advice, weight });
  }

  found.sort((a, b) =>
    (a.level === b.level ? 0 : a.level === "siaga" ? -1 : 1) ||
    b.weight - a.weight ||
    (b.population ?? -1) - (a.population ?? -1) ||
    a.name.localeCompare(b.name, "id-ID"));

  return {
    total: found.length,
    levels: { siaga: found.filter(item => item.level === "siaga").length, waspada: found.filter(item => item.level === "waspada").length },
    items: found.slice(0, visible).map(({ weight: _weight, ...item }, index) => ({ ...item, position: index + 1, outOf: found.length })),
  };
}
