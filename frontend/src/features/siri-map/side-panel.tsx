"use client";

import type { ReactNode } from "react";
import { RiArrowDownSLine } from "@remixicon/react";
import { Chip } from "@/components/base/badges/chip";
import { cx } from "@/utils/cx";
import { relativeTime } from "./format";
import { HAZARDS } from "./hazards";
import type { SpatialIncident } from "./types";

const LIST_LIMIT = 50;
// Dashboard card recipe; see situation-panel.tsx.
const INSET = "rounded-2lg bg-background-inner-default shadow-card";

interface SidePanelProps {
  isOpen: boolean;
  selectedIncident: SpatialIncident | null;
  incidents: SpatialIncident[];
  loading: boolean;
  errors: string[];
  onSelectIncident: (incident: SpatialIncident) => void;
  /** What the profile should look at first. */
  summary: ReactNode;
  /** Free exploration tools, kept below the summary. */
  explore: ReactNode;
  /** The coloured layer's regions in order. */
  ranking: ReactNode;
  /** Every indicator of the picked region; leads the panel while a region is picked. */
  detail?: ReactNode;
}

function Section({ title, meta, children }: { title: string; meta?: ReactNode; children: ReactNode }) {
  return (
    <details className="group rounded-2xl bg-background-secondary-default">
      <summary className="flex cursor-pointer list-none items-center gap-2 rounded-2xl px-4 py-3 outline-none focus-visible:ring-2 focus-visible:ring-border-focus-ring [&::-webkit-details-marker]:hidden">
        <span className="flex-1 text-body-medium text-text-primary">{title}</span>
        {meta}
        <RiArrowDownSLine aria-hidden="true" className="size-4 text-foreground-icon-secondary transition-transform duration-200 ease-out group-open:rotate-180 motion-reduce:transition-none" />
      </summary>
      <div className="px-4 pb-4">{children}</div>
    </details>
  );
}

function IncidentRow({ incident, selected, onSelect }: { incident: SpatialIncident; selected: boolean; onSelect: (incident: SpatialIncident) => void }) {
  const hazard = HAZARDS[incident.hazardType];
  const Icon = hazard.icon;
  return (
    <button
      type="button"
      aria-pressed={selected}
      onClick={() => onSelect(incident)}
      className={cx(
        INSET,
        "button-press-motion flex w-full items-center gap-3 p-2.5 text-left outline-none focus-visible:ring-2 focus-visible:ring-border-focus-ring",
        selected && "ring-2 ring-border-focus-ring",
      )}
    >
      <span style={{ backgroundColor: hazard.color }} className="grid size-8 shrink-0 place-items-center rounded-lg text-text-white">
        <Icon className="size-4" aria-hidden="true" />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block truncate text-body-medium text-text-primary">{incident.title}</span>
        <span className="block truncate text-body-2-regular text-text-tertiary">
          {incident.source} · {relativeTime(incident.lastUpdated)}
        </span>
      </span>
      <span className="shrink-0 text-body-medium tabular-nums text-text-primary">{incident.reading}</span>
    </button>
  );
}

export function SidePanel({
  isOpen,
  selectedIncident,
  incidents,
  loading,
  errors,
  onSelectIncident,
  summary,
  explore,
  ranking,
  detail,
}: SidePanelProps) {
  return (
    <aside
      aria-label="Panel data wilayah"
      data-open={isOpen}
      inert={!isOpen}
      className={cx(
        "z-30 flex min-h-0 flex-col overflow-hidden rounded-2xl border border-border-button-default bg-background-primary-default shadow-2xs",
        // Right of the map, clear of the legend at its bottom left. Wide screens dock it; narrower ones slide it over the map so the map keeps its width.
        "xl:relative xl:h-full xl:w-[380px] xl:shrink-0 xl:data-[open=false]:hidden",
        "max-xl:absolute max-xl:inset-y-0 max-xl:right-0 max-xl:w-[min(380px,calc(100%-1.5rem))] max-xl:shadow-dropdown",
        "max-xl:transition-[transform,visibility] max-xl:duration-200 max-xl:ease-[cubic-bezier(0.32,0.72,0,1)] max-xl:data-[open=false]:invisible max-xl:data-[open=false]:translate-x-[calc(100%+1rem)] motion-reduce:transition-none",
      )}
    >
      <div className="min-h-0 flex-1 space-y-3 overflow-y-auto p-3 [scrollbar-width:thin]">
        {detail}
        {summary}

        <Section
          title="Kejadian tercatat"
          meta={loading ? <span className="text-body-2-regular text-text-tertiary">Memuat...</span> : <Chip variant="caption" color="soft">{incidents.length}</Chip>}
        >
          <div className="space-y-1.5">
            {errors.map((error, i) => (
              <p key={i} role="alert" className="rounded-2lg bg-status-rose-background px-3 py-2 text-body-2-medium text-status-rose-text">{error}</p>
            ))}
            {!loading && incidents.length === 0 && (
              <p className="py-4 text-center text-body-2-regular text-text-secondary">
                Belum ada kejadian yang cocok. Hapus filter atau pencarian untuk melihat semuanya.
              </p>
            )}
            {incidents.slice(0, LIST_LIMIT).map((incident) => (
              <IncidentRow key={incident.id} incident={incident} selected={incident.id === selectedIncident?.id} onSelect={onSelectIncident} />
            ))}
            {incidents.length > LIST_LIMIT && (
              <p className="pt-1 text-center text-body-2-regular text-text-secondary">
                Menampilkan {LIST_LIMIT} dari {incidents.length}. Gunakan pencarian atau filter untuk mempersempit.
              </p>
            )}
          </div>
        </Section>

        <Section title="Peringkat wilayah">{ranking}</Section>

        <Section title="Jelajahi data">{explore}</Section>
      </div>
    </aside>
  );
}
