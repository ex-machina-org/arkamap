import type { DTO } from "@/lib/api/client";

export const MODE_LABELS: Record<DTO<"ModeInfo">["id"], string> = {
  protected: "Dampak",
  responden: "Responden",
  plan: "Perencanaan",
};

/** CAP severity as published in weather warnings. */
const SEVERITY = {
  minor: { label: "Ringan", color: "neutral" },
  moderate: { label: "Sedang", color: "yellow" },
  severe: { label: "Berat", color: "rose" },
  extreme: { label: "Ekstrem", color: "rose" },
} as const;

export function severityLabel(value?: string | null): { label: string; color: "neutral" | "yellow" | "rose" } | undefined {
  if (!value) return undefined;
  const known = SEVERITY[value.toLowerCase() as keyof typeof SEVERITY];
  return known ?? { label: value, color: "neutral" };
}

/** VIIRS reports l/n/h; MODIS reports 0-100. */
export function confidenceLabel(value?: string | null) {
  if (!value) return undefined;
  const key = value.toLowerCase();
  if (key === "l" || key === "low") return "rendah";
  if (key === "n" || key === "nominal") return "nominal";
  if (key === "h" || key === "high") return "tinggi";
  return /^\d+(\.\d+)?$/.test(key) ? `${key}%` : value;
}

/** Metric ids arrive as snake_case; used only when the API sent no label. */
export const prettifyId = (id: string) => id.replaceAll("_", " ");
