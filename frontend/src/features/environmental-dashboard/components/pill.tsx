import type { ComponentType, ReactNode } from "react";
import { cx } from "@/utils/cx";

const DOT = { green: "bg-green-500", red: "bg-red-500", amber: "bg-amber-400", grey: "bg-neutral-400 dark:bg-neutral-500" } as const;

/**
 * A neutral table pill (white, thin outline, plain text) whose only colour is a small accent:
 * a status dot (`pulse` for a live state) or an icon. Used by the device and data source tables.
 */
export function Pill({ dot, pulse, icon: Icon, iconClassName, children }: {
  dot?: keyof typeof DOT;
  pulse?: boolean;
  icon?: ComponentType<{ className?: string; "aria-hidden"?: boolean | "true" | "false" }>;
  /** The icon's accent colour, e.g. "text-purple-500". */
  iconClassName?: string;
  children: ReactNode;
}) {
  return <span className="inline-flex items-center gap-1.5 rounded-full bg-background-inner-default py-0.5 pr-2.5 pl-2 text-caption-1-medium whitespace-nowrap text-text-primary shadow-xs ring-1 ring-border-button-default ring-inset">
    {dot && <span className="relative flex size-2">
      {pulse && <span className={cx("absolute inset-0 animate-ping rounded-full opacity-60 motion-reduce:hidden", DOT[dot])} />}
      <span className={cx("relative size-2 rounded-full", DOT[dot])} />
    </span>}
    {Icon && <Icon className={cx("size-3.5", iconClassName)} aria-hidden />}
    {children}
  </span>;
}
