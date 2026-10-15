import type { ReactNode } from "react";
import type { DTO } from "@/lib/api/client";
import { ALERT_LEVELS, DISASTER_TYPES, QUAKE_URGENCY } from "../event-kinds";
import { formatDecimal, formatRelative } from "../format";
import { alertRegions, uniqueWarnings } from "../insights";
import { severityLabel } from "../labels";
import { AlertRow } from "./alert-row";
import { disasterLevel, mapHref, quakeLevel, REGION_LEVEL, weatherLevel, type AlertLevel } from "../alert-level";

type Alerts = DTO<"AlertPanel">;

/** One alert row tagged with its group, so a caller can page through rows and still show headings. */
export type AlertEntry = { group: string; key: string; node: ReactNode; level?: AlertLevel };

export function alertEntries(alerts: Alerts): AlertEntry[] {
  return [
    ...uniqueWarnings(alerts).map(item => {
      const severity = severityLabel(item.severity);
      const level = weatherLevel(item.severity);
      return { group: "Cuaca", key: `w:${item.id}`, level, node: <AlertRow kind="weather" level={level} tags={["BMKG", severity && `Tingkat ${severity.label.toLocaleLowerCase("id-ID")}`]} title={item.headline ?? item.event ?? "Peringatan cuaca"}
        detail={item.area} meta={item.expires ? `Berakhir ${formatRelative(item.expires)}` : undefined} href={item.url ?? undefined} linkLabel="Detail BMKG" /> };
    }),
    ...alerts.quake_alerts.map(item => {
      const urgency = item.urgency && item.urgency in QUAKE_URGENCY ? QUAKE_URGENCY[item.urgency as keyof typeof QUAKE_URGENCY] : undefined;
      const level = quakeLevel(item.urgency);
      return { group: "Gempa", key: `q:${item.observed_at}:${item.lat}:${item.lon}`, level, node: <AlertRow kind="quake" level={level} tags={[`M ${formatDecimal(item.mag)}`, urgency?.label]} title={item.place ?? "Gempa tercatat"} meta={formatRelative(item.observed_at)} href={mapHref(item)} /> };
    }),
    ...alerts.disaster_alerts.map(item => {
      const level = item.alertlevel && item.alertlevel in ALERT_LEVELS ? ALERT_LEVELS[item.alertlevel as keyof typeof ALERT_LEVELS] : undefined;
      const severity = disasterLevel(item.alertlevel);
      return { group: "Bencana", key: `d:${item.observed_at}:${item.lat}:${item.lon}`, level: severity, node: <AlertRow kind="disaster" level={severity} tags={["GDACS", level && `Level ${level.label.toLocaleLowerCase("id-ID")}`]} title={item.name ?? (item.type ? DISASTER_TYPES[item.type] ?? item.type : "Bencana tercatat")}
        detail={item.name && item.type ? DISASTER_TYPES[item.type] ?? item.type : undefined} meta={formatRelative(item.observed_at)} href={mapHref(item)} /> };
    }),
    ...alertRegions(alerts).map(item => ({ group: "Indikator wilayah", key: `r:${item.region_id}:${item.metric}`, level: REGION_LEVEL, node: <AlertRow kind="region" level={REGION_LEVEL} tags={[`Skor ${formatDecimal(item.normalised)}/100`]} title={`${item.name} · ${item.label}`} meta={formatDecimal(item.value)} href={mapHref({ region: item.region_id })} /> })),
  ];
}
