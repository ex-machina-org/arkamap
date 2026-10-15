import type React from "react";
import { RiArrowRightSLine } from "@remixicon/react";
import { cx } from "@/utils/cx";
import { TONE, type AlertLevel, type RowStatus } from "../alert-level";
import { AlertArt, type AlertKind } from "./alert-art";
import { insetClass } from "./dashboard-card";

const LEVEL: Record<AlertLevel, RowStatus> = { bahaya: { color: "rose", label: "Bahaya" }, waspada: { color: "yellow", label: "Waspada" } };
/**
 * One shape per level, after IBM Carbon's status shapes, so the level reads without colour:
 * octagon (stop) for bahaya, triangle for waspada, check circle for aman, hollow ring otherwise.
 */
export function LevelMark({ color, className }: { color: RowStatus["color"]; className?: string }) {
  const svg = (children: React.ReactNode, tone: string) =>
    <svg aria-hidden viewBox="0 0 16 16" className={cx("size-3.5 shrink-0", tone, className)}>{children}</svg>;
  switch (color) {
    case "rose": return svg(<>
      <path d="M5.2 1h5.6L15 5.2v5.6L10.8 15H5.2L1 10.8V5.2z" fill="currentColor" strokeLinejoin="round" stroke="currentColor" strokeWidth="1" />
      <rect x="7.2" y="3.9" width="1.6" height="5.4" rx="0.8" fill="#fff" />
      <circle cx="8" cy="11.6" r="0.95" fill="#fff" />
    </>, "text-red-600 dark:text-red-500");
    case "yellow": return svg(<>
      <path d="M8 1.6 15 14.2H1z" fill="currentColor" stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round" />
      <rect x="7.3" y="5.6" width="1.4" height="4.6" rx="0.7" fill="#3b2a00" />
      <circle cx="8" cy="12.1" r="0.85" fill="#3b2a00" />
    </>, "text-amber-400");
    case "lime": return svg(<>
      <circle cx="8" cy="8" r="7" fill="currentColor" />
      <path d="M4.9 8.3 7 10.3l4.2-4.5" fill="none" stroke="#fff" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" />
    </>, "text-green-600 dark:text-green-500");
    default: return svg(<circle cx="8" cy="8" r="5.5" fill="none" stroke="currentColor" strokeWidth="2" />, "text-neutral-400 dark:text-neutral-500");
  }
}

/**
 * One alert line, after incident lists (incident.io, PagerDuty): a tile with the hazard's drawing,
 * tinted by level; title, detail and a quiet tag line ("Satelit · M 5,2") in the middle; and on the
 * right the time or value, the level shape and word, and where the row goes. Bahaya pulses on the tile.
 */
export function AlertRow({ level, status, kind, tags = [], title, detail, meta, href, linkLabel = href?.startsWith("/map") ? "Lihat di peta" : "Buka" }: {
  level?: AlertLevel;
  /** For rows that are not alerts, e.g. a source that failed or a device that is offline; `level` wins. */
  status?: RowStatus;
  /** What the alert is about; picks the drawing (a Raspberry Pi 5 for devices, Kodama dressed for the hazard otherwise). */
  kind: AlertKind;
  /** Source and measure, e.g. "Satelit", "M 5,2", "62/100". Empty values are skipped. */
  tags?: (string | null | undefined | false)[];
  title: string;
  detail?: string | null;
  meta?: string | null;
  href?: string;
  /** Says where the row goes; shown at the end of the tag line. */
  linkLabel?: string;
}) {
  const s = level ? LEVEL[level] : status;
  const color = s?.color ?? "neutral";
  const words = tags.filter((tag): tag is string => Boolean(tag));
  const body = <>
    <span aria-hidden className={cx("relative flex size-10 shrink-0 items-end justify-center rounded-xl", TONE[color].tile)}>
      <AlertArt kind={kind} mood={color} />
      {color === "rose" && <span className="absolute -top-0.5 -right-0.5 flex size-2.5">
        <span className="absolute inset-0 animate-ping rounded-full bg-red-500 opacity-60 motion-reduce:hidden" />
        <span className="relative size-2.5 rounded-full bg-red-500 ring-2 ring-background-inner-default" />
      </span>}
    </span>
    <span className="flex min-w-0 flex-1 flex-col gap-0.5">
      <span className="truncate text-body-medium text-text-primary">{title}</span>
      {detail && <span className="truncate text-body-2-regular text-text-secondary">{detail}</span>}
      {!!words.length && <span className="flex min-w-0 flex-wrap items-center gap-x-1.5 text-caption-1 text-text-secondary">
        {words.map((word, index) => <span key={`${index}:${word}`} className="flex items-center gap-1.5">
          {index > 0 && <span aria-hidden>·</span>}
          {word}
        </span>)}
      </span>}
    </span>
    {/* Right column: when or how much, then the level, then where the row goes. */}
    <span className="flex shrink-0 flex-col items-end gap-1">
      {meta && <span className="text-caption-1 text-text-tertiary tabular-nums">{meta}</span>}
      {s && <span className="flex items-center gap-1.5 text-caption-1-medium text-text-primary"><LevelMark color={color} />{s.label}</span>}
      {href && <span className="flex items-center text-caption-1-medium text-text-tertiary group-hover:text-text-primary group-focus-visible:text-text-primary">
        {linkLabel}<RiArrowRightSLine aria-hidden className="-mr-1 size-4 transition-transform group-hover:translate-x-0.5 motion-reduce:transition-none" />
      </span>}
    </span>
  </>;
  const className = cx(insetClass, "flex items-start gap-3 p-2.5");
  return <li>{href
    ? <a href={href} {...(href.startsWith("http") && { target: "_blank", rel: "noreferrer" })} className={cx(className, "group outline-none hover:bg-background-secondary-hover focus-visible:ring-2 focus-visible:ring-border-focus-ring")}>{body}</a>
    : <div className={className}>{body}</div>}</li>;
}
