import type { ReactNode } from "react";
import { Chip } from "@/components/base/badges/chip";
import type { DTO } from "@/lib/api/client";
import { ALERT_LEVELS, DISASTER_TYPES, QUAKE_URGENCY, magnitudeColor } from "../event-kinds";
import { formatDecimal, formatRelative } from "../format";
import { alertRegions, uniqueWarnings } from "../insights";
import { severityLabel } from "../labels";
import { AlertRow } from "./alert-row";
import { disasterLevel, quakeLevel, REGION_LEVEL, weatherLevel, type AlertLevel } from "../alert-level";

type Alerts = DTO<"AlertPanel">;

/** One alert row tagged with its group, so a caller can page through rows and still show headings. */
export type AlertEntry = { group: string; key: string; node: ReactNode; level?: AlertLevel };

export function alertEntries(alerts: Alerts): AlertEntry[] {
  return [
    ...uniqueWarnings(alerts).map(item => {
      const severity = severityLabel(item.severity);
      const level = weatherLevel(item.severity);
      return { group: "Cuaca", key: `w:${item.id}`, level, node: <AlertRow level={level} chip={severity ? <Chip variant="bold" color={severity.color}>{severity.label}</Chip> : undefined} title={item.headline ?? item.event ?? "Peringatan cuaca"} meta={item.area} /> };
    }),
    ...alerts.quake_alerts.map(item => {
      const urgency = item.urgency && item.urgency in QUAKE_URGENCY ? QUAKE_URGENCY[item.urgency as keyof typeof QUAKE_URGENCY] : undefined;
      const level = quakeLevel(item.urgency);
      return { group: "Gempa", key: `q:${item.observed_at}:${item.lat}:${item.lon}`, level, node: <AlertRow level={level} chip={<><Chip variant="bold" color={magnitudeColor(item.mag)}>M {formatDecimal(item.mag)}</Chip>{urgency && <Chip variant="caption" color={urgency.color}>{urgency.label}</Chip>}</>} title={item.place ?? "Gempa tercatat"} meta={formatRelative(item.observed_at)} /> };
    }),
    ...alerts.disaster_alerts.map(item => {
      const level = item.alertlevel && item.alertlevel in ALERT_LEVELS ? ALERT_LEVELS[item.alertlevel as keyof typeof ALERT_LEVELS] : undefined;
      const severity = disasterLevel(item.alertlevel);
      return { group: "Bencana", key: `d:${item.observed_at}:${item.lat}:${item.lon}`, level: severity, node: <AlertRow level={severity} chip={level ? <Chip variant="bold" color={level.color}>{level.label}</Chip> : undefined} title={item.name ?? (item.type ? DISASTER_TYPES[item.type] ?? item.type : "Bencana tercatat")} meta={formatRelative(item.observed_at)} /> };
    }),
    ...alertRegions(alerts).map(item => ({ group: "Indikator wilayah", key: `r:${item.region_id}:${item.metric}`, level: REGION_LEVEL, node: <AlertRow level={REGION_LEVEL} chip={<Chip variant="subtle" color="neutral">{formatDecimal(item.normalised)}/100</Chip>} title={`${item.name} · ${item.label}`} meta={formatDecimal(item.value)} /> })),
  ];
}
