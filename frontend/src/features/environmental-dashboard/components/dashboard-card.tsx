import { useId, type ReactNode } from "react";
import { Chip } from "@/components/base/badges/chip";
import { EmptyState } from "@/components/ui/empty-state";
import { cx } from "@/utils/cx";

/** Outer container surface shared by every dashboard card (same as BoardUI StatCards and chart cards). */
export const cardClass = "flex min-w-0 flex-col gap-4 rounded-2xl bg-background-secondary-default p-4";

/** White inner tile in light mode (KPI inner-tile role), so insets read against the card body. */
export const insetClass = "rounded-2lg bg-background-inner-default shadow-card";

export type CardDelta = { label: string; color: "lime" | "rose" | "yellow" | "neutral" };

/**
 * BoardUI card anatomy: label over a large value with a delta chip, a control
 * on the right, the visual in the body, and inset legend tiles as the footer.
 * Without a `value` the title renders as a plain heading (list cards).
 */
export function DashboardCard({ title, value, delta, description, action, footer, children, className }: {
  title: string;
  value?: ReactNode;
  delta?: CardDelta;
  description?: ReactNode;
  action?: ReactNode;
  footer?: ReactNode;
  children?: ReactNode;
  className?: string;
}) {
  const id = useId();
  return <section aria-labelledby={id} className={cx(cardClass, "h-full", className)}>
    <header className="flex flex-wrap items-start justify-between gap-2">
      <div className="flex min-w-0 flex-col gap-0.5">
        {value != null ? <>
          <h3 id={id} className="text-body-medium text-text-secondary">{title}</h3>
          <div className="flex flex-wrap items-center gap-2">
            <p className="text-title-1-medium whitespace-nowrap text-text-primary tabular-nums">{value}</p>
            {delta && <Chip variant="bold" color={delta.color}>{delta.label}</Chip>}
          </div>
        </> : <h3 id={id} className="text-title-3-medium text-text-primary">{title}</h3>}
        {description && <p className="text-body-2-regular text-text-secondary">{description}</p>}
      </div>
      {action}
    </header>
    {children}
    {footer}
  </section>;
}

export type LegendItem = { key: string; label: string; value: ReactNode; color?: string; selected?: boolean; onSelect?: () => void };

/** Inset tiles under a chart: colour dot, label, and a figure. Tiles with `onSelect` act as toggle buttons. */
export function LegendTiles({ items }: { items: LegendItem[] }) {
  return <ul className="grid grid-cols-2 gap-2 sm:grid-cols-[repeat(auto-fit,minmax(8rem,1fr))]">{items.map(item => {
    const body = <>
      <span className="flex items-center gap-2 text-body-medium text-text-secondary">
        {item.color && <span aria-hidden className="size-2.5 shrink-0 rounded-sm" style={{ background: item.color }} />}
        <span className="truncate">{item.label}</span>
      </span>
      <span className="mt-1 block text-body-semibold text-text-primary tabular-nums">{item.value}</span>
    </>;
    return <li key={item.key} className="min-w-0">{item.onSelect
      ? <button type="button" aria-pressed={item.selected} onClick={item.onSelect}
        className={cx(insetClass, "w-full cursor-pointer p-3 text-left outline-none transition-shadow focus-visible:ring-2 focus-visible:ring-border-focus-ring", item.selected && "ring-2 ring-border-focus-ring")}>{body}</button>
      : <div className={cx(insetClass, "p-3")}>{body}</div>}</li>;
  })}</ul>;
}

/** Honest empty state: says what is missing and what to do next. */
export function PanelUnavailable({ title, description, action, className }: {
  title: string;
  description?: string;
  action?: ReactNode;
  className?: string;
}) {
  return <EmptyState title={title} description={description} action={action} className={cx("h-full", className)} />;
}
