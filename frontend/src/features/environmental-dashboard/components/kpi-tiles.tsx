import { RiBarChartBoxLine } from "@remixicon/react";
import { StatCards, type Stat } from "@/components/application/dashboard/stat-cards";
import type { DTO } from "@/lib/api/client";
import { formatDecimal, formatPeriodText } from "../format";
import { PanelUnavailable } from "./dashboard-card";

/** One KPI card filling its grid cell; `title` replaces the card's own label. */
export function KpiTile({ stat, variant = "footer", title }: { stat: Stat; variant?: "footer" | "plain"; title?: string }) {
  return <StatCards variant={variant} stats={[{ ...stat, label: title || stat.label }]} columns={1} className="h-full" />;
}

/**
 * Any indicator of the profile's region as a KPI: its real value and unit, with the 0-100
 * attention level as context (100 = most in need of attention, relative to other regions).
 */
export function IndicatorKpi({ indicator, regionName, title }: { indicator: DTO<"IndicatorValue"> | undefined; regionName: string; title?: string }) {
  if (!indicator) return <PanelUnavailable title={title ?? "Indikator belum tersedia"} description={`Belum ada data indikator ini untuk ${regionName}.`} />;
  return <KpiTile title={title} stat={{
    icon: RiBarChartBoxLine, tone: "sky", label: indicator.label,
    value: `${formatDecimal(indicator.value)}${indicator.unit ? ` ${indicator.unit}` : ""}`,
    caption: `${regionName}, ${formatPeriodText(indicator.period)}`,
    delta: `Perhatian ${Math.round(indicator.normalised)}/100`, deltaColor: "neutral",
    hint: `Tingkat perhatian 0-100 dibanding wilayah lain, 100 paling perlu perhatian. Keyakinan ${indicator.confidence}/5.${indicator.is_modelled ? " Nilai ini hasil model, bukan pengukuran langsung." : ""}`,
  }} />;
}
