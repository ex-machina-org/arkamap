import type { ComponentType } from "react";
import {
  RiAlarmWarningLine,
  RiBroadcastLine,
  RiFireLine,
  RiFocus3Line,
  RiWaterPercentLine,
  RiWindyLine,
} from "@remixicon/react";
import type { HazardType } from "./types";

type HazardIcon = ComponentType<{ className?: string; "aria-hidden"?: boolean | "true" | "false" }>;

interface HazardMeta {
  /** Short name for pins, rows and the card. */
  label: string;
  /** Longer name for the rail filter. */
  filterLabel: string;
  icon: HazardIcon;
  /** Hex, because MapLibre paint cannot read CSS tokens. DOM pins use the same value so both stay identical. */
  color: string;
}

export const HAZARDS: Record<HazardType, HazardMeta> = {
  hotspot: { label: "Titik panas", filterLabel: "Karhutla dan titik panas", icon: RiFireLine, color: "#f97316" },
  flood: { label: "Banjir", filterLabel: "Banjir", icon: RiWaterPercentLine, color: "#3b82f6" },
  air_quality: { label: "Kualitas udara", filterLabel: "Kualitas udara", icon: RiWindyLine, color: "#06b6d4" },
  iot_sensor: { label: "Sensor lapangan", filterLabel: "Sensor lapangan", icon: RiBroadcastLine, color: "#10b981" },
  seismic: { label: "Gempa", filterLabel: "Gempa bumi", icon: RiFocus3Line, color: "#f43f5e" },
  disaster: { label: "Bencana", filterLabel: "Bencana lain", icon: RiAlarmWarningLine, color: "#64748b" },
};

export const HAZARD_ORDER: HazardType[] = ["hotspot", "flood", "air_quality", "iot_sensor", "seismic", "disaster"];
