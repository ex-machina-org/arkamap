import { useState } from "react";
import { motion, useReducedMotion } from "motion/react";
import { RiAlertLine, RiCheckLine, RiCloseLine, RiFocus3Line, RiMapPinLine, RiRouteLine, RiWindyLine } from "@remixicon/react";
import { Button } from "@/components/base/buttons/button";
import { Chip } from "@/components/base/badges/chip";
import { SegmentedControl, SegmentedControlItem } from "@/components/base/segmented-control/segmented-control";
import { cx } from "@/utils/cx";
import { poiStyle, type RouteLeg, type RouteSafetyLevel, type TacticalPlan } from "./types";

// Same anatomy as MapIncidentCard and the side panel: a grey card, readings in white insets.
const INSET = "rounded-2lg bg-background-inner-default shadow-card";
// The line colours drawn by ResponderRouteLayers, so a card and its line read as one.
const LEG_COLOR = { ingress: "#06b6d4", egress: "#10b981" } as const;
const SAFETY: Record<RouteSafetyLevel, { label: string; color: "lime" | "yellow" | "rose"; icon: string }> = {
  safe: { label: "Aman", color: "lime", icon: "text-status-lime-text" },
  caution: { label: "Waspada", color: "yellow", icon: "text-status-yellow-text" },
  critical: { label: "Bahaya", color: "rose", icon: "text-status-rose-text" },
};

type Leg = "ingress" | "egress" | "both";

interface ResponderRoutePanelProps {
  plan: TacticalPlan;
  activeLeg: Leg;
  onLegChange: (leg: Leg) => void;
  onFocusCoords: (coords: [number, number]) => void;
  onChangeOrigin: () => void;
  onClose: () => void;
}

function distance(meters: number) {
  return meters < 1000 ? `${meters} m` : `${(meters / 1000).toLocaleString("id-ID", { maximumFractionDigits: 1 })} km`;
}

/** One leg as a pressable inset: pressing it shows only that line on the map, pressing again shows both. */
function LegCard({ leg, title, pressed, onPress }: { leg: RouteLeg; title: string; pressed: boolean; onPress: () => void }) {
  const safety = SAFETY[leg.safetyLevel];
  return (
    <button
      type="button"
      aria-pressed={pressed}
      onClick={onPress}
      className={cx(
        INSET,
        "button-press-motion block w-full p-3 text-left outline-none focus-visible:ring-2 focus-visible:ring-border-focus-ring",
        pressed && "ring-2 ring-border-focus-ring",
      )}
    >
      <span className="flex items-center gap-2">
        <span aria-hidden className="size-2.5 shrink-0 rounded-full" style={{ backgroundColor: LEG_COLOR[leg.type] }} />
        <span className="min-w-0 flex-1 truncate text-body-medium text-text-primary">{title}</span>
        <Chip variant="caption" color={safety.color}>{safety.label}</Chip>
      </span>
      <span className="mt-2 flex items-baseline gap-1.5 tabular-nums">
        <span className="text-title-2-medium text-text-primary">{leg.distanceKm.toLocaleString("id-ID")}</span>
        <span className="text-body-2-regular text-text-secondary">km</span>
        <span aria-hidden className="text-text-tertiary">·</span>
        <span className="text-title-2-medium text-text-primary">{leg.durationMinutes}</span>
        <span className="text-body-2-regular text-text-secondary">menit</span>
      </span>
      <span className="mt-1 block text-body-2-regular text-text-secondary">{leg.summary}</span>
      {leg.warnings.length > 0 && (
        <span className="mt-2 flex flex-col gap-1">
          {leg.warnings.map((warning) => (
            <span key={warning} className="flex items-start gap-1.5 text-body-2-regular text-text-secondary">
              {/* On a safe leg the notes confirm what was checked, so they take a tick, not a warning sign. */}
              {leg.safetyLevel === "safe"
                ? <RiCheckLine aria-hidden="true" className="mt-0.5 size-3.5 shrink-0 text-status-lime-text" />
                : <RiAlertLine aria-hidden="true" className={cx("mt-0.5 size-3.5 shrink-0", safety.icon)} />}
              {warning}
            </span>
          ))}
        </span>
      )}
    </button>
  );
}

