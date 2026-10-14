import { useMemo, useState } from "react";
import { RiArrowDownSLine, RiCalculatorLine, RiCloseLine, RiInformationLine, RiRadarLine } from "@remixicon/react";
import { Button } from "@/components/base/buttons/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { SERIES } from "@/components/application/data-viz/format";
import { useApi } from "@/hooks/use-api";
import type { DTO } from "@/lib/api/client";
import { cx } from "@/utils/cx";
import { ASPECTS, ASPECT_ORDER, aspectOf, fmt, fmtAuto, type Aspect, type MetricDef } from "./atlas";

type Indicator = DTO<"IndicatorValue">;

const INSET = "rounded-2lg bg-background-inner-default shadow-card";
// Fixed series order per aspect, so one aspect keeps one colour across every chart.
const ASPECT_SERIES: Record<Aspect, string> = { lingkungan: SERIES[0], energi: SERIES[1], urban: SERIES[2] };

/** Observation or model, with confidence, behind one small icon: metadata earns a tooltip, not a badge on every row. */
function Provenance({ item }: { item: Indicator }) {
  const Icon = item.is_modelled ? RiCalculatorLine : RiRadarLine;
  const text = `${item.is_modelled ? "Angka model" : "Angka observasi"} · keyakinan ${item.confidence}/5 · ${item.period}`;
  return (
    <Tooltip>
      <TooltipTrigger render={<span tabIndex={0} aria-label={text} className="inline-flex shrink-0 rounded text-foreground-icon-secondary outline-none focus-visible:ring-2 focus-visible:ring-border-focus-ring"><Icon className="size-3.5" aria-hidden="true" /></span>} />
      <TooltipContent side="left">{text}</TooltipContent>
    </Tooltip>
  );
}

/** Normalised 0-100 is the only number comparable across metrics, so the bar encodes it and the raw value is labelled beside it. */
function IndicatorBars({ items, color, defOf }: { items: Indicator[]; color: string; defOf: (metric: string) => MetricDef | undefined }) {
  return (
    <figure className="m-0 space-y-2">
      <figcaption className="sr-only">Nilai ternormalisasi tiap indikator, skala 0 sampai 100</figcaption>
      {items.map(item => {
        const def = defOf(item.metric);
        return (
          <div key={item.metric} className="space-y-1">
            <div className="flex items-center gap-1.5">
              <span className="min-w-0 flex-1 truncate text-body-2-regular text-text-secondary">{item.label}</span>
              {def?.description && (
                <Tooltip>
                  <TooltipTrigger render={<button type="button" aria-label={`Tentang ${item.label}`} className="inline-flex shrink-0 rounded text-foreground-icon-secondary outline-none hover:text-foreground-icon-primary focus-visible:ring-2 focus-visible:ring-border-focus-ring"><RiInformationLine className="size-3.5" aria-hidden="true" /></button>} />
                  <TooltipContent side="left" className="max-w-60">{def.description}</TooltipContent>
                </Tooltip>
              )}
              <Provenance item={item} />
              <span className="shrink-0 text-body-2-medium tabular-nums text-text-primary">
                {fmtAuto(item.value)} <span className="text-caption-1-regular text-text-tertiary">{item.unit}</span>
              </span>
            </div>
            <div className="flex items-center gap-2">
              <div role="img" aria-label={`${item.label}: ${Math.round(item.normalised)} dari 100`} className="relative h-1.5 flex-1 overflow-hidden rounded-full bg-background-supporting-default">
                {/* The midpoint of the attention scale. */}
                <span aria-hidden="true" className="absolute inset-y-0 left-1/2 w-px bg-border-button-default" />
                <div className="h-full rounded-full" style={{ width: `${Math.max(1.5, item.normalised)}%`, backgroundColor: color }} />
              </div>
              <span className="w-7 shrink-0 text-right text-caption-1-regular tabular-nums text-text-tertiary">{Math.round(item.normalised)}</span>
            </div>
          </div>
        );
      })}
    </figure>
  );
}

