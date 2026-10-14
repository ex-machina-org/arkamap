import { cx } from "@/utils/cx";
import type { AlertLevel } from "../alert-level";
import { insetClass } from "./dashboard-card";

/** The only colour on a row is one dot, like a window's traffic lights: red, amber, green, or grey.
 *  Same palette steps as StatusDot; a faint inner edge keeps it crisp on light and dark panels. */
const TONE = {
  rose: { dot: "bg-red-500" },
  yellow: { dot: "bg-amber-400" },
  lime: { dot: "bg-green-500" },
  neutral: { dot: "bg-neutral-300 dark:bg-neutral-600" },
} as const;
export type RowStatus = { color: keyof typeof TONE; label: string };
const LEVEL: Record<AlertLevel, RowStatus> = { bahaya: { color: "rose", label: "Bahaya" }, waspada: { color: "yellow", label: "Waspada" } };

/**
 * One alert line: title and time on top, the detail below, then a quiet line of tags
 * ("Waspada · Satelit · M 5,2"). The level is one coloured dot plus its word, so a row
 * can be told apart at a glance without a row of coloured chips.
 */
export function AlertRow({ level, status, tags = [], title, detail, meta, href }: {
  level?: AlertLevel;
  /** For rows that are not alerts, e.g. a source that failed or a device that is offline; `level` wins. */
  status?: RowStatus;
  /** Source and measure, e.g. "Satelit", "M 5,2", "62/100". Empty values are skipped. */
  tags?: (string | null | undefined | false)[];
  title: string;
  detail?: string | null;
  meta?: string | null;
  href?: string;
}) {
  const s = level ? LEVEL[level] : status;
  const t = TONE[s?.color ?? "neutral"];
  const words = [s?.label, ...tags].filter((tag): tag is string => Boolean(tag));
  const body = <>
    <span aria-hidden className={cx("absolute top-3.5 left-3 size-2.5 rounded-full shadow-[inset_0_0_0_0.5px_rgb(0_0_0/0.15)]", t.dot)} />
    <span className="flex min-w-0 items-baseline gap-2">
      <span className="min-w-0 flex-1 truncate text-body-medium text-text-primary">{title}</span>
      {meta && <span className="shrink-0 text-caption-1 text-text-tertiary tabular-nums">{meta}</span>}
    </span>
    {detail && <span className="truncate text-body-2-regular text-text-secondary">{detail}</span>}
    {!!words.length && <span className="flex min-w-0 flex-wrap items-center gap-x-1.5 text-caption-1 text-text-secondary">
      {words.map((word, index) => <span key={`${index}:${word}`} className="flex items-center gap-1.5">
        {index > 0 && <span aria-hidden>·</span>}
        <span className={index === 0 && s ? "text-caption-1-medium text-text-primary" : undefined}>{word}</span>
      </span>)}
    </span>}
  </>;
  const className = cx(insetClass, "relative flex flex-col gap-0.5 py-2 pr-3 pl-8");
  return <li>{href
    ? <a href={href} className={cx(className, "outline-none hover:bg-background-secondary-hover focus-visible:ring-2 focus-visible:ring-border-focus-ring")}>{body}</a>
    : <div className={className}>{body}</div>}</li>;
}
