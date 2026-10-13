"use client";

import { useEffect, useState, type ComponentType, type ReactNode } from "react";
import {
  RiCheckLine,
  RiCompass3Line,
  RiDashboardLine,
  RiFireLine,
  RiShieldCheckLine,
} from "@remixicon/react";
import {
  Button as AriaButton,
  Dialog as AriaDialog,
  DialogTrigger as AriaDialogTrigger,
  Popover as AriaPopover,
} from "react-aria-components";
import { ChevronUpDownSmall } from "@/components/foundations/icons/chevrons";
import { cx } from "@/utils/cx";

export type EnvironmentalMode = "all" | "responder" | "protect" | "plan";

export interface ModeConfig {
  id: EnvironmentalMode;
  label: string;
  icon: ComponentType<{ className?: string; "aria-hidden"?: boolean | "true" | "false" }>;
  color: string;
}

export const ENVIRONMENTAL_MODES: ModeConfig[] = [
  {
    id: "all",
    label: "Arkamap Command",
    icon: RiDashboardLine,
    color: "text-foreground-icon-secondary",
  },
  {
    id: "responder",
    label: "Responder Mode",
    icon: RiFireLine,
    color: "text-text-error-primary",
  },
  {
    id: "protect",
    label: "Protect Mode",
    icon: RiShieldCheckLine,
    color: "text-warning",
  },
  {
    id: "plan",
    label: "Plan Mode",
    icon: RiCompass3Line,
    color: "text-success",
  },
];

function Collapsible({ collapsed, children }: { collapsed: boolean; children: ReactNode }) {
  return (
    <span
      className={cx(
        "flex min-w-0 items-center overflow-hidden transition-[max-width,opacity,filter] duration-300 ease-in-out",
        collapsed ? "max-w-0 opacity-0 blur-[3px]" : "max-w-44 opacity-100 blur-0",
      )}
    >
      {children}
    </span>
  );
}

export function DashboardModeSwitcher({
  collapsed = false,
  activeMode = "all",
  onModeChange,
  suppressHover = false,
  onHoverSuppressionEnd,
  className,
}: {
  collapsed?: boolean;
  activeMode?: EnvironmentalMode;
  onModeChange?: (mode: EnvironmentalMode) => void;
  suppressHover?: boolean;
  onHoverSuppressionEnd?: () => void;
  className?: string;
}) {
  const [isOpen, setIsOpen] = useState(false);
  const [internalMode, setInternalMode] = useState<EnvironmentalMode>(activeMode);
  const [isMobile, setIsMobile] = useState(false);

  useEffect(() => {
    setInternalMode(activeMode);
  }, [activeMode]);

  useEffect(() => {
    const mq = window.matchMedia("(max-width: 639px)");
    setIsMobile(mq.matches);
    const onChange = (e: MediaQueryListEvent) => setIsMobile(e.matches);
    mq.addEventListener("change", onChange);
    return () => mq.removeEventListener("change", onChange);
  }, []);

  const currentConfig =
    ENVIRONMENTAL_MODES.find((m) => m.id === internalMode) || ENVIRONMENTAL_MODES[0];
  const CurrentIcon = currentConfig.icon;

  function selectMode(mode: EnvironmentalMode) {
    setInternalMode(mode);
    onModeChange?.(mode);
    setIsOpen(false);
  }

  return (
    <AriaDialogTrigger isOpen={isOpen} onOpenChange={setIsOpen}>
      <AriaButton
        aria-label={`Mode: ${currentConfig.label}`}
        onPointerLeave={() => {
          if (suppressHover) onHoverSuppressionEnd?.();
        }}
        className={cx(
          "relative flex min-w-0 cursor-pointer items-center gap-2 rounded-full outline-none",
          "focus-visible:ring-2 focus-visible:ring-border-focus-ring focus-visible:ring-offset-2",
          "before:pointer-events-none before:absolute before:-inset-x-1.5 before:-inset-y-[5px] before:rounded-full before:border-2 before:border-transparent before:transition-colors before:duration-150",
          !suppressHover && "hover:before:border-border-sidebar-profile-hover",
          collapsed && "w-9 justify-center gap-0 before:-inset-x-[3px]",
          className,
        )}
      >
        <span className="flex size-8 shrink-0 items-center justify-center rounded-full bg-background-tertiary-default text-text-primary">
          <CurrentIcon className={cx("size-4.5 shrink-0", currentConfig.color)} aria-hidden />
        </span>
        <Collapsible collapsed={collapsed}>
          <span className="flex items-center gap-0.5">
            <span className="text-body-medium whitespace-nowrap text-text-primary">
              {currentConfig.label}
            </span>
            <ChevronUpDownSmall className="size-4 shrink-0 text-foreground-icon-tertiary" />
          </span>
        </Collapsible>
      </AriaButton>

      <AriaPopover
        placement={isMobile ? "bottom start" : "right top"}
        offset={8}
        className={cx(
          "w-52 max-w-[calc(100vw-32px)] origin-top-left overflow-hidden",
          "rounded-2xl border border-border-button-default bg-background-primary-default p-1.5 shadow-dropdown z-[90]",
          "transition duration-150 ease-out",
          "data-[entering]:opacity-0 data-[entering]:scale-95 data-[entering]:blur-[2px]",
          "data-[exiting]:opacity-0 data-[exiting]:scale-95 data-[exiting]:blur-[2px]",
        )}
      >
        <AriaDialog aria-label="Pilih Mode" className="flex flex-col gap-0.5 outline-none">
          <div className="px-2 pt-1 pb-1.5 text-[11px] font-semibold uppercase tracking-wider text-text-tertiary">
            Mode Operasi
          </div>
          {ENVIRONMENTAL_MODES.map((mode) => {
            const Icon = mode.icon;
            const isSelected = mode.id === internalMode;
            return (
              <button
                key={mode.id}
                type="button"
                onClick={() => selectMode(mode.id)}
                className={cx(
                  "flex w-full cursor-pointer items-center justify-between gap-2 rounded-lg px-2 py-1.5 text-left outline-none transition-colors",
                  isSelected
                    ? "bg-background-tertiary-default text-text-primary font-medium"
                    : "text-text-secondary hover:bg-background-tertiary-hover hover:text-text-primary",
                )}
              >
                <div className="flex min-w-0 items-center gap-2">
                  <Icon className={cx("size-4 shrink-0", mode.color)} aria-hidden />
                  <span className="truncate text-body-medium">{mode.label}</span>
                </div>
                {isSelected && (
                  <RiCheckLine className="size-4 shrink-0 text-accent-500" aria-hidden />
                )}
              </button>
            );
          })}
        </AriaDialog>
      </AriaPopover>
    </AriaDialogTrigger>
  );
}
