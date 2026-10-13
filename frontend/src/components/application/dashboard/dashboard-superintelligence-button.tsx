"use client";

import { ComposerLoader } from "@/components/application/composer-loader/composer-loader";
import { KodamaIcon, KodamaMark } from "@/components/foundations/brand/kodama-icon";
import { cx } from "@/utils/cx";

export interface DashboardSuperintelligenceButtonProps {
  collapsed?: boolean;
  isSelected?: boolean;
  onClick?: () => void;
  className?: string;
  active?: boolean;
}

export function DashboardSuperintelligenceButton({
  collapsed = false,
  isSelected = false,
  onClick,
  className,
  active = true,
}: DashboardSuperintelligenceButtonProps) {
  // Primary green colors for unselected glow effect vs white/accent highlight for selected state
  const loaderColors: [string, string, string, string] = isSelected
    ? ["#a7f3d0", "#ffffff", "#6ee7b7", "#34d399"]
    : ["#00bc7d", "#34d399", "#009966", "#10b981"];

  if (collapsed) {
    return (
      <div className={cx("flex w-full items-center justify-center", className)}>
        <div
          className={cx(
            "relative size-9 shrink-0 overflow-hidden rounded-full transition-all duration-200",
            isSelected
              ? "bg-linear-to-b from-accent-500 to-accent-600 shadow-nav-selected"
              : "border border-border-button-default bg-background-primary-default shadow-xs hover:border-accent-500/50 hover:bg-background-secondary-hover",
          )}
        >
          <ComposerLoader
            active={active}
            radius={18}
            speed={3.5}
            intensity={1}
            bloom={12}
            bloomStrength={isSelected ? 0.45 : 0.55}
            line={2.5}
            colors={loaderColors}
            surface={false}
            className="size-9"
          >
            <a
              href="/chat"
              onClick={onClick}
              aria-label="Tanya Kodama"
              title="Tanya Kodama"
              className={cx(
                "flex size-9 items-center justify-center bg-transparent outline-none select-none",
                isSelected ? "text-white" : "text-accent-500 dark:text-accent-400",
              )}
            >
              {isSelected ? <KodamaIcon className="size-6 text-white" /> : <KodamaMark className="size-6" />}
            </a>
          </ComposerLoader>
        </div>
      </div>
    );
  }

  return (
    <div className={cx("w-full", className)}>
      <div
        className={cx(
          "relative h-9 w-full overflow-hidden rounded-2lg transition-all duration-200",
          isSelected
            ? "bg-linear-to-b from-accent-500 to-accent-600 shadow-nav-selected"
            : "border border-border-button-default bg-background-primary-default shadow-xs hover:border-accent-500/50 hover:bg-background-secondary-hover",
        )}
      >
        <ComposerLoader
          active={active}
          radius={10}
          speed={3.8}
          intensity={1}
          bloom={14}
          bloomStrength={isSelected ? 0.45 : 0.55}
          line={2.5}
          colors={loaderColors}
          surface={false}
          className="h-9 w-full"
        >
          <a
            href="/chat"
            onClick={onClick}
            aria-label="Tanya Kodama"
            className={cx(
              "flex h-9 w-full items-center gap-2 py-2 pr-2 pl-1.5 bg-transparent outline-none select-none transition-opacity duration-150 hover:opacity-95",
              isSelected ? "text-white" : "text-text-primary",
            )}
          >
            {isSelected ? <KodamaIcon className="size-6 -translate-y-px text-white" /> : <KodamaMark className="size-6 -translate-y-px" />}
            <span
              className={cx(
                "text-body-medium whitespace-nowrap",
                isSelected ? "text-white" : "text-text-primary",
              )}
            >
              Tanya Kodama
            </span>
          </a>
        </ComposerLoader>
      </div>
    </div>
  );
}