/** Two indicators visible, the rest behind a disclosure, so a long list stays scannable. */
function AspectSection({ aspect, items, defOf }: { aspect: Aspect; items: Indicator[]; defOf: (metric: string) => MetricDef | undefined }) {
  const [open, setOpen] = useState(false);
  const VISIBLE = 2;
  const hidden = items.length - VISIBLE;
  const meta = ASPECTS[aspect];
  return (
    <section className={cx(INSET, "p-3")}>
      <h4 className="mb-2.5 flex items-center gap-2 text-caption-1-medium text-text-secondary">
        <span aria-hidden="true" className="size-2 rounded-full" style={{ backgroundColor: ASPECT_SERIES[aspect] }} />
        {meta.label}
        <span className="ml-auto tabular-nums text-text-tertiary">{items.length}</span>
      </h4>
      <IndicatorBars items={open ? items : items.slice(0, VISIBLE)} color={ASPECT_SERIES[aspect]} defOf={defOf} />
      {hidden > 0 && (
        <button type="button" aria-expanded={open} onClick={() => setOpen(value => !value)} className="mt-2 flex w-full items-center justify-center gap-1 rounded-lg py-1 text-body-2-medium text-text-secondary outline-none hover:bg-background-primary-hover hover:text-text-primary focus-visible:ring-2 focus-visible:ring-border-focus-ring">
          {open ? "Sembunyikan" : `${hidden} indikator lainnya`}
          <RiArrowDownSLine className={cx("size-4 transition-transform motion-reduce:transition-none", open && "rotate-180")} aria-hidden="true" />
        </button>
      )}
    </section>
  );
}

/** Where this region sits among its peers: every region as a faint tick, this one marked. Answers "is 78 high?". */
export function PeerStrip({ values, value, label, color = SERIES[0] }: { values: number[]; value: number; label: string; color?: string }) {
  const sorted = useMemo(() => [...values].sort((a, b) => a - b), [values]);
  if (sorted.length < 5) return null;
  const below = sorted.filter(v => v < value).length;
  const lo = sorted[0];
  const hi = sorted[sorted.length - 1];
  const x = (v: number) => ((v - lo) / Math.max(hi - lo, 1e-9)) * 100;
  return (
    <figure className="m-0">
      <figcaption className="mb-1 text-caption-1-regular text-text-secondary">{label} dibanding {sorted.length - 1} wilayah lain</figcaption>
      <svg viewBox="0 0 100 24" preserveAspectRatio="none" className="h-6 w-full text-border-button-default" role="img" aria-label={`Peringkat ${sorted.length - below} dari ${sorted.length}`}>
        {sorted.map((v, k) => <line key={k} x1={x(v)} x2={x(v)} y1={7} y2={17} stroke="currentColor" strokeWidth={0.4} vectorEffect="non-scaling-stroke" />)}
        <line x1={x(value)} x2={x(value)} y1={2} y2={22} stroke={color} strokeWidth={3} strokeLinecap="round" vectorEffect="non-scaling-stroke" />
      </svg>
      <div className="flex justify-between gap-2 text-caption-1-regular tabular-nums text-text-tertiary">
        <span>{fmtAuto(lo)}</span>
        <span className="text-text-primary">peringkat {sorted.length - below} dari {sorted.length} <span className="text-text-tertiary">(persentil {Math.round((below / (sorted.length - 1)) * 100)})</span></span>
        <span>{fmtAuto(hi)}</span>
      </div>
    </figure>
  );
}

/**
 * Every indicator one region has, across aspects, from `/regions/{id}`. The metric coloring the map
 * leads, with where the region sits among its peers.
 */
