import { RiBarChart2Line } from "@remixicon/react";
import { StatCard, type Stat } from "@/components/application/dashboard/stat-cards";

/** A single KPI using the same card, icon tile, and delta chip as BoardUI's StatCards. */
export function KpiCard({ label, value, change, tone, icon = RiBarChart2Line, caption }: {
  label: string;
  value: string;
  change: string;
  tone?: Stat["deltaColor"];
  icon?: Stat["icon"];
  /** Additional context for assistive technology; the compact BoardUI card keeps its visible layout to three rows. */
  caption?: string;
}) {
  const deltaColor = tone ?? (change.trim().startsWith("-") ? "rose" : "lime");
  return <div aria-description={caption}><StatCard stat={{ label, value, delta: change, deltaColor, icon }} /></div>;
}
