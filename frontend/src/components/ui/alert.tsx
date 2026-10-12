import type { HTMLAttributes, ReactNode } from "react";
import { RiCheckboxCircleLine, RiErrorWarningLine, RiInformationLine } from "@remixicon/react";

type AlertTone = "info" | "success" | "warning" | "danger";

const toneStyles = {
  info: "border-blue-200 bg-blue-50 text-blue-900 dark:border-blue-800 dark:bg-blue-950/40 dark:text-blue-200",
  success: "border-accent-200 bg-accent-50 text-accent-900 dark:border-accent-700 dark:bg-accent-950/40 dark:text-accent-200",
  warning: "border-amber-200 bg-amber-50 text-amber-900 dark:border-amber-800 dark:bg-amber-950/40 dark:text-amber-200",
  danger: "border-red-200 bg-red-50 text-red-900 dark:border-red-800 dark:bg-red-950/40 dark:text-red-200",
} satisfies Record<AlertTone, string>;

const icons = {
  info: RiInformationLine,
  success: RiCheckboxCircleLine,
  warning: RiErrorWarningLine,
  danger: RiErrorWarningLine,
};

export function Alert({ tone = "info", title, children, className = "", ...props }: HTMLAttributes<HTMLDivElement> & { tone?: AlertTone; title: string; children?: ReactNode }) {
  const Icon = icons[tone];
  return <div role={tone === "danger" ? "alert" : "status"} className={`flex gap-3 rounded-[12px] border p-4 text-sm ${toneStyles[tone]} ${className}`} {...props}>
    <Icon className="mt-0.5 size-5 shrink-0" aria-hidden />
    <div><p className="font-semibold">{title}</p>{children && <div className="mt-1 opacity-80">{children}</div>}</div>
  </div>;
}
