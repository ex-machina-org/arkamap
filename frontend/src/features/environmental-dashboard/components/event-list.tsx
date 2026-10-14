import type { ReactNode } from "react";
import { Chip } from "@/components/base/badges/chip";
import { cx } from "@/utils/cx";
import { ALERT_LEVELS, DISASTER_TYPES, EVENT_KINDS, magnitudeColor } from "../event-kinds";
import { formatDecimal, formatRelative, periodLabel, recordNumber, recordText } from "../format";
import { confidenceLabel } from "../labels";
import type { DashboardView } from "../types";
import { insetClass, PanelUnavailable } from "./dashboard-card";

type EventPanel = DashboardView["events"][number];

function ItemRow({ kind, item }: { kind: EventPanel["kind"]; item: Record<string, unknown> }) {
  const when = formatRelative(recordText(item, "observed_at"));
  let lead: ReactNode = null;
  let text = "";
  if (kind === "quake") {
    const mag = recordNumber(item, "mag");
    lead = mag != null ? <Chip variant="bold" color={magnitudeColor(mag)}>M {formatDecimal(mag)}</Chip> : null;
    text = recordText(item, "place") ?? "Gempa tercatat";
  } else if (kind === "hotspot") {
    const frp = recordNumber(item, "frp");
    const confidence = confidenceLabel(recordText(item, "confidence"));
    text = frp != null ? `Daya api ${formatDecimal(frp)} MW` : "Titik panas tercatat";
    if (confidence) text += ` · keyakinan ${confidence}`;
  } else {
    const level = recordText(item, "alertlevel");
    const alert = level && level in ALERT_LEVELS ? ALERT_LEVELS[level as keyof typeof ALERT_LEVELS] : undefined;
    const type = recordText(item, "type");
    lead = alert ? <Chip variant="bold" color={alert.color}>{alert.label}</Chip> : null;
    text = recordText(item, "name") ?? (type ? DISASTER_TYPES[type] ?? type : "Bencana tercatat");
  }
  return <li className={cx(insetClass, "flex items-center gap-2 px-3 py-2")}>
    {lead}
    <span className="min-w-0 flex-1 truncate text-body-medium text-text-primary">{text}</span>
    {when && <span className="shrink-0 text-body-2-regular text-text-secondary">{when}</span>}
  </li>;
}

/** Top recorded events per kind, strongest first as the backend sends them. */
export function EventList({ events }: { events: DashboardView["events"] }) {
  const withItems = events.filter(event => event.top.length);
  if (!withItems.length) return <PanelUnavailable title="Belum ada kejadian tercatat" description="Tidak ada kejadian pada wilayah dan periode profil ini." />;
  return <div className="flex flex-col gap-4">
    {withItems.map(event => {
      const kind = EVENT_KINDS[event.kind];
      return <section key={event.kind} aria-label={kind.label} className="flex flex-col gap-2">
        <p className="flex items-center gap-2 text-body-medium text-text-primary"><kind.icon className="size-4 shrink-0 text-foreground-icon-secondary" aria-hidden />{kind.label}<span className="text-body-2-regular text-text-secondary">{periodLabel(event.days)}</span></p>
        <ul className="flex flex-col gap-1.5">{event.top.map((item, index) => <ItemRow key={index} kind={event.kind} item={item} />)}</ul>
      </section>;
    })}
    {withItems.some(event => event.kind === "hotspot") && <p className="text-caption-1-regular text-text-secondary">Daya api adalah FRP (fire radiative power) dalam megawatt. Keyakinan mengikuti deteksi satelit: rendah, nominal, atau tinggi. Titik panas belum tentu kebakaran terkonfirmasi.</p>}
  </div>;
}
