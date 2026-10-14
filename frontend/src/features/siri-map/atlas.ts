import type { ComponentType, CSSProperties } from "react";
import {
  RiBuilding2Line,
  RiBusLine,
  RiChargingPile2Line,
  RiCloudyLine,
  RiCommunityLine,
  RiDropLine,
  RiFireLine,
  RiFlashlightLine,
  RiGroupLine,
  RiHospitalLine,
  RiLeafLine,
  RiLineChartLine,
  RiMoneyDollarCircleLine,
  RiPlugLine,
  RiPulseLine,
  RiRainyLine,
  RiRoadMapLine,
  RiSchoolLine,
  RiShipLine,
  RiSparklingLine,
  RiSunFoggyLine,
  RiSunLine,
  RiSurgicalMaskLine,
  RiTempHotLine,
  RiWaterFlashLine,
  RiWindyLine,
} from "@remixicon/react";
import type { DTO } from "@/lib/api/client";
import type { BasemapType } from "./types";

/* Map vocabulary carried over from Nusantara Atlas: the three aspects, their ramps, and the basemaps.
   MapLibre paint and canvas layers cannot read CSS tokens, so these colours are hex by necessity. */

export type Aspect = "lingkungan" | "energi" | "urban";
export type Level = "provinsi" | "kabkota";
export type MetricDef = DTO<"MetricDef">;
export type MapLayer = DTO<"MapLayer">;

type Icon = ComponentType<{ className?: string; style?: CSSProperties; "aria-hidden"?: boolean | "true" | "false" }>;

export const ASPECT_ORDER: Aspect[] = ["lingkungan", "energi", "urban"];

export const ASPECTS: Record<Aspect, { label: string; color: string; icon: Icon }> = {
  lingkungan: { label: "Lingkungan", color: "#4A9D93", icon: RiLeafLine },
  energi: { label: "Energi", color: "#D9A45B", icon: RiFlashlightLine },
  urban: { label: "Urban", color: "#6B8CAE", icon: RiBuilding2Line },
};

export function aspectOf(value: string | undefined | null): Aspect {
  return value === "energi" || value === "urban" ? value : "lingkungan";
}

export const LEVELS: Record<Level, string> = { provinsi: "Provinsi", kabkota: "Kab/Kota" };

// Ramps stay within each aspect's hue family and only lift lightness, so the map reads calm rather than alarming.
const RAMPS: Record<Aspect, string[]> = {
  lingkungan: ["#E8F0EE", "#B5D4CE", "#7FB8AF", "#4A9D93", "#2E6F68"],
  energi: ["#F7EFE2", "#EBD5B0", "#E2BC83", "#D9A45B", "#A8763A"],
  urban: ["#EAEFF4", "#C3D2E0", "#96B0C8", "#6B8CAE", "#41637F"],
};

// A hot city painted teal reads as cool, so temperature gets a cool-to-warm ramp instead of its aspect's.
const HEAT_RAMP = ["#8FB8CE", "#CFD9C9", "#E8CE96", "#D9A45B", "#C77B62", "#A85543"];
const HEAT_METRICS = new Set(["temp_max_mean", "temp_max_peak", "heat_index_max", "wet_bulb_max"]);

export const rampStopsFor = (metric: string | null | undefined, aspect: Aspect) =>
  metric && HEAT_METRICS.has(metric) ? HEAT_RAMP : RAMPS[aspect];

/** Colour at `t` (0..1) along a ramp. */
export function rampAt(stops: readonly string[], t: number): string {
  const x = Math.max(0, Math.min(1, t)) * (stops.length - 1);
  const i = Math.min(stops.length - 2, Math.floor(x));
  const f = x - i;
  const hex = (h: string) => [1, 3, 5].map(k => parseInt(h.slice(k, k + 2), 16));
  const a = hex(stops[i]);
  const b = hex(stops[i + 1]);
  return `rgb(${a.map((v, k) => Math.round(v + (b[k] - v) * f)).join(",")})`;
}

