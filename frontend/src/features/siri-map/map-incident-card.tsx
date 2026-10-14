"use client";

import { motion, useReducedMotion } from "motion/react";
import { RiCloseLine, RiFileCopyLine, RiRouteLine, RiShieldCheckLine, RiSidebarUnfoldLine } from "@remixicon/react";
import { Button } from "@/components/base/buttons/button";
import { absoluteTime, formatCoords, relativeTime } from "./format";
import { HAZARDS } from "./hazards";
import type { SpatialIncident } from "./types";

interface MapIncidentCardProps {
  incident: SpatialIncident;
  onClose: () => void;
  onDispatchOrder: (incident: SpatialIncident) => void;
  onCopyGeoJSON: (incident: SpatialIncident) => void;
  onOpenSidebar: () => void;
  onOpenResponderRoute?: (incident: SpatialIncident) => void;
}

export function MapIncidentCard({
  incident,
  onClose,
  onDispatchOrder,
  onCopyGeoJSON,
  onOpenSidebar,
  onOpenResponderRoute,
}: MapIncidentCardProps) {
  const reduce = useReducedMotion();
  const hazard = HAZARDS[incident.hazardType];
  const Icon = hazard.icon;
  const facts: [string, string][] = [
    ["Sumber", incident.source],
    ["Tercatat", absoluteTime(incident.lastUpdated)],
    ["Koordinat (lintang, bujur)", formatCoords(incident.coords)],
  ];

  return (
    <motion.section
      aria-label={`Detail ${incident.title}`}
      // Grows out of the side facing its pin (AnchoredCard sets the origin). Exit is quicker than enter.
      initial={reduce ? { opacity: 0 } : { opacity: 0, scale: 0.96 }}
      animate={{ opacity: 1, scale: 1, transition: { duration: 0.18, ease: [0.23, 1, 0.32, 1] } }}
      exit={reduce ? { opacity: 0 } : { opacity: 0, scale: 0.97, transition: { duration: 0.12, ease: "easeOut" } }}
      className="w-full rounded-xl border border-border-button-default bg-background-primary-default p-3.5 shadow-dropdown"
    >
      <div className="flex items-start gap-3">
        <span style={{ backgroundColor: hazard.color }} className="grid size-9 shrink-0 place-items-center rounded-lg text-text-white">
          <Icon className="size-5" aria-hidden="true" />
        </span>
        <div className="min-w-0 flex-1">
          <h3 className="truncate text-body-semibold text-text-primary">{incident.title}</h3>
          <p className="text-caption-1-regular text-text-tertiary">{hazard.label} · {relativeTime(incident.lastUpdated)}</p>
        </div>
        <Button variant="ghost" size="xs" iconOnly leadingIcon={RiCloseLine} aria-label="Tutup detail" onClick={onClose} />
      </div>

      <p className="mt-3 text-title-1-semibold tabular-nums text-text-primary">{incident.reading}</p>
      <p className="mt-1 text-body-regular text-text-secondary">{incident.summary}</p>

      <dl className="mt-3 grid grid-cols-[auto_1fr] gap-x-4 gap-y-1.5 border-t border-border-button-default pt-3 text-caption-1-regular">
        {facts.map(([term, value]) => (
          <div key={term} className="contents">
            <dt className="text-text-tertiary">{term}</dt>
            <dd className="min-w-0 break-words text-right text-text-primary">{value}</dd>
          </div>
        ))}
      </dl>

      <div className="mt-3 flex flex-wrap gap-2">
        {onOpenResponderRoute && (
          <Button
            variant="primary"
            size="small"
            leadingIcon={RiRouteLine}
            onClick={() => onOpenResponderRoute(incident)}
          >
            Rute Taktis & Evakuasi
          </Button>
        )}
        <Button variant="secondary" size="small" leadingIcon={RiFileCopyLine} onClick={() => onCopyGeoJSON(incident)}>
          Salin GeoJSON
        </Button>
        <Button variant="secondary" size="small" leadingIcon={RiShieldCheckLine} onClick={() => onDispatchOrder(incident)}>
          Disposisi (preview)
        </Button>
        <Button variant="ghost" size="small" leadingIcon={RiSidebarUnfoldLine} onClick={onOpenSidebar}>
          Buka di panel
        </Button>
      </div>
    </motion.section>
  );
}
