import { useMemo, useState } from "react";
import { RiArrowDownSLine, RiCalculatorLine, RiMapPinLine, RiUserLocationLine } from "@remixicon/react";
import { Input } from "@/components/base/input/input";
import { SegmentedControl, SegmentedControlItem } from "@/components/base/segmented-control/segmented-control";
import { cx } from "@/utils/cx";
import { ASPECTS, ASPECT_ORDER, LEVELS, aspectOf, isModelledMetric, metricIcon, type Level, type MetricDef } from "./atlas";

export interface RegionHit {
  id: string;
  name: string;
  parent: string | null;
}

const ROW = "button-press-motion flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-left outline-none focus-visible:ring-2 focus-visible:ring-border-focus-ring";

/**
 * Every metric the API publishes, grouped by aspect and searchable. It is built from `/metrics`, so a
 * metric added on the backend appears here without a frontend change.
 */
export function LayerRail({ metrics, active, onPick, level, onLevelChange, regions, onPickRegion }: {
  metrics: MetricDef[];
  /** "auto" follows the profile. */
  active: string;
  onPick: (metric: string) => void;
  level: Level;
  onLevelChange: (level: Level) => void;
  /** Every region of the coloured layer, so one can be found by name instead of hunted for on the map. */
  regions: RegionHit[];
  onPickRegion: (id: string) => void;
}) {
  const [query, setQuery] = useState("");
  const [closed, setClosed] = useState<Partial<Record<string, boolean>>>({});
  const needle = query.trim().toLowerCase();

  const regionHits = useMemo(() => (needle.length < 2 ? [] : regions.filter(region => region.name.toLowerCase().includes(needle)).slice(0, 6)), [needle, regions]);
  const metricHits = useMemo(() => (needle ? metrics.filter(metric => metric.label.toLowerCase().includes(needle) || metric.metric.includes(needle)) : null), [needle, metrics]);

  return (
    <div className="space-y-3">
      <Input label="Cari data atau wilayah" placeholder="Misal: hujan, PM2.5, Sleman" value={query} onChange={setQuery} />

      <div className="flex items-center justify-between gap-3">
        <span className="text-body-2-regular text-text-secondary">Tingkat wilayah</span>
        <SegmentedControl
          aria-label="Tingkat wilayah"
          selectedKeys={[level]}
          onSelectionChange={(keys) => {
            const next = Array.from(keys)[0];
            if (next === "provinsi" || next === "kabkota") onLevelChange(next);
          }}
        >
          {(Object.keys(LEVELS) as Level[]).map(id => <SegmentedControlItem key={id} id={id} className="px-3 text-caption-1-medium">{LEVELS[id]}</SegmentedControlItem>)}
        </SegmentedControl>
      </div>

      {regionHits.length > 0 && (
        <section>
          <h4 className="px-1 pb-1 text-caption-1-medium text-text-secondary">Wilayah</h4>
          {regionHits.map(region => (
            <button key={region.id} type="button" onClick={() => { onPickRegion(region.id); setQuery(""); }} className={cx(ROW, "hover:bg-background-primary-hover")}>
              <RiMapPinLine className="size-4 shrink-0 text-foreground-icon-secondary" aria-hidden="true" />
              <span className="min-w-0 flex-1">
                <span className="block truncate text-body-medium text-text-primary">{region.name}</span>
                {region.parent && <span className="block truncate text-caption-1-regular capitalize text-text-tertiary">{region.parent}</span>}
              </span>
            </button>
          ))}
        </section>
      )}

      {!metricHits && (
        <button type="button" aria-pressed={active === "auto"} onClick={() => onPick("auto")} className={cx(ROW, active === "auto" ? "bg-background-primary-active" : "hover:bg-background-primary-hover")}>
          <RiUserLocationLine className="size-4 shrink-0 text-foreground-icon-secondary" aria-hidden="true" />
          <span className="min-w-0 flex-1">
            <span className="block truncate text-body-medium text-text-primary">Sesuai profil</span>
            <span className="block truncate text-caption-1-regular text-text-tertiary">Metrik dan wilayah dari profil pantauan</span>
          </span>
        </button>
      )}

      {ASPECT_ORDER.map(aspect => {
        const items = (metricHits ?? metrics).filter(metric => aspectOf(metric.aspect) === aspect);
        if (!items.length) return null;
        const meta = ASPECTS[aspect];
        const AspectIcon = meta.icon;
        const shut = closed[aspect] && !metricHits;
        return (
          <section key={aspect}>
            <button type="button" aria-expanded={!shut} onClick={() => setClosed(state => ({ ...state, [aspect]: !state[aspect] }))} className="flex w-full items-center gap-2 rounded-lg px-1 py-1 outline-none hover:bg-background-primary-hover focus-visible:ring-2 focus-visible:ring-border-focus-ring">
              <AspectIcon className="size-4" style={{ color: meta.color }} aria-hidden="true" />
              <h4 className="text-caption-1-medium text-text-secondary">{meta.label}</h4>
              <span className="ml-auto flex items-center gap-1.5 text-caption-1-regular tabular-nums text-text-tertiary">
                {items.length}
                <RiArrowDownSLine className={cx("size-4 transition-transform motion-reduce:transition-none", shut && "-rotate-90")} aria-hidden="true" />
              </span>
            </button>
            {!shut && (
              <div className="mt-1 space-y-0.5">
                {items.map(metric => {
                  const on = metric.metric === active;
                  const Icon = metricIcon(metric.metric, aspect);
                  return (
                    <button key={metric.metric} type="button" aria-pressed={on} title={metric.description} onClick={() => onPick(metric.metric)} className={cx(ROW, "relative", on ? "bg-background-primary-active" : "hover:bg-background-primary-hover")}>
                      {on && <span aria-hidden="true" className="absolute top-1/2 left-0 h-5 w-[3px] -translate-y-1/2 rounded-r-full" style={{ backgroundColor: meta.color }} />}
                      <Icon className={cx("size-4 shrink-0", on ? "text-foreground-icon-primary" : "text-foreground-icon-secondary")} aria-hidden="true" />
                      <span className="min-w-0 flex-1">
                        <span className={cx("block truncate text-text-primary", on ? "text-body-semibold" : "text-body-medium")}>{metric.label}</span>
                        <span className="block truncate text-caption-1-regular text-text-tertiary">{metric.unit}</span>
                      </span>
                      {isModelledMetric(metric) && (
                        <span className="flex shrink-0 items-center gap-0.5 rounded-md bg-status-yellow-background px-1.5 py-0.5 text-caption-2-medium text-status-yellow-text" title="Angka turunan model, bukan pengukuran langsung">
                          <RiCalculatorLine className="size-3" aria-hidden="true" />
                          MODEL
                        </span>
                      )}
                    </button>
                  );
                })}
              </div>
            )}
          </section>
        );
      })}

      {metricHits && metricHits.length === 0 && regionHits.length === 0 && (
        <p className="py-4 text-center text-body-2-regular text-text-secondary">Tidak ada data atau wilayah yang cocok dengan "{query}".</p>
      )}
    </div>
  );
}
