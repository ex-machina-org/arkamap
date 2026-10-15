/**
 * Small data views for the map's panels and cards: a figure is drawn against its scale instead of being
 * described in a sentence. All colours come from the status tokens, so they follow the theme.
 */
import type { ReactNode } from "react";
import { RiFireLine, RiFlashlightLine, RiHazeLine, RiRainyLine, RiSunLine, type RemixiconComponentType } from "@remixicon/react";
import { cx } from "@/utils/cx";
import { FIRE_COLORS, ISPU_COLORS, LEVEL_COLORS, SCORE_TICKS, scoreColor, scoreWord } from "./data-scale";
import type { PriorityContext, PriorityLevel, PrioritySignal } from "./decision";


/**
 * A 0-100 score as a filled track. The two hairline gaps mark where "sedang" and "tinggi" begin,
 * so a bar can be read against the threshold without a number.
 */
export function ScoreBar({ score, label, className }: { score: number | null | undefined; label: string; className?: string }) {
  const value = score == null ? 0 : Math.max(0, Math.min(100, score));
  return (
    <div
      role="meter"
      aria-label={label}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={score ?? undefined}
      aria-valuetext={score == null ? "Belum ada data" : `${Math.round(value)} dari 100, ${scoreWord(score).toLowerCase()}`}
      className={cx("relative h-1.5 overflow-hidden rounded-full bg-background-tertiary-default", className)}
    >
      <span
        className="absolute inset-y-0 left-0 rounded-full transition-[width] duration-300 ease-[cubic-bezier(0.23,1,0.32,1)] motion-reduce:transition-none"
        style={{ width: `${value}%`, backgroundColor: scoreColor(score) }}
      />
      {SCORE_TICKS.map(tick => <span key={tick} aria-hidden="true" className="absolute inset-y-0 w-0.5 -translate-x-1/2 bg-background-inner-default" style={{ left: `${tick}%` }} />)}
    </div>
  );
}

/**
 * Where a value sits on a named, ordered scale (ISPU categories, fire tiers). Steps up to the current
 * one take their own colour, so the bar climbs the ladder; the current step is named under it.
 */
export function SegmentMeter({ steps, step, colors, label, className }: {
  steps: readonly string[];
  step: number;
  colors: readonly string[];
  label: string;
  className?: string;
}) {
  return (
    <div className={cx("flex flex-col gap-1", className)}>
      <div role="meter" aria-label={label} aria-valuemin={0} aria-valuemax={steps.length - 1} aria-valuenow={step} aria-valuetext={steps[step]} className="flex gap-0.5">
        {steps.map((name, i) => (
          <span
            key={name}
            title={name}
            className={cx("h-1.5 flex-1 first:rounded-l-full last:rounded-r-full", i > step && "bg-background-tertiary-default")}
            style={i <= step ? { backgroundColor: colors[i] } : undefined}
          />
        ))}
      </div>
      <span className={cx("truncate text-caption-1-medium", step === 0 && "text-text-secondary")} style={step === 0 ? undefined : { color: colors[step] }}>
        {steps[step]}
      </span>
    </div>
  );
}

/** One figure with its label and unit, and room under it for a meter or a note. */
export function StatCell({ icon: Icon, label, value, unit, children, className }: {
  icon: RemixiconComponentType;
  label: string;
  value: string;
  unit?: string;
  children?: ReactNode;
  className?: string;
}) {
  return (
    // No box of its own: it sits inside an item that already is the surface.
    <div className={cx("flex min-w-0 flex-col gap-1.5", className)}>
      <span className="flex min-w-0 items-center gap-1.5 text-caption-1-medium text-text-secondary">
        <Icon className="size-3.5 shrink-0" aria-hidden="true" />
        <span className="truncate">{label}</span>
      </span>
      <span className="flex min-w-0 items-baseline gap-1">
        <span className="truncate text-headline-semibold tabular-nums text-text-primary">{value}</span>
        {unit && <span className="shrink-0 text-caption-1-regular text-text-tertiary">{unit}</span>}
      </span>
      {children}
    </div>
  );
}

const SIGNAL_ICON: Record<PrioritySignal["kind"], RemixiconComponentType> = { smoke: RiHazeLine, fire: RiFireLine };
const CONTEXT_ICON: Record<PriorityContext["kind"], RemixiconComponentType> = { dry: RiSunLine, rain: RiRainyLine, frp: RiFlashlightLine };

/**
 * A priority's findings as figures: each hazard in its own cell with its scale under it, then the
 * conditions around it as one quiet row. Shared by the side panel list and the card on the map.
 */
export function PriorityFigures({ signals, context }: { signals: PrioritySignal[]; context: PriorityContext[] }) {
  return (
    <div className="flex flex-col gap-2">
      {signals.length > 0 && (
        // Side by side, divided by a hairline instead of two boxes.
        <div className="grid grid-cols-2 gap-x-3 [&>*+*]:border-l [&>*+*]:border-border-button-default [&>*+*]:pl-3">
          {signals.map(signal => (
            <StatCell key={signal.kind} icon={SIGNAL_ICON[signal.kind]} label={signal.label} value={signal.value} unit={signal.unit} className={signals.length === 1 ? "col-span-2" : undefined}>
              <SegmentMeter steps={signal.steps} step={signal.step} colors={signal.kind === "smoke" ? ISPU_COLORS : FIRE_COLORS} label={`${signal.label}, kategori`} />
              {signal.note && <span className="text-caption-1-regular text-text-tertiary">{signal.note}</span>}
            </StatCell>
          ))}
        </div>
      )}
      {context.length > 0 && (
        <ul className="flex flex-wrap gap-x-3 gap-y-1 px-0.5">
          {context.map(item => {
            const Icon = CONTEXT_ICON[item.kind];
            return (
              <li key={item.kind} className="flex items-center gap-1 text-caption-1-regular text-text-secondary">
                <Icon className="size-3.5 shrink-0 text-foreground-icon-secondary" aria-hidden="true" />
                {item.label}
                <span className="text-caption-1-semibold tabular-nums text-text-primary">{item.value}</span>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

const LEVEL_COLOR: Record<PriorityLevel, string> = LEVEL_COLORS;
const LEVEL_NAME: Record<PriorityLevel, string> = { siaga: "Siaga", waspada: "Waspada" };

/** How the regions over a threshold split between the two levels, as one stacked bar. */
export function LevelSplit({ levels, className }: { levels: Record<PriorityLevel, number>; className?: string }) {
  const order: PriorityLevel[] = ["siaga", "waspada"];
  return (
    <div className={cx("flex flex-col gap-2", className)}>
      <div aria-hidden="true" className="flex h-2 gap-0.5">
        {order.filter(level => levels[level] > 0).map(level => (
          <span key={level} className="rounded-full first:rounded-l-full last:rounded-r-full" style={{ flexGrow: levels[level], backgroundColor: LEVEL_COLOR[level] }} />
        ))}
      </div>
      <ul className="flex items-center gap-4">
        {order.map(level => (
          <li key={level} className="flex items-center gap-1.5 text-caption-1-regular text-text-secondary">
            <span aria-hidden="true" className="size-2 rounded-full" style={{ backgroundColor: LEVEL_COLOR[level] }} />
            {LEVEL_NAME[level]}
            <span className="text-caption-1-semibold tabular-nums text-text-primary">{levels[level]}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}
