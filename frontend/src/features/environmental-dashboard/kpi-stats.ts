import { RiAlarmWarningLine, RiBroadcastLine, RiCheckboxCircleLine, RiErrorWarningLine, RiMapPinLine, RiPulseLine } from "@remixicon/react";
import type { Stat, StatTone } from "@/components/application/dashboard/stat-cards";
import type { DTO } from "@/lib/api/client";
import { EVENT_KINDS } from "./event-kinds";
import { formatDecimal, formatInteger, periodLabel } from "./format";
import { MODE_LABELS } from "./labels";
import type { DashboardView, EventKind } from "./types";
import type { IotStat } from "./widget-layout";

/* The KPI tiles' content: one Stat per tile, built from the dashboard response. */

const KIND_TONE: Record<EventKind, StatTone> = { hotspot: "orange", quake: "purple", disaster: "blue" };
const FIT = {
  cocok: { delta: "Cocok", color: "lime", text: "Data cocok dengan kebutuhan Anda." },
  sebagian: { delta: "Sebagian", color: "neutral", text: "Data hanya sebagian cocok dengan kebutuhan Anda." },
  tidak_cocok: { delta: "Belum cocok", color: "rose", text: "Data belum cocok dengan kebutuhan Anda." },
} as const;
const DAY_MS = 24 * 60 * 60 * 1000;

const scopeOf = (view: DashboardView) => view.focus?.name ?? "Indonesia";

export function modeStat(view: DashboardView): Stat {
  const fit = view.fit ? FIT[view.fit] : undefined;
  return {
    icon: RiMapPinLine, tone: "emerald", label: "Mode profil", value: MODE_LABELS[view.mode.id] ?? view.mode.label, caption: scopeOf(view),
    delta: fit?.delta ?? "Belum dinilai", deltaColor: fit?.color ?? "neutral",
    hint: `${view.mode.title}. Tampilan: ${view.field.label}. ${fit?.text ?? "Kecocokan data belum dievaluasi."} ${view.mode.description}`,
  };
}

/** One event kind, never summed with the others. Undefined when the field does not track that kind. */
export function eventStat(view: DashboardView, kind: EventKind): Stat | undefined {
  const event = view.events.find(item => item.kind === kind);
  if (!event) return undefined;
  const meta = EVENT_KINDS[kind];
  return {
    icon: meta.icon, tone: KIND_TONE[kind], label: meta.label, value: formatInteger(event.count), caption: periodLabel(event.days),
    delta: kind === "quake" && event.max_value != null ? `Maks M ${formatDecimal(event.max_value)}` : "Tercatat", deltaColor: "neutral",
    hint: `Jumlah ${meta.label.toLowerCase()} tercatat di ${scopeOf(view)} dalam ${periodLabel(event.days)}. Ini catatan kejadian, bukan prediksi.`,
  };
}

export const alertsStat = (alerts: number): Stat => ({
  icon: RiAlarmWarningLine, tone: "pink", label: "Peringatan aktif", value: formatInteger(alerts), caption: "Saat ini",
  delta: alerts ? "Perlu dicek" : "Aman", deltaColor: alerts ? "rose" : "neutral",
  hint: "Peringatan cuaca, gempa, bencana, dan indikator wilayah yang relevan dengan bidang dan wilayah profil Anda.",
});

export const IOT_STAT_LABELS: Record<IotStat, string> = { devices: "Perangkat IoT", active: "Aktif 24 jam", reporting: "Sensor mengirim", rejected: "Data ditolak" };

/** Essential numbers for the account's own IoT devices; every value falls back to 0. */
export function iotStat(devices: DTO<"DeviceDashboard">[], stat: IotStat): Stat {
  const label = IOT_STAT_LABELS[stat];
  if (stat === "devices") return { icon: RiBroadcastLine, label, value: String(devices.length), delta: "Terdaftar", deltaColor: "neutral" };
  if (stat === "active") {
    const now = Date.now();
    const active = devices.filter(({ device }) => device.last_seen_at && now - Date.parse(device.last_seen_at) < DAY_MS).length;
    return { icon: RiCheckboxCircleLine, label, value: String(active), delta: `${devices.length - active} tidak aktif`, deltaColor: active ? "lime" : "neutral" };
  }
  if (stat === "reporting") {
    const fields = devices.flatMap(({ widgets }) => widgets.filter(widget => !widget.hidden));
    return { icon: RiPulseLine, label, value: String(fields.filter(widget => widget.latest != null).length), delta: `dari ${fields.length} field`, deltaColor: "neutral" };
  }
  const rejected = devices.reduce((sum, { device }) => sum + (device.rejected_count ?? 0), 0);
  return { icon: RiErrorWarningLine, label, value: String(rejected), delta: rejected ? "Periksa payload" : "Aman", deltaColor: rejected ? "rose" : "neutral" };
}
