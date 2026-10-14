"use client";

// Adapted from Fluid Functionalism (https://www.fluidfunctionalism.com/docs/fluid-hover).
import {
  motion,
  AnimatePresence,
  useReducedMotion,
  type Transition,
} from "motion/react";
import type { ItemRect, UseFluidHoverReturn } from "@/hooks/use-fluid-hover";
import { spring } from "@/lib/springs";
import { cx } from "@/utils/cx";

/**
 * The single hover fill of a fluid hover list. It springs between the rects
 * `useFluidHover` measures, so the highlight glides instead of blinking.
 *
 *   const hover = useFluidHover(ref);
 *   <div ref={ref} className="relative" {...hover.handlers}>
 *     <FluidHoverHighlight hover={hover} className="rounded-lg" />
 *     ...rows registered with hover.registerItem
 *   </div>
 *
 * The container must be `relative`; radius and z-index belong to the caller.
 */
export type FluidHoverSource = Pick<
  UseFluidHoverReturn,
  "activeIndex" | "itemRects" | "isMeasured" | "session"
>;

export interface FluidHoverHighlightProps {
  hover: FluidHoverSource;
  /** Keeps the list state but shows nothing, running the exit fade. */
  hidden?: boolean;
  /** Where a fresh pointer session fades in from, such as the active route. */
  from?: ItemRect | null;
  /** Merged onto the default interaction surface. */
  className?: string;
  /** Positional transition; `false` snaps with no travel. Defaults to `spring.fast`. */
  transition?: Transition | false;
}

const fade: Transition = { duration: 0.08 };
const snap: Transition = { duration: 0 };

function toTarget(rect: ItemRect) {
  return { x: rect.left, y: rect.top, width: rect.width, height: rect.height };
}

export function FluidHoverHighlight({
  hover,
  hidden,
  from,
  className,
  transition,
}: FluidHoverHighlightProps) {
  const { activeIndex, itemRects, isMeasured, session } = hover;
  // Gating on isMeasured keeps a stale rect from making the fill slide in
  // from another row.
  const rect =
    !hidden && isMeasured && activeIndex !== null
      ? (itemRects[activeIndex] ?? null)
      : null;
  // Reduced motion drops the travel but keeps the opacity fade.
  const reduceMotion = useReducedMotion() ?? false;
  const positional =
    transition === false || reduceMotion ? snap : (transition ?? spring.fast);

  return (
    <AnimatePresence>
      {rect && (
        <motion.div
          key={session}
          aria-hidden
          data-slot="fluid-hover-highlight"
          // Travel is a transform so it stays on the compositor; width and
          // height only change when the target row's size does.
          className={cx(
            "pointer-events-none absolute top-0 left-0 bg-background-primary-hover",
            className,
          )}
          initial={{ opacity: 0, ...toTarget(from ?? rect) }}
          animate={{ opacity: 1, ...toTarget(rect) }}
          exit={{ opacity: 0, transition: spring.fast.exit }}
          transition={{ ...positional, opacity: fade }}
        />
      )}
    </AnimatePresence>
  );
}
