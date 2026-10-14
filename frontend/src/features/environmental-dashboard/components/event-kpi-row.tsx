import { RiAlarmWarningLine, RiBroadcastLine, RiMapPinLine } from "@remixicon/react";
import { StatCards, type Stat, type StatTone } from "@/components/application/dashboard/stat-cards";
import { EVENT_KINDS } from "../event-kinds";
import { formatDecimal, formatInteger, periodLabel } from "../format";
import { MODE_LABELS } from "../labels";
import type { DashboardView, EventKind } from "../types";

// Literal classes so Tailwind sees them; the grid should have no empty slot.
const COLUMNS: Record<number, string> = { 1: "xl:grid-cols-1", 2: "xl:grid-cols-2", 3: "xl:grid-cols-3", 4: "xl:grid-cols-4" };
const KIND_TONE: Record<EventKind, StatTone> = { hotspot: "orange", quake: "purple", disaster: "blue" };
const FIT = {
  cocok: { delta: "Cocok", color: "lime", text: "Data cocok dengan kebutuhan Anda." },
  sebagian: { delta: "Sebagian", color: "neutral", text: "Data hanya sebagian cocok dengan kebutuhan Anda." },
  tidak_cocok: { delta: "Belum cocok", color: "rose", text: "Data belum cocok dengan kebutuhan Anda." },
} as const;

/** The whole top band: the active profile, then one KPI per event kind (never summed), alerts and devices. */
export function EventKpiRow({ view, alerts, deviceCount }: { view: DashboardView; alerts: number; deviceCount: number }) {
  const scope = view.focus?.name ?? "Indonesia";
  const fit = view.fit ? FIT[view.fit] : undefined;
  const stats: Stat[] = [{
    icon: RiMapPinLine,
    tone: "emerald",
    label: "Mode profil",
    value: MODE_LABELS[view.mode.id] ?? view.mode.label,
    caption: scope,
    delta: fit?.delta ?? "Belum dinilai",
    deltaColor: fit?.color ?? "neutral",
    hint: `${view.mode.title}. Tampilan: ${view.field.label}. ${fit?.text ?? "Kecocokan data belum dievaluasi."} ${view.mode.description}`,
  }];
  for (const event of view.events) {
    const kind = EVENT_KINDS[event.kind];
    stats.push({
      icon: kind.icon,
      tone: KIND_TONE[event.kind],
      label: kind.label,
      value: formatInteger(event.count),
      caption: periodLabel(event.days),
      delta: event.kind === "quake" && event.max_value != null ? `Maks M ${formatDecimal(event.max_value)}` : "Tercatat",
      deltaColor: "neutral",
      hint: `Jumlah ${kind.label.toLowerCase()} tercatat di ${scope} dalam ${periodLabel(event.days)}. Ini catatan kejadian, bukan prediksi.`,
    });
  }
  stats.push({
    icon: RiAlarmWarningLine,
    tone: "pink",
    label: "Peringatan aktif",
    value: formatInteger(alerts),
    caption: "Saat ini",
    delta: alerts ? "Perlu dicek" : "Aman",
    deltaColor: alerts ? "rose" : "neutral",
    hint: "Peringatan cuaca, gempa, bencana, dan indikator wilayah yang relevan dengan bidang dan wilayah profil Anda.",
  });
  stats.push({ icon: RiBroadcastLine, tone: "sky", label: "Perangkat akun", value: formatInteger(deviceCount), caption: "Sensor milik Anda", delta: "Terdaftar", deltaColor: "neutral", hint: "Perangkat IoT yang terdaftar di akun ini." });
  const shown = stats.slice(0, 4);
  return <StatCards variant="footer" stats={shown} columns={4} className={COLUMNS[shown.length]} />;
}
