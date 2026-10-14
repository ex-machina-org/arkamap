import { RiAlarmWarningLine, RiFireLine, RiPulseLine } from "@remixicon/react";
import type { EventKind } from "./types";

/** Shared by KPIs, charts, lists and map markers so a kind keeps one identity. */
export const EVENT_KINDS = {
  quake: { label: "Gempa", icon: RiPulseLine, chartVar: "var(--color-chart-5)", dotClass: "bg-chart-5-active" },
  hotspot: { label: "Titik panas", icon: RiFireLine, chartVar: "var(--color-chart-3)", dotClass: "bg-chart-3-active" },
  disaster: { label: "Bencana", icon: RiAlarmWarningLine, chartVar: "var(--color-chart-6)", dotClass: "bg-chart-6-active" },
} satisfies Record<EventKind, { label: string; icon: typeof RiPulseLine; chartVar: string; dotClass: string }>;

export const DISASTER_TYPES: Record<string, string> = {
  volcano: "Gunung api",
  earthquake: "Gempa",
  flood: "Banjir",
  wildfire: "Kebakaran hutan",
  cyclone: "Siklon",
  drought: "Kekeringan",
  landslide: "Longsor",
  other: "Lainnya",
};

export const ALERT_LEVELS = {
  Green: { label: "Hijau", color: "lime" },
  Orange: { label: "Oranye", color: "yellow" },
  Red: { label: "Merah", color: "rose" },
} as const;

export const QUAKE_URGENCY = {
  informasi: { label: "Informasi", color: "soft" },
  pantau: { label: "Pantau", color: "yellow" },
  siaga_tsunami: { label: "Siaga tsunami", color: "rose" },
  darurat: { label: "Darurat", color: "rose" },
} as const;

export const magnitudeColor = (mag: number) => (mag >= 6 ? "rose" : mag >= 5 ? "yellow" : "soft") as "rose" | "yellow" | "soft";
