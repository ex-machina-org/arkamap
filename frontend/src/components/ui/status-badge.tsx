import type { HTMLAttributes } from "react";

type StatusTone = "neutral" | "success" | "warning" | "danger" | "info";
// the site's status palette (theme.css --color-status-*), the same one Chip uses, light and dark
const tones = {
  neutral: "bg-background-tertiary-default text-text-secondary",
  success: "bg-status-lime-background text-status-lime-text",
  warning: "bg-status-yellow-background text-status-yellow-text",
  danger: "bg-status-rose-background text-status-rose-text",
  info: "bg-status-blue-background text-status-blue-text",
} satisfies Record<StatusTone, string>;

export function StatusBadge({ tone = "neutral", dot = true, className = "", children, ...props }: HTMLAttributes<HTMLSpanElement> & { tone?: StatusTone; dot?: boolean }) {
  return <span className={`inline-flex items-center gap-1.5 rounded-md px-1.5 py-1 text-caption-1-medium ${tones[tone]} ${className}`} {...props}>
    {dot && <span className="size-1.5 shrink-0 rounded-full bg-current" aria-hidden />}{children}
  </span>;
}
