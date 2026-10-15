"use client";

import type { ReactNode } from "react";
import { motion } from "motion/react";
import { RiArrowDownSLine } from "@remixicon/react";
import { Chip } from "@/components/base/badges/chip";
import { useMediaQuery } from "@/hooks/use-media-query";
import { spring } from "@/lib/springs";
import { cx } from "@/utils/cx";
import { relativeTime } from "./format";
import { HAZARDS } from "./hazards";
import type { SpatialIncident } from "./types";

const LIST_LIMIT = 50;
const PANEL_WIDTH = 380;
// The dashboard's card anatomy (environmental-dashboard/components/dashboard-card.tsx, which this feature may not import):
// the panel is the page, sections are grey cards on it, items are white insets in them. Two levels, never more.
const CARD = "rounded-2xl bg-background-secondary-default";
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
  /** National summaries and reports, kept below the summary. */
  explore: ReactNode;
  /** The coloured layer's regions in order. */
  ranking: ReactNode;
  /** Every indicator of the picked region; leads the panel while a region is picked. */
  detail?: ReactNode;
}

function Section({ title, meta, children }: { title: string; meta?: ReactNode; children: ReactNode }) {
  return (
    // A dashboard card whose body folds away; the title takes the card title style.
    <details className={cx(CARD, "details-motion group")}>
      <summary className="flex cursor-pointer list-none items-center gap-2 rounded-2xl p-4 outline-none focus-visible:ring-2 focus-visible:ring-border-focus-ring [&::-webkit-details-marker]:hidden">
        <span className="flex-1 text-title-3-medium text-text-primary">{title}</span>
        {meta}
        <RiArrowDownSLine aria-hidden="true" className="size-4 text-foreground-icon-secondary transition-transform duration-200 ease-[cubic-bezier(0.23,1,0.32,1)] group-open:rotate-180 motion-reduce:transition-none" />
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
  const docked = useMediaQuery("(min-width: 1280px)");
  // Docked, the panel gives its width back to the map, which follows it frame by frame; the gap before it closes too.
  // Over the map, it slides off the right edge instead. Hidden once closed, so it leaves the tab order.
  const target = docked
    ? isOpen ? { width: PANEL_WIDTH, marginLeft: 0, opacity: 1, visibility: "visible" as const } : { width: 0, marginLeft: -12, opacity: 0, transitionEnd: { visibility: "hidden" as const } }
    : isOpen ? { x: 0, visibility: "visible" as const } : { x: "calc(100% + 1rem)", transitionEnd: { visibility: "hidden" as const } };
  return (
    <motion.aside
      // A different mode starts from clean styles rather than the other mode's width or offset.
      key={docked ? "docked" : "overlay"}
      aria-label="Panel data wilayah"
      data-open={isOpen}
      inert={!isOpen}
      initial={false}
      animate={target}
      // Entering uses the large-surface tier; leaving is the quicker tween, so closing feels final.
      transition={isOpen ? spring.slow : spring.slow.exit}
      className={cx(
        // Docked, the panel is part of the page like the dashboard's content column: no frame of its own, cards straight on the page colour.
        "z-30 flex min-h-0 flex-col overflow-hidden rounded-2xl bg-background-full",
        "xl:relative xl:h-full xl:shrink-0",
        // Over the map it needs an edge, so it gets the border and the raised shadow there only.
        "max-xl:absolute max-xl:inset-y-0 max-xl:right-0 max-xl:w-[min(380px,calc(100%-1.5rem))] max-xl:border max-xl:border-border-button-default max-xl:shadow-dropdown",
      )}
    >
      {/* Fixed width while docked, so the content is clipped as the panel narrows instead of reflowing every frame. */}
      <div className="min-h-0 flex-1 space-y-3 overflow-y-auto [scrollbar-width:thin] max-xl:p-3 xl:w-[380px] xl:min-w-[380px]">
        {detail}
        {summary}

        <Section
          title="Kejadian tercatat"
          meta={loading ? <span className="text-body-2-regular text-text-tertiary">Memuat...</span> : <Chip variant="caption" color="soft">{incidents.length.toLocaleString("id-ID")}</Chip>}
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

        <Section title="Data Publik">{explore}</Section>
      </div>
    </motion.aside>
  );
}