export function ResponderRoutePanel({ plan, activeLeg, onLegChange, onFocusCoords, onChangeOrigin, onClose }: ResponderRoutePanelProps) {
  const reduce = useReducedMotion();
  const [tab, setTab] = useState<"routes" | "places">("routes");
  const toggle = (leg: "ingress" | "egress") => onLegChange(activeLeg === leg ? "both" : leg);

  return (
    <motion.aside
      aria-label="Panel Operasi Taktis & Evakuasi"
      initial={reduce ? { opacity: 0 } : { opacity: 0, y: 12, scale: 0.98 }}
      animate={{ opacity: 1, y: 0, scale: 1, transition: { duration: 0.18, ease: [0.23, 1, 0.32, 1] } }}
      exit={reduce ? { opacity: 0 } : { opacity: 0, y: 8, scale: 0.98, transition: { duration: 0.12, ease: "easeOut" } }}
      className="pointer-events-auto absolute bottom-3 left-3 z-30 flex max-h-[calc(100%-1.5rem)] w-[min(400px,calc(100%-1.5rem))] flex-col gap-3 rounded-2xl bg-background-secondary-default p-4 shadow-dropdown"
    >
      <header className="flex items-start gap-3">
        <span className="grid size-9 shrink-0 place-items-center rounded-2lg bg-status-cyan-background text-status-cyan-text">
          <RiRouteLine className="size-5" aria-hidden="true" />
        </span>
        <div className="min-w-0 flex-1">
          <h2 className="text-title-3-medium text-text-primary">Rute taktis & evakuasi</h2>
          <p className="truncate text-body-2-regular text-text-secondary">{plan.incidentTitle}</p>
        </div>
        <Button variant="ghost" size="xs" iconOnly leadingIcon={RiCloseLine} aria-label="Tutup rute taktis" onClick={onClose} />
      </header>

      <SegmentedControl
        aria-label="Isi panel rute"
        selectedKeys={[tab]}
        onSelectionChange={(keys) => {
          const next = Array.from(keys)[0];
          if (next === "routes" || next === "places") setTab(next);
        }}
        className="w-full"
      >
        <SegmentedControlItem id="routes" className="flex-1 text-caption-1-medium">Rute</SegmentedControlItem>
        <SegmentedControlItem id="places" className="flex-1 text-caption-1-medium">Tempat tujuan ({plan.tacticalPois.length})</SegmentedControlItem>
      </SegmentedControl>

      <div className="-mx-1 min-h-0 flex-1 overflow-y-auto px-1 [scrollbar-width:thin]">
        {tab === "routes" ? (
          <div className="flex flex-col gap-2">
            <LegCard leg={plan.ingressRoute} title={`Akses masuk dari ${plan.originLabel}`} pressed={activeLeg === "ingress"} onPress={() => toggle("ingress")} />
            <LegCard leg={plan.egressRoute} title={plan.egressRoute.label} pressed={activeLeg === "egress"} onPress={() => toggle("egress")} />
            {plan.windContext && (
              <p className="flex items-start gap-2 px-1 pt-1 text-body-2-regular text-text-secondary">
                <RiWindyLine className="mt-0.5 size-4 shrink-0 text-foreground-icon-secondary" aria-hidden="true" />
                <span>
                  Angin {plan.windContext.speedKmh.toLocaleString("id-ID")} km/jam. {plan.windContext.advice}
                </span>
              </p>
            )}
          </div>
        ) : (
          <div className="flex flex-col gap-1.5">
            {plan.tacticalPois.length === 0 && (
              <p className="py-4 text-center text-body-2-regular text-text-secondary">Belum ada rumah sakit atau titik kumpul tercatat di sekitar kejadian.</p>
            )}
            {plan.tacticalPois.map((poi) => {
              const { icon: Icon, color } = poiStyle(poi);
              return (
                <button
                  key={poi.id}
                  type="button"
                  onClick={() => onFocusCoords(poi.coords)}
                  className={cx(INSET, "button-press-motion flex w-full items-center gap-3 p-2.5 text-left outline-none focus-visible:ring-2 focus-visible:ring-border-focus-ring")}
                >
                  <span style={{ backgroundColor: color }} className="grid size-8 shrink-0 place-items-center rounded-lg text-text-white">
                    <Icon className="size-4" aria-hidden="true" />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-body-medium text-text-primary">{poi.name}</span>
                    <span className="block truncate text-body-2-regular text-text-tertiary">{poi.note}</span>
                  </span>
                  <span className="shrink-0 text-body-2-medium tabular-nums text-text-secondary">{distance(poi.distanceMeters)}</span>
                </button>
              );
            })}
          </div>
        )}
      </div>

      <div className="flex flex-wrap gap-2">
        <Button variant="secondary" size="small" leadingIcon={RiMapPinLine} onClick={onChangeOrigin}>Ganti asal</Button>
        <Button variant="ghost" size="small" leadingIcon={RiFocus3Line} onClick={() => onFocusCoords(plan.incidentCoords)}>Fokus ke kejadian</Button>
      </div>
    </motion.aside>
  );
}
