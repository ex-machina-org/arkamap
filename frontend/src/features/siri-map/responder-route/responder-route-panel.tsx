import { useState } from "react";
import { motion, useReducedMotion } from "motion/react";
import {
  RiCloseLine,
  RiFocus3Line,
  RiRouteLine,
  RiShieldCheckLine,
  RiWindyLine,
} from "@remixicon/react";
import { Button } from "@/components/base/buttons/button";
import { Badge } from "@/components/base/badges/badge";
import { StatusDot } from "@/components/base/badges/status-dot";
import { cx } from "@/utils/cx";
import { poiStyle, type TacticalPlan } from "./types";

interface ResponderRoutePanelProps {
  plan: TacticalPlan;
  activeLeg: "ingress" | "egress" | "both";
  onLegChange: (leg: "ingress" | "egress" | "both") => void;
  onFocusCoords: (coords: [number, number]) => void;
  onChangeOrigin: () => void;
  onClose: () => void;
}

export function ResponderRoutePanel({
  plan,
  activeLeg,
  onLegChange,
  onFocusCoords,
  onChangeOrigin,
  onClose,
}: ResponderRoutePanelProps) {
  const reduce = useReducedMotion();
  const [activeTab, setActiveTab] = useState<"overview" | "pois">("overview");

  return (
    <motion.aside
      aria-label="Panel Operasi Taktis & Evakuasi"
      initial={reduce ? { opacity: 0 } : { opacity: 0, y: 20, scale: 0.98 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      exit={reduce ? { opacity: 0 } : { opacity: 0, y: 16, scale: 0.98 }}
      transition={{ duration: 0.2, ease: "easeOut" }}
      className="pointer-events-auto absolute bottom-3 left-3 z-30 flex w-[min(460px,calc(100%-1.5rem))] flex-col gap-3 rounded-2xl border border-border-button-default bg-background-primary-default/95 p-4 shadow-dropdown backdrop-blur-md"
    >
      {/* Header bar */}
      <div className="flex items-start justify-between gap-2 border-b border-border-button-default pb-2.5">
        <div className="flex items-center gap-2">
          <span className="grid size-8 place-items-center rounded-lg bg-status-cyan-background text-status-cyan-text">
            <RiRouteLine className="size-4.5" aria-hidden="true" />
          </span>
          <div>
            <div className="flex items-center gap-1.5">
              <h2 className="text-body-semibold text-text-primary">
                Jalur Akses & Evakuasi
              </h2>
              <Badge color="primary">Jalur Jalan (OSM)</Badge>
            </div>
            <p className="flex items-center gap-1 text-caption-1-regular text-text-tertiary">
              <RiShieldCheckLine className="size-3.5 text-status-lime-text" aria-hidden="true" />
              <span>Memutar menjauhi bahaya & kepulan asap</span>
            </p>
          </div>
        </div>

        <div className="flex items-center gap-1">
          <Button
            variant="ghost"
            size="xs"
            onClick={onChangeOrigin}
            className="text-caption-1-medium"
          >
            Ganti Asal
          </Button>
          <Button
            variant="ghost"
            size="xs"
            iconOnly
            leadingIcon={RiCloseLine}
            aria-label="Tutup rute taktis"
            onClick={onClose}
          />
        </div>
      </div>

      {/* Target incident info */}
      <div className="flex items-center justify-between rounded-lg border border-border-button-default bg-background-secondary-default px-2.5 py-1.5 text-caption-1-regular">
        <div className="min-w-0 flex-1 truncate">
          <span className="text-text-tertiary">Target Insiden: </span>
          <span className="text-caption-1-medium text-text-primary">
            {plan.incidentTitle}
          </span>
        </div>
        <button
          type="button"
          onClick={() => onFocusCoords(plan.incidentCoords)}
          className="ml-2 inline-flex items-center gap-1 text-button-ghost-foreground hover:underline"
        >
          <RiFocus3Line className="size-3.5" aria-hidden="true" />
          <span>Fokus</span>
        </button>
      </div>

      {/* Sub-tabs: Ringkasan Rute vs Sumber Daya Taktis */}
      <div className="flex gap-1 border-b border-border-button-default pb-2">
        <Button
          variant={activeTab === "overview" ? "secondary" : "ghost"}
          size="xs"
          onClick={() => setActiveTab("overview")}
          className="flex-1"
        >
          Rute Intervensi
        </Button>
        <Button
          variant={activeTab === "pois" ? "secondary" : "ghost"}
          size="xs"
          onClick={() => setActiveTab("pois")}
          className="flex-1"
        >
          Fasilitas Terdekat ({plan.tacticalPois.length})
        </Button>
      </div>

      {activeTab === "overview" ? (
        <div className="flex flex-col gap-2.5">
          {/* Leg Selector buttons */}
          <div className="grid grid-cols-3 gap-1 rounded-lg bg-background-secondary-default p-1 text-caption-1-medium">
            <button
              type="button"
              onClick={() => onLegChange("both")}
              className={cx(
                "rounded-md py-1 transition-colors",
                activeLeg === "both"
                  ? "bg-background-primary-default text-caption-1-semibold text-text-primary shadow-2xs"
                  : "text-text-secondary hover:text-text-primary"
              )}
            >
              Semua Rute
            </button>
            <button
              type="button"
              onClick={() => onLegChange("ingress")}
              className={cx(
                "flex items-center justify-center gap-1 rounded-md py-1 transition-colors",
                activeLeg === "ingress"
                  ? "bg-background-primary-default text-caption-1-semibold text-text-primary shadow-2xs"
                  : "text-text-secondary hover:text-text-primary"
              )}
            >
              <span className="size-2 rounded-full bg-[#06b6d4]" />
              <span>Akses Masuk</span>
            </button>
            <button
              type="button"
              onClick={() => onLegChange("egress")}
              className={cx(
                "flex items-center justify-center gap-1 rounded-md py-1 transition-colors",
                activeLeg === "egress"
                  ? "bg-background-primary-default text-caption-1-semibold text-text-primary shadow-2xs"
                  : "text-text-secondary hover:text-text-primary"
              )}
            >
              <span className="size-2 rounded-full bg-[#10b981]" />
              <span>Evakuasi</span>
            </button>
          </div>

          {/* Ingress Card */}
          {(activeLeg === "both" || activeLeg === "ingress") && (
            <div className="rounded-2lg border border-border-button-default bg-background-primary-default p-3 shadow-2xs">
              <div className="flex items-center justify-between text-caption-1-semibold">
                <span className="flex items-center gap-1.5 text-text-primary">
                  <span className="size-2.5 rounded-full bg-[#06b6d4]" />
                  <span>Jalur Masuk Regu (Ingress)</span>
                </span>
                <span className="flex items-center gap-1 text-text-secondary">
                  <StatusDot color="green" />
                  <span>Jalur Terbuka</span>
                </span>
              </div>
              <div className="mt-2 flex items-baseline gap-3 text-body-medium">
                <div>
                  <span className="text-title-2-semibold text-text-primary">
                    {plan.ingressRoute.distanceKm}
                  </span>
                  <span className="ml-1 text-caption-1-regular text-text-tertiary">
                    km
                  </span>
                </div>
                <span className="text-text-tertiary">·</span>
                <div>
                  <span className="text-title-2-semibold text-text-primary">
                    ~{plan.ingressRoute.durationMinutes}
                  </span>
                  <span className="ml-1 text-caption-1-regular text-text-tertiary">
                    menit tiba (ETA)
                  </span>
                </div>
              </div>
              <p className="mt-1 text-caption-1-regular text-text-secondary">
                {plan.ingressRoute.summary}
              </p>
            </div>
          )}

          {/* Egress Card */}
          {(activeLeg === "both" || activeLeg === "egress") && (
            <div className="rounded-2lg border border-border-button-default bg-background-primary-default p-3 shadow-2xs">
              <div className="flex items-center justify-between text-caption-1-semibold">
                <span className="flex items-center gap-1.5 text-text-primary">
                  <span className="size-2.5 rounded-full bg-[#10b981]" />
                  <span>Koridor Evakuasi Warga (Egress)</span>
                </span>
                <span className="flex items-center gap-1 text-text-secondary">
                  <StatusDot color="green" />
                  <span>Aman dari Asap</span>
                </span>
              </div>
              <div className="mt-2 flex items-baseline gap-3 text-body-medium">
                <div>
                  <span className="text-title-2-semibold text-text-primary">
                    {plan.egressRoute.distanceKm}
                  </span>
                  <span className="ml-1 text-caption-1-regular text-text-tertiary">
                    km
                  </span>
                </div>
                <span className="text-text-tertiary">·</span>
                <div>
                  <span className="text-title-2-semibold text-text-primary">
                    ~{plan.egressRoute.durationMinutes}
                  </span>
                  <span className="ml-1 text-caption-1-regular text-text-tertiary">
                    menit
                  </span>
                </div>
              </div>
              <p className="mt-1 text-caption-1-regular text-text-secondary">
                {plan.egressRoute.summary}
              </p>
            </div>
          )}

          {/* Wind and smoke warning advice */}
          {plan.windContext && (
            <div className="flex items-start gap-2 rounded-lg border border-border-button-default bg-background-secondary-default p-2 text-caption-1-regular text-text-secondary">
              <RiWindyLine
                className="mt-0.5 size-4 shrink-0 text-status-cyan-text"
                aria-hidden="true"
              />
              <p className="min-w-0 flex-1">{plan.windContext.advice}</p>
            </div>
          )}
        </div>
      ) : (
        /* Tactical POI List tab */
        <div className="flex max-h-56 flex-col gap-1.5 overflow-y-auto pr-1">
          {plan.tacticalPois.map((poi) => {
            const { icon: Icon, textClass: iconClass } = poiStyle(poi);

            return (
              <div
                key={poi.id}
                className="flex items-center justify-between gap-2 rounded-2lg border border-border-button-default bg-background-primary-default p-2 text-caption-1-regular hover:bg-background-secondary-default"
              >
                <div className="flex min-w-0 items-center gap-2">
                  <span className={iconClass}>
                    <Icon className="size-4 shrink-0" aria-hidden="true" />
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-caption-1-medium text-text-primary">
                      {poi.name}
                    </p>
                    <p className="truncate text-text-tertiary">
                      {poi.distanceMeters} meter · {poi.note}
                    </p>
                  </div>
                </div>
                <Button
                  variant="ghost"
                  size="xs"
                  onClick={() => onFocusCoords(poi.coords)}
                  className="shrink-0 text-caption-2-medium"
                >
                  Lihat
                </Button>
              </div>
            );
          })}
        </div>
      )}
    </motion.aside>
  );
}
