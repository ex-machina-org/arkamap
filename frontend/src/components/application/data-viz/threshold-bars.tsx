import { StatusBadge } from "@/components/ui/status-badge";
import { formatNumber, statusTone } from "./format";

export type ThresholdItem = { key: string; rank?: number | null; name: string; value: number; status?: { kategori: string; tingkat: number } | null; highlight?: boolean };
export type Limit = { value: number; label: string };

/**
 * Regions by their real value (µg/m³, not a score), each with its official category, and the
 * limits drawn as lines across every bar so "over the limit" reads at a glance. A row outside
 * the top (the region under discussion) follows after a gap, with its own rank.
 */
export function ThresholdBars({ items, unit, limits = [], label }: { items: ThresholdItem[]; unit?: string | null; limits?: Limit[]; label: string }) {
  const max = Math.max(...items.map(item => item.value), ...limits.map(limit => limit.value), 1);
  const at = (value: number) => `${Math.min(100, (value / max) * 100)}%`;
  return <div className="flex flex-col gap-2" role="list" aria-label={label}>
    {limits.length > 0 && <p className="flex flex-wrap gap-x-3 gap-y-1 text-caption-1 text-text-secondary">
      {limits.map((limit, index) => <span key={limit.label} className="flex items-center gap-1.5">
        <span className={`h-3 w-0 border-l ${index === 0 ? "border-text-primary" : "border-dashed border-text-tertiary"}`} aria-hidden />
        {limit.label} {formatNumber(limit.value)}{unit ? ` ${unit}` : ""}
      </span>)}
    </p>}
    {items.map((item, index) => {
      const gap = index > 0 && item.rank != null && items[index - 1].rank != null && item.rank - (items[index - 1].rank ?? 0) > 1;
      return <div key={item.key} role="listitem">
        {gap && <p className="py-0.5 pl-7 text-caption-1 text-text-tertiary" aria-hidden>⋯</p>}
        <div className={`grid grid-cols-[1.75rem_minmax(0,8rem)_minmax(3rem,1fr)_6.5rem] items-center gap-x-2 gap-y-1 rounded-lg px-1 py-1 sm:grid-cols-[1.75rem_minmax(0,10rem)_minmax(4rem,1fr)_6.5rem_9rem] ${item.highlight ? "bg-background-secondary-default ring-1 ring-inset ring-border-button-default" : ""}`}>
          <span className="text-caption-1 tabular-nums text-text-tertiary">{item.rank ?? ""}</span>
          <span className={`truncate text-body-compact ${item.highlight ? "font-semibold text-text-primary" : "text-text-primary"}`} title={item.name}>{item.name}</span>
          <span className="relative h-2.5 rounded-full bg-background-secondary-default" aria-hidden>
            <span className="absolute inset-y-0 left-0 rounded-full bg-[var(--color-series-1)]" style={{ width: at(item.value) }} />
            {limits.map((limit, li) => <span key={limit.label} className={`absolute -inset-y-1 border-l ${li === 0 ? "border-text-primary" : "border-dashed border-text-tertiary"}`} style={{ left: at(limit.value) }} />)}
          </span>
          <span className="text-right text-body-compact tabular-nums text-text-primary">{formatNumber(item.value)}{unit ? <span className="text-text-secondary"> {unit}</span> : null}</span>
          {item.status ? <StatusBadge tone={statusTone(item.status.tingkat)} title={item.status.kategori}
            className="col-start-2 col-end-5 w-fit max-w-full truncate sm:col-auto">{item.status.kategori}</StatusBadge> : <span className="hidden sm:block" />}
        </div>
      </div>;
    })}
  </div>;
}
