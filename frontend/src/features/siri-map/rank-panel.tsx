import { useMemo, useState } from "react";
import { cx } from "@/utils/cx";
import { aspectOf, fmtAuto, rampAt, rampStopsFor, type MapLayer } from "./atlas";

const TOP = 12;

/**
 * Regions in the order the coloured layer's own values put them, without weighting. `normalised` already
 * encodes direction (100 always means needs attention), so high_good metrics sort correctly too.
 */
export function RankPanel({ layer, label, selectedRegionId, onSelect }: {
  layer?: MapLayer;
  label?: string;
  selectedRegionId: string | null;
  onSelect: (regionId: string) => void;
}) {
  const [all, setAll] = useState(false);
  const rows = useMemo(() => (layer?.features ?? [])
    .filter(feature => feature.properties.value != null)
    .map(feature => ({ id: feature.properties.region_id, name: feature.properties.name, value: feature.properties.value as number, norm: feature.properties.normalised ?? 0 }))
    .sort((a, b) => b.norm - a.norm), [layer]);
  if (!layer) return <p className="py-4 text-center text-body-2-regular text-text-secondary">Pilih data di "Jelajahi data" untuk melihat peringkat wilayah.</p>;
  if (!rows.length) return <p className="py-4 text-center text-body-2-regular text-text-secondary">Belum ada nilai untuk data ini.</p>;
  const stops = rampStopsFor(layer.metric.metric, aspectOf(layer.metric.aspect));
  const shown = all ? rows : rows.slice(0, TOP);
  return (
    <div className="space-y-2">
      <p className="text-body-2-regular text-text-secondary">{label ?? layer.metric.label}{layer.metric.unit ? ` (${layer.metric.unit})` : ""}, diurutkan dari data tanpa pembobotan.</p>
      <ol className="space-y-0.5">
        {shown.map((row, i) => {
          const on = row.id === selectedRegionId;
          return (
            <li key={row.id}>
              <button type="button" aria-current={on || undefined} onClick={() => onSelect(row.id)} className={cx("button-press-motion flex w-full items-center gap-3 rounded-lg px-2 py-1.5 text-left outline-none focus-visible:ring-2 focus-visible:ring-border-focus-ring", on ? "bg-background-primary-active" : "hover:bg-background-primary-hover")}>
                <span className="w-5 shrink-0 text-right text-caption-1-regular tabular-nums text-text-tertiary">{i + 1}</span>
                <span aria-hidden="true" className="size-2.5 shrink-0 rounded-full" style={{ backgroundColor: rampAt(stops, row.norm / 100) }} />
                <span className="min-w-0 flex-1 truncate text-body-medium text-text-primary">{row.name}</span>
                <span className="shrink-0 text-body-semibold tabular-nums text-text-primary">{fmtAuto(row.value)}</span>
              </button>
            </li>
          );
        })}
      </ol>
      {rows.length > TOP && (
        <button type="button" onClick={() => setAll(value => !value)} className="w-full rounded-lg py-1.5 text-center text-body-2-medium text-text-secondary outline-none hover:bg-background-primary-hover hover:text-text-primary focus-visible:ring-2 focus-visible:ring-border-focus-ring">
          {all ? `Tampilkan ${TOP} teratas` : `Tampilkan semua ${rows.length} wilayah`}
        </button>
      )}
    </div>
  );
}
