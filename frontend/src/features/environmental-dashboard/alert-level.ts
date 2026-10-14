import type { DTO } from "@/lib/api/client";
import { DISASTER_TYPES } from "./event-kinds";
import { formatDecimal } from "./format";
import { uniqueWarnings } from "./insights";
import { deviceAlertCategory, type AlertCategory } from "./use-alerts";

// The profile dashboard's AlertPanel has no fire list; /notifications does.
type Notifications = DTO<"AlertPanel"> & { fire_alerts?: DTO<"FireAlert">[] };
type DeviceAlert = DTO<"DeviceAlert">;

/**
 * "bahaya" interrupts the user (bell, pop-up); "waspada" only shows on the
 * alerts page. Only confirmed events and a device's own report reach
 * "bahaya": an alert that fires every day stops being read.
 */
export type AlertLevel = "bahaya" | "waspada";

export const LEVEL_CHIP = {
  bahaya: { label: "Bahaya", color: "rose" },
  waspada: { label: "Waspada", color: "yellow" },
} as const satisfies Record<AlertLevel, { label: string; color: string }>;

/** CAP severity: only Severe and Extreme warn of a threat to life or property. */
export const weatherLevel = (severity?: string | null): AlertLevel =>
  severity && ["severe", "extreme"].includes(severity.toLowerCase()) ? "bahaya" : "waspada";

/** The backend only lists quakes already rated "darurat" or "siaga_tsunami". */
export const quakeLevel = (urgency?: string | null): AlertLevel =>
  urgency === "darurat" || urgency === "siaga_tsunami" ? "bahaya" : "waspada";

/** GDACS Red is its own "severe humanitarian impact"; Orange stays a watch. */
export const disasterLevel = (alertlevel?: string | null): AlertLevel => (alertlevel === "Red" ? "bahaya" : "waspada");

/**
 * Region indicators never reach "bahaya": they are statistics over days
 * (dry days, a fire-risk index, a temperature peak), not events.
 */
export const REGION_LEVEL: AlertLevel = "waspada";

/** A possible fire is a watch; one GDACS also reports nearby is a danger. */
export const fireLevel = (confirmed: boolean): AlertLevel => (confirmed ? "bahaya" : "waspada");

export type DangerItem = { key: string; category: AlertCategory; title: string; detail: string };

/**
 * Every "bahaya" alert, keyed so a pop-up can remember what was already
 * shown. Keys change when the danger is new (a new quake, a device flipping
 * back to bahaya), not on every refresh.
 */
export function dangerItems(data: Notifications | undefined, devices: DeviceAlert[]): DangerItem[] {
  const items: DangerItem[] = devices.filter(alert => alert.status === "bahaya").map(alert => ({
    key: `iot:${alert.device_id}:${alert.nama}:${alert.changed_at}`, category: deviceAlertCategory(alert),
    title: `${alert.device_name} · ${alert.nama}`,
    // filed under a hazard, it still says it came from the user's own device
    detail: `${alert.category ? "Alat IoT · " : ""}${alert.message ?? "Alat melaporkan status bahaya"}`,
  }));
  if (!data) return items;
  for (const item of uniqueWarnings(data)) {
    if (weatherLevel(item.severity) === "bahaya") items.push({ key: `w:${item.id}`, category: "weather", title: item.headline ?? item.event ?? "Peringatan cuaca", detail: item.area ?? "BMKG" });
  }
  for (const item of data.quake_alerts) {
    if (quakeLevel(item.urgency) === "bahaya") items.push({ key: `q:${item.observed_at}:${item.lat}:${item.lon}`, category: "quake", title: `Gempa M ${formatDecimal(item.mag)}`, detail: item.place ?? "Lokasi tidak tercatat" });
  }
  for (const item of data.fire_alerts ?? []) {
    if (fireLevel(item.confirmed) === "bahaya") items.push({
      // a new burst of detections in the same kabkota counts as new
      key: `f:${item.region_id}:${item.first_seen}`, category: "fire",
      title: `Kebakaran di ${item.name}`, detail: `Terdeteksi satelit dan dilaporkan GDACS · ${item.clusters} lokasi`,
    });
  }
  for (const item of data.disaster_alerts) {
    if (disasterLevel(item.alertlevel) === "bahaya") items.push({
      key: `d:${item.type}:${item.name}:${item.observed_at}`, category: "disaster",
      title: item.name ?? (item.type ? DISASTER_TYPES[item.type] ?? item.type : "Bencana"), detail: "GDACS level merah",
    });
  }
  return items;
}
