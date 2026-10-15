import { RiArrowRightSLine } from "@remixicon/react";
import { cx } from "@/utils/cx";
import { TONE, type AlertLevel, type RowStatus } from "../alert-level";
import { AlertArt, type AlertKind } from "./alert-art";
import { insetClass } from "./dashboard-card";

const LEVEL: Record<AlertLevel, RowStatus> = { bahaya: { color: "rose", label: "Bahaya" }, waspada: { color: "yellow", label: "Waspada" } };
/** The level as one coloured dot; the word beside it says it in text. */
export function LevelMark({ color, className }: { color: RowStatus["color"]; className?: string }) {
  return <span aria-hidden className={cx("size-2 shrink-0 rounded-full", TONE[color].dot, className)} />;
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
