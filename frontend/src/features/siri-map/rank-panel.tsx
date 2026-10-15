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
  const unit = layer.metric.unit && !layer.metric.unit.startsWith("indeks") ? layer.metric.unit : "";
  return (
    <div className="space-y-2">
      <p className="text-caption-1-regular text-text-tertiary">
        <span className="text-caption-1-medium text-text-secondary">{label ?? layer.metric.label}</span>{unit ? `, dalam ${unit}` : ""}. Panjang bar dan warnanya sama dengan warna wilayah di peta.
      </p>
      <ol className="space-y-0.5">
        {shown.map((row, i) => {
          const on = row.id === selectedRegionId;
          const color = rampAt(stops, row.norm / 100);
          return (
            <li key={row.id}>
              <button type="button" aria-current={on || undefined} aria-label={`${i + 1}. ${row.name}, ${fmtAuto(row.value)}${unit ? ` ${unit}` : ""}`} onClick={() => onSelect(row.id)} className={cx("button-press-motion grid w-full grid-cols-[1.25rem_minmax(0,1fr)_auto] items-center gap-x-2.5 gap-y-1 rounded-lg px-2 py-1.5 text-left outline-none focus-visible:ring-2 focus-visible:ring-border-focus-ring", on ? "bg-background-primary-active" : "hover:bg-background-primary-hover")}>
                <span className="row-span-2 text-right text-caption-1-regular tabular-nums text-text-tertiary">{i + 1}</span>
                <span className="truncate text-body-medium text-text-primary">{row.name}</span>
                <span className="row-span-2 text-body-semibold tabular-nums text-text-primary">{fmtAuto(row.value)}</span>
                {/* Length is the region's place on the layer's 0-100 scale, colour the one it has on the map. */}
                <span aria-hidden="true" className="h-1 overflow-hidden rounded-full bg-background-tertiary-default">
                  <span className="block h-full rounded-full" style={{ width: `${Math.max(2, Math.min(100, row.norm))}%`, backgroundColor: color }} />
                </span>
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