/* Point overlays have their own palettes, so the legend shows the colours actually drawn on the map. */
export const OVERLAY_RAMPS = {
  hotspot: ["#EDE9E1", "#E2BC83", "#D9A45B", "#C77B62", "#B35F4A"],
  quake: ["#7FB0A6", "#C9A26B", "#D9A45B", "#C77B62"],
} as const;

export const isHotspotMetric = (metric: string | null | undefined) => !!metric && (metric.startsWith("hotspot") || metric === "fire_risk");
export const isQuakeMetric = (metric: string | null | undefined) => !!metric && (metric.startsWith("quake") || metric === "seismic_hazard");

const METRIC_ICONS: Record<string, Icon> = {
  fire_risk: RiFireLine,
  hotspot_count_7d: RiSparklingLine,
  hotspot_frp_max: RiFireLine,
  dry_days: RiSunLine,
  rain_30d: RiRainyLine,
  rain_forecast_30d: RiRainyLine,
  pm25_mean: RiSurgicalMaskLine,
  pm25_forecast_max: RiSurgicalMaskLine,
  aqi_forecast_max: RiSurgicalMaskLine,
  no2_mean: RiCloudyLine,
  co_mean: RiCloudyLine,
  river_discharge: RiWaterFlashLine,
  water_stress: RiDropLine,
  seismic_hazard: RiPulseLine,
  quake_count_30y: RiPulseLine,
  quake_max_mag_30y: RiLineChartLine,
  wind_speed: RiWindyLine,
  temp_max_mean: RiTempHotLine,
  temp_max_peak: RiTempHotLine,
  heat_index_max: RiTempHotLine,
  wet_bulb_max: RiTempHotLine,
  uv_index_max: RiSunFoggyLine,
  solar_ghi: RiSunLine,
  solar_ghi_annual: RiSunLine,
  solar_rooftop_mwp: RiSunLine,
  power_capacity_mw: RiFlashlightLine,
  grid_density: RiPlugLine,
  ev_charging_count: RiChargingPile2Line,
  built_density: RiBuilding2Line,
  population_density: RiGroupLine,
  road_density: RiRoadMapLine,
  transit_stop_density: RiBusLine,
  transit_coverage_500m: RiBusLine,
  health_facilities_per_10k: RiHospitalLine,
  schools_per_10k: RiSchoolLine,
  wealth_index: RiMoneyDollarCircleLine,
  wave_height_max: RiShipLine,
  sea_surface_temp: RiShipLine,
};

export const metricIcon = (metric: string, aspect: Aspect): Icon => METRIC_ICONS[metric] ?? ASPECTS[aspect].icon ?? RiCommunityLine;

/** Derived numbers carry a `derived_` source; the rest are publisher observations. */
export const isModelledMetric = (metric: MetricDef) => metric.source_id?.startsWith("derived_") ?? false;

export type Basemap = BasemapType;

export const BASEMAPS: Record<Basemap, { label: string; hint: string }> = {
  street: { label: "Peta", hint: "Jalan dan nama tempat" },
  detail: { label: "Detail", hint: "CyclOSM: gang, bangunan, dan nama kampung" },
  satellite: { label: "Satelit", hint: "Citra udara dengan label jalan" },
  heat: { label: "Suhu", hint: "Hawa panas permukaan: aspal dan atap, bukan batas wilayah" },
};

export const BASEMAP_ORDER: Basemap[] = ["street", "detail", "satellite", "heat"];

const decimal = (digits: number) => new Intl.NumberFormat("id-ID", { minimumFractionDigits: digits, maximumFractionDigits: digits });

export const fmt = (n: number | null | undefined, digits = 0) => (n == null ? "–" : decimal(digits).format(n));

/** Small numbers keep a decimal, large ones don't. */
export const fmtAuto = (n: number | null | undefined) => (n == null ? "–" : fmt(n, Math.abs(n) < 100 ? 1 : 0));

/** "idn.jawa_barat" → "jawa barat", for a hint under a kab/kota name. */
export const parentName = (parentId: string | null | undefined) => (parentId ? parentId.replace(/^idn\./, "").replace(/_/g, " ") : null);
