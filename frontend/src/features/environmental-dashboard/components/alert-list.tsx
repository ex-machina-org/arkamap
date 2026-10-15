import { Fragment, type ReactNode } from "react";
import type { DTO } from "@/lib/api/client";
import { alertCount } from "../insights";
import { alertEntries, type AlertEntry } from "./alert-entries";
import { PanelUnavailable } from "./dashboard-card";

type Alerts = DTO<"AlertPanel">;

function Group({ label, count, children }: { label: string; count?: number; children: ReactNode }) {
  return <section aria-label={label} className="flex flex-col gap-2">
    <h4 className="flex items-center gap-2 text-body-medium text-text-secondary">
      {label}
      {count != null && <span className="rounded-full bg-background-inner-default px-1.5 text-caption-1-medium text-text-secondary tabular-nums shadow-card">{count}</span>}
    </h4>
    <ul className="flex flex-col gap-1.5">{children}</ul>
  </section>;
}

/** Consecutive entries of the same group render under one heading; `totals` counts each group across all pages. */
export function AlertEntries({ entries, totals }: { entries: AlertEntry[]; totals?: Map<string, number> }) {
  const groups: { label: string; entries: AlertEntry[] }[] = [];
  for (const entry of entries) {
    const last = groups.at(-1);
    if (last?.label === entry.group) last.entries.push(entry);
    else groups.push({ label: entry.group, entries: [entry] });
  }
  return <div className="flex flex-col gap-4">
    {groups.map((group, index) => <Group key={`${group.label}:${index}`} label={group.label} count={totals?.get(group.label)}>{group.entries.map(entry => <Fragment key={entry.key}>{entry.node}</Fragment>)}</Group>)}
  </div>;
}

/** Alerts relevant to the profile's field and region, grouped by source. */
export function AlertList({ alerts }: { alerts: Alerts }) {
  if (!alertCount(alerts)) return <PanelUnavailable title="Tidak ada peringatan aktif" description="Tidak ada peringatan yang relevan dengan bidang dan wilayah profil ini saat ini." />;
  return <AlertEntries entries={alertEntries(alerts)} />;
}
