import { useState, type ReactNode } from "react";
import { SegmentedControl, SegmentedControlItem } from "@/components/base/segmented-control/segmented-control";
import { EmptyState } from "@/components/ui/empty-state";
import { Skeleton } from "@/components/ui/skeleton";

/**
 * Shared frame for every data display: title, context line, badges, and an optional
 * Chart/Table switch so values are never readable from color alone.
 */
export function ChartCard({ title, description, meta, footer, table, loading, empty, children, className = "" }: {
  title: string;
  description?: ReactNode;
  /** Small badges beside the title, e.g. source or MODEL labels. */
  meta?: ReactNode;
  footer?: ReactNode;
  /** Accessible table view of the same data; adds a Grafik/Tabel switch. */
  table?: ReactNode;
  loading?: boolean;
  /** Shown instead of the chart when there is nothing to plot. */
  empty?: string | false;
  children?: ReactNode;
  className?: string;
}) {
  const [view, setView] = useState<"chart" | "table">("chart");
  return <section aria-label={title} className={`flex min-w-0 flex-col gap-3 rounded-xl border border-border-button-default bg-background-primary-default p-4 ${className}`}>
    <header className="flex flex-wrap items-start justify-between gap-2">
      <div className="min-w-0 flex-1">
        <h3 className="truncate text-heading-sm text-text-primary">{title}</h3>
        {(description || meta) && <div className="mt-0.5 flex flex-wrap items-center gap-1.5 text-caption-1 text-text-secondary">{description && <span>{description}</span>}{meta}</div>}
      </div>
      <div className="shrink-0">
        {table && !loading && !empty && <SegmentedControl aria-label={`Tampilan ${title}`} selectedKeys={new Set([view])}
          onSelectionChange={keys => { const next = [...keys][0]; if (next === "chart" || next === "table") setView(next); }}>
          <SegmentedControlItem id="chart">Grafik</SegmentedControlItem>
          <SegmentedControlItem id="table">Tabel</SegmentedControlItem>
        </SegmentedControl>}
      </div>
    </header>
    {loading ? <Skeleton className="h-40 w-full" /> : empty ? <EmptyState title={empty} /> : view === "table" && table ? table : children}
    {footer && <footer className="text-caption-1 text-text-secondary">{footer}</footer>}
  </section>;
}

/** Plain two-or-more column table for chart table views and key/value readouts. */
export function ValueTable({ columns, rows, caption }: { columns: string[]; rows: ReactNode[][]; caption?: string }) {
  return <div className="max-h-64 overflow-auto rounded-lg border border-border-button-default">
    <table className="w-full text-left text-body-compact">
      {caption && <caption className="sr-only">{caption}</caption>}
      <thead className="sticky top-0 bg-background-secondary-default text-text-secondary">
        <tr>{columns.map((column, index) => <th key={column} scope="col" className={`px-3 py-2 font-medium ${index > 0 ? "text-right" : ""}`}>{column}</th>)}</tr>
      </thead>
      <tbody>{rows.map((row, rowIndex) => <tr key={rowIndex} className="border-t border-border-button-default">
        {row.map((cell, index) => <td key={index} className={`px-3 py-2 text-text-primary ${index > 0 ? "text-right tabular-nums" : ""}`}>{cell}</td>)}
      </tr>)}</tbody>
    </table>
  </div>;
}
