import type { DTO } from "@/lib/api/client";
import { formatDecimal, isCurrentMonth } from "./format";
import type { PanelId } from "./types";

type Alerts = DTO<"AlertPanel">;

/** Panels shown as tabs of the single "Sorotan wilayah" card. */
export type InsightTab = Extract<PanelId, "ranking" | "events" | "alerts">;

export const isInsightTab = (id: PanelId): id is InsightTab => id === "ranking" || id === "events" || id === "alerts";

/** The feed can repeat a warning for the same area; identical ones add nothing. */
export function uniqueWarnings(alerts: Alerts) {
  const seen = new Set<string>();
  return (alerts.weather_warnings ?? []).filter(item => {
    const key = `${item.headline ?? item.event ?? item.id}|${item.area ?? ""}|${item.effective ?? ""}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

/**
 * Satellite hotspots are hot pixels, not confirmed fires (gas flares,
 * smelters and volcanoes show up too), so they are not raised as alerts.
 * Fire alerts wait for a fire source of their own.
 */
const NOT_ALERTS = new Set(["hotspot_count_7d", "hotspot_frp_max"]);

/** Region indicators that count as alerts. */
export const alertRegions = (alerts: Alerts) => alerts.region_alerts.filter(item => !NOT_ALERTS.has(item.metric));

export const alertCount = (alerts: Alerts) => alerts.quake_alerts.length + alerts.disaster_alerts.length + alertRegions(alerts).length + uniqueWarnings(alerts).length;

/** Month-over-month change, only when the latest month is complete so the two counts are comparable. */
export function monthDelta(months: DTO<"HistoryMonth">[]): { label: string; color: "lime" | "rose" | "neutral" } {
  const last = months.at(-1);
  const previous = months.at(-2);
  if (!last || !previous) return { label: "Tercatat", color: "neutral" };
  if (isCurrentMonth(last.month)) return { label: "Bulan berjalan", color: "neutral" };
  if (previous.count === 0) return { label: "Tercatat", color: "neutral" };
  const change = Math.round(((last.count - previous.count) / previous.count) * 1000) / 10;
  if (change === 0) return { label: "0%", color: "neutral" };
  // More recorded hazards is worse, so a rise reads red and a drop green.
  return { label: `${change > 0 ? "+" : "-"}${formatDecimal(Math.abs(change))}%`, color: change > 0 ? "rose" : "lime" };
}
