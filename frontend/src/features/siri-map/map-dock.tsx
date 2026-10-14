"use client";

import type { ComponentType, CSSProperties, ReactElement } from "react";
import { RiDashboardLine, RiSidebarFoldLine, RiSidebarUnfoldLine } from "@remixicon/react";
import { ThemeToggle } from "@/components/application/theme/theme-toggle";
import { ArkamapMark } from "@/components/foundations/brand/arkamap-brand";
import { KodamaMark } from "@/components/foundations/brand/kodama-icon";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { cx } from "@/utils/cx";
import { HAZARDS, HAZARD_ORDER } from "./hazards";
import type { HazardType } from "./types";

type DockIcon = ComponentType<{ className?: string; "aria-hidden"?: boolean | "true" | "false" }>;

const integer = new Intl.NumberFormat("id-ID");
const QUIET = "text-foreground-icon-secondary hover:bg-background-primary-hover hover:text-foreground-icon-primary";
const FOCUS = "outline-none focus-visible:ring-2 focus-visible:ring-border-focus-ring";

function DockTooltip({ label, children }: { label: string; children: ReactElement }) {
  return (
    <Tooltip>
      <TooltipTrigger render={children} />
      <TooltipContent side="top">{label}</TooltipContent>
    </Tooltip>
  );
}

/**
 * One filter in the strip. The count makes the strip a summary as well as a
 * filter; the pressed chip takes its hazard colour and spells out its name,
 * the others stay icon + count so all seven fit on a laptop.
 */
function FilterChip({ label, title, icon: Icon, count, pressed, color, onClick }: {
  label: string;
  title: string;
  icon: DockIcon;
  count: number | null;
  pressed: boolean;
  /** Hazard hex; omitted for "Semua", which uses the raised surface instead. */
  color?: string;
  onClick: () => void;
}) {
  const empty = count === 0 && !pressed;
  return (
    <DockTooltip label={count == null ? title : `${title}: ${integer.format(count)}`}>
      <button
        type="button"
        aria-pressed={pressed}
        aria-label={count == null ? title : `${title}, ${integer.format(count)} kejadian`}
        onClick={onClick}
        style={pressed && color ? ({ backgroundColor: color } as CSSProperties) : undefined}
        className={cx(
          "button-press-motion flex h-9 shrink-0 items-center gap-1.5 rounded-full px-2.5 transition-[background-color,color,box-shadow] duration-200 ease-out motion-reduce:transition-none",
          FOCUS,
          pressed
            ? color ? "text-text-white shadow-sm" : "bg-background-primary-default text-text-primary shadow-card"
            : cx("text-text-secondary hover:bg-background-primary-hover hover:text-text-primary", empty && "opacity-55"),
        )}
      >
        {color && !pressed ? (
          // Unpressed hazards keep their colour on the icon so the strip still reads as the map legend.
          <span style={{ color }} className="grid place-items-center"><Icon className="size-4" aria-hidden="true" /></span>
        ) : (
          <Icon className="size-4 shrink-0" aria-hidden="true" />
        )}
        <span className={cx("whitespace-nowrap text-body-2-medium", !pressed && "hidden 2xl:inline")}>{label}</span>
        {count != null && (
          <span className={cx("text-body-2-medium tabular-nums", pressed ? "opacity-85" : "text-text-tertiary")}>{integer.format(count)}</span>
        )}
      </button>
    </DockTooltip>
  );
}

interface MapDockProps {
  activeHazard: HazardType | "all";
  onSelectHazard: (hazard: HazardType | "all") => void;
  /** Incidents per hazard that match the search, before the hazard filter; null while loading. */
  counts: Record<HazardType, number> | null;
  isSidebarOpen: boolean;
  onToggleSidebar: () => void;
  isAssistantActive: boolean;
  onToggleAssistant: () => void;
}

export function MapDock({
  activeHazard,
  onSelectHazard,
  counts,
  isSidebarOpen,
  onToggleSidebar,
  isAssistantActive,
  onToggleAssistant,
}: MapDockProps) {
  const total = counts ? HAZARD_ORDER.reduce((sum, type) => sum + counts[type], 0) : null;
  const PanelIcon = isSidebarOpen ? RiSidebarFoldLine : RiSidebarUnfoldLine;

  return (
    <footer aria-label="Navigasi peta" className="relative z-30 flex h-12 w-full shrink-0 select-none items-center gap-2">
      <div className="flex shrink-0 items-center gap-1 md:flex-1">
        <button
          type="button"
          aria-pressed={isAssistantActive}
          aria-label="Tanya Kodama"
          onClick={onToggleAssistant}
          className={cx(
            "button-press-motion flex h-10 shrink-0 items-center gap-2 rounded-full pr-1.5 pl-1.5 lg:pr-3.5",
            FOCUS,
            isAssistantActive
              ? "bg-linear-to-b from-accent-500 to-accent-600 text-text-white shadow-nav-selected"
              : "bg-background-secondary-default text-text-primary shadow-sidebar hover:bg-background-secondary-hover",
          )}
        >
          <KodamaMark className="size-7" />
          <span className="hidden text-body-medium lg:inline">Tanya Kodama</span>
        </button>
        <div className="hidden md:block">
          <ThemeToggle collapsed />
        </div>
      </div>

      {/* The one loud element: what the map shows, filterable, with live counts. */}
      <nav
        aria-label="Filter jenis kejadian"
        className="flex min-w-0 flex-1 items-center gap-0.5 overflow-x-auto rounded-full bg-background-secondary-default p-1 shadow-sidebar [scrollbar-width:none] md:flex-none"
      >
        <FilterChip
          label="Semua"
          title="Semua kejadian"
          icon={RiDashboardLine}
          count={total}
          pressed={activeHazard === "all"}
          onClick={() => onSelectHazard("all")}
        />
        <span aria-hidden className="mx-1 h-5 w-px shrink-0 bg-border-button-default" />
        {HAZARD_ORDER.map((type) => (
          <FilterChip
            key={type}
            label={HAZARDS[type].label}
            title={HAZARDS[type].filterLabel}
            icon={HAZARDS[type].icon}
            count={counts?.[type] ?? null}
            color={HAZARDS[type].color}
            pressed={activeHazard === type}
            onClick={() => onSelectHazard(activeHazard === type ? "all" : type)}
          />
        ))}
      </nav>

      <div className="flex shrink-0 items-center justify-end gap-1 md:flex-1">
        <a
          href="/dashboard"
          title="Kembali ke dashboard"
          aria-label="Arkamap, kembali ke dashboard"
          className={cx("button-press-motion grid size-10 shrink-0 place-items-center rounded-xl text-text-primary hover:bg-background-primary-hover", FOCUS)}
        >
          <ArkamapMark className="size-6.5" />
        </a>
        <DockTooltip label={isSidebarOpen ? "Sembunyikan panel" : "Buka panel"}>
          <button
            type="button"
            aria-label={isSidebarOpen ? "Sembunyikan panel" : "Buka panel"}
            aria-pressed={isSidebarOpen}
            onClick={onToggleSidebar}
            className={cx("button-press-motion grid size-9 shrink-0 place-items-center rounded-xl", FOCUS, QUIET)}
          >
            {/* The panel sits right of the map, so the icon is mirrored to point that way. */}
            <PanelIcon className="size-5 -scale-x-100" aria-hidden="true" />
          </button>
        </DockTooltip>
      </div>
    </footer>
  );
}
