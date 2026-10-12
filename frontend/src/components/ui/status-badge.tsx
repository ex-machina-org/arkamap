import type { HTMLAttributes } from "react";

type StatusTone = "neutral" | "success" | "warning" | "danger" | "info";
const tones = {
  neutral: "bg-background-secondary-default text-text-secondary ring-border-button-default",
  success: "bg-accent-50 text-accent-700 ring-accent-200 dark:bg-accent-950/50 dark:text-accent-300 dark:ring-accent-700",
  warning: "bg-amber-50 text-amber-800 ring-amber-200 dark:bg-amber-950/50 dark:text-amber-200 dark:ring-amber-800",
  danger: "bg-red-50 text-red-700 ring-red-200 dark:bg-red-950/50 dark:text-red-200 dark:ring-red-800",
  info: "bg-blue-50 text-blue-700 ring-blue-200 dark:bg-blue-950/50 dark:text-blue-200 dark:ring-blue-800",
} satisfies Record<StatusTone, string>;

export function StatusBadge({ tone = "neutral", dot = true, className = "", children, ...props }: HTMLAttributes<HTMLSpanElement> & { tone?: StatusTone; dot?: boolean }) {
  return <span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium ring-1 ring-inset ${tones[tone]} ${className}`} {...props}>
    {dot && <span className="size-1.5 rounded-full bg-current" aria-hidden />}{children}
  </span>;
}
