// Motion tokens adapted from Fluid Functionalism. Each tier is the enter
// transition; `.exit` is a plain tween one tier quicker, so a dismissal reads
// as final instead of replaying the entrance in reverse.
//
//   transition={spring.fast}
//   exit={{ opacity: 0, transition: spring.fast.exit }}
//
// The bigger the thing that moves, the slower the tier. Prefer a tier over a
// hand-written duration.
export const spring = {
  // Hover, fades, tooltips, focus rings.
  fast: {
    type: "spring" as const,
    duration: 0.08,
    bounce: 0,
    exit: { duration: 0.06 },
  },
  // Critically damped, so it lands without overshoot: dropdowns, tabs,
  // drawers, short travel.
  moderate: {
    type: "spring" as const,
    duration: 0.16,
    bounce: 0,
    exit: { duration: 0.12 },
  },
  // Dialogs, sheets, large surfaces.
  slow: {
    type: "spring" as const,
    duration: 0.24,
    bounce: 0.12,
    exit: { duration: 0.16 },
  },
} as const;

// A throttled background tab can stall an exit animation, so deferred-unmount
// timers fall back to the tier's exit duration plus a buffer.
export const exitFallbackMs = (tier: { exit: { duration: number } }) =>
  Math.round(tier.exit.duration * 1000) + 100;