export function RegionDetail({ regionId, metrics, activeMetric, peerValues, onClose }: {
  regionId: string;
  metrics: MetricDef[];
  /** The metric currently coloring the map, shown first. */
  activeMetric: string | null;
  /** Every region's value for that metric, for the peer strip. */
  peerValues: number[];
  onClose: () => void;
}) {
  const detail = useApi(`/regions/${encodeURIComponent(regionId)}`, "RegionSummary");
  const defOf = (metric: string) => metrics.find(item => item.metric === metric);
  const indicators = detail.data?.indicators ?? [];
  const grouped = ASPECT_ORDER
    .map(aspect => ({ aspect, items: indicators.filter(item => aspectOf(defOf(item.metric)?.aspect) === aspect) }))
    .filter(group => group.items.length);
  const hero = activeMetric ? indicators.find(item => item.metric === activeMetric) : undefined;
  const heroAspect = aspectOf(hero ? defOf(hero.metric)?.aspect : undefined);
  const data = detail.data;

  return (
    <section aria-label="Rincian wilayah" className="space-y-3 rounded-2xl bg-background-secondary-default p-4">
      <header className="flex items-start gap-3">
        <div className="min-w-0 flex-1">
          <p className="text-body-2-regular text-text-secondary">Rincian wilayah</p>
          {detail.loading && !data ? <Skeleton className="mt-1 h-6 w-40" /> : <h3 className="truncate text-title-3-medium text-text-primary">{data?.name ?? "Wilayah"}</h3>}
          {data && (
            <p className="mt-0.5 text-body-2-regular tabular-nums text-text-tertiary">
              {data.population ? `${fmt(data.population)} jiwa (${data.level === "kabkota" ? "sensus 2020" : "BPS 2023"}) · ` : ""}{data.area_km2 ? `${fmt(data.area_km2)} km²` : ""}
            </p>
          )}
        </div>
        <Button variant="ghost" size="xs" iconOnly leadingIcon={RiCloseLine} aria-label="Tutup rincian wilayah" onClick={onClose} />
      </header>

      {detail.error && <p role="alert" className="rounded-2lg bg-status-rose-background px-3 py-2 text-body-2-medium text-status-rose-text">{detail.error}</p>}
      {detail.loading && !data && <>{[0, 1].map(i => <Skeleton key={i} className="h-28 w-full rounded-2lg" />)}</>}

      {hero && (
        <div className={cx(INSET, "space-y-3 p-3")}>
          <div>
            <p className="flex items-center gap-1.5 text-body-2-regular text-text-secondary">
              <span aria-hidden="true" className="size-2 rounded-full" style={{ backgroundColor: ASPECT_SERIES[heroAspect] }} />
              {hero.label}
            </p>
            <p className="mt-1 flex items-baseline gap-1.5">
              <span className="text-title-1-medium tabular-nums text-text-primary">{fmtAuto(hero.value)}</span>
              <span className="text-body-2-regular text-text-tertiary">{hero.unit}</span>
            </p>
            <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-background-supporting-default">
              <div className="h-full rounded-full" style={{ width: `${hero.normalised}%`, backgroundColor: ASPECT_SERIES[heroAspect] }} />
            </div>
          </div>
          <PeerStrip values={peerValues} value={hero.value} label={hero.label} color={ASPECT_SERIES[heroAspect]} />
        </div>
      )}

      {grouped.map(group => <AspectSection key={group.aspect} aspect={group.aspect} items={group.items} defOf={defOf} />)}

      {data && !indicators.length && <p className="py-2 text-center text-body-2-regular text-text-secondary">Belum ada indikator untuk wilayah ini.</p>}
      {indicators.length > 0 && (
        <p className="text-caption-1-regular text-text-tertiary">
          Bar menunjukkan nilai ternormalisasi 0 sampai 100, dengan 100 selalu berarti paling perlu perhatian. Untuk metrik seperti potensi PLTS dan curah hujan, itu berarti paling sedikit.
        </p>
      )}
    </section>
  );
}
