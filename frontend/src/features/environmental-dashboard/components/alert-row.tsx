import type { ReactNode } from "react";
import { Chip } from "@/components/base/badges/chip";
import { cx } from "@/utils/cx";
import { LEVEL_CHIP, type AlertLevel } from "../alert-level";
import { insetClass } from "./dashboard-card";

/** One alert line, its level chip first. */
export function AlertRow({ level, chip, title, detail, meta, href }: {
  level?: AlertLevel;
  chip?: ReactNode;
  title: string;
  detail?: string | null;
  meta?: string | null;
  href?: string;
}) {
  const body = <>
    {level && <Chip variant="caption" color={LEVEL_CHIP[level].color}>{LEVEL_CHIP[level].label}</Chip>}
    {chip}
    <span className="flex min-w-0 flex-1 flex-col">
      <span className="truncate text-body-medium text-text-primary">{title}</span>
      {detail && <span className="truncate text-body-2-regular text-text-secondary">{detail}</span>}
    </span>
    {meta && <span className="shrink-0 text-body-2-regular text-text-secondary">{meta}</span>}
  </>;
  const className = cx(insetClass, "flex items-center gap-2 px-3 py-2");
  return <li>{href
    ? <a href={href} className={cx(className, "outline-none hover:bg-background-secondary-hover focus-visible:ring-2 focus-visible:ring-border-focus-ring")}>{body}</a>
    : <div className={className}>{body}</div>}</li>;
}
