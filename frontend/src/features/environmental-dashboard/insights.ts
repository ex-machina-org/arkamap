import type { DTO } from "@/lib/api/client";
import { isCurrentMonth } from "./format";
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

/** `partial`: the window starts inside this month, or it is the running month, so its count is not a full month. */
export type MonthCount = { month: string; count: number; partial: boolean };

/**
 * Every month the window touches, oldest first, ending with the current month. The API only
 * returns months that had events, so missing months are filled in as zero here.
 */
export function monthSeries(months: DTO<"HistoryMonth">[], days: number, now = new Date()): MonthCount[] {
  const counts = new Map(months.map(month => [month.month.slice(0, 7), month.count]));
  const since = new Date(now.getTime() - days * 86_400_000);
  const length = (now.getUTCFullYear() - since.getUTCFullYear()) * 12 + now.getUTCMonth() - since.getUTCMonth() + 1;
  const startsMidMonth = since.getUTCDate() > 1 || since.getUTCHours() > 0;
  return Array.from({ length }, (_, index) => {
    const month = new Date(Date.UTC(since.getUTCFullYear(), since.getUTCMonth() + index, 1)).toISOString().slice(0, 10);
    return { month, count: counts.get(month.slice(0, 7)) ?? 0, partial: (index === 0 && startsMidMonth) || isCurrentMonth(month, now) };
  });
}
