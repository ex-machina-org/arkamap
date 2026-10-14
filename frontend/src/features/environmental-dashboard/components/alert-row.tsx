import type { ReactNode } from "react";
import { cx } from "@/utils/cx";
import type { AlertTone } from "../alert-level";
import { insetClass } from "./dashboard-card";

const DOT: Record<AlertTone, string> = {
  bahaya: "bg-status-solid-danger",
  waspada: "bg-status-solid-warning",
  aman: "bg-status-solid-success",
  netral: "bg-status-solid-neutral",
};
const LABEL: Record<AlertTone, string> = { bahaya: "Bahaya", waspada: "Waspada", aman: "Aman", netral: "" };

/** One alert line: a status dot, a short text tag, then the title and detail. */
export function AlertRow({ level = "netral", tag, title, detail, meta, href }: {
  level?: AlertTone;
  /** Shown beside the dot in place of the level's own word, e.g. the source ("GDACS"). */
  tag?: ReactNode;
  title: string;
  detail?: string | null;
  meta?: string | null;
  href?: string;
}) {
  const body = <>
    <span className="flex shrink-0 items-center gap-2">
      <span aria-hidden className={cx("size-2.5 shrink-0 rounded-full", DOT[level])} />
      {LABEL[level] && <span className="sr-only">{LABEL[level]}</span>}
      {(tag ?? LABEL[level]) && <span aria-hidden={!tag} className="min-w-12 text-caption-1 text-text-secondary">{tag ?? LABEL[level]}</span>}
    </span>
    <span className="flex min-w-0 flex-1 flex-col">
      <span className="truncate text-body-medium text-text-primary">{title}</span>
      {detail && <span className="truncate text-body-2-regular text-text-secondary">{detail}</span>}
    </span>
    {meta && <span className="shrink-0 text-body-2-regular text-text-secondary">{meta}</span>}
  </>;
  const className = cx(insetClass, "flex items-center gap-3 px-3 py-2");
  return <li>{href
    ? <a href={href} className={cx(className, "outline-none hover:bg-background-secondary-hover focus-visible:ring-2 focus-visible:ring-border-focus-ring")}>{body}</a>
    : <div className={className}>{body}</div>}</li>;
}
