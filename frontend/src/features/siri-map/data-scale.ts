/** Scales and colours behind the data views (data-views.tsx). All colours are status tokens, so they follow the theme. */

const ROSE = "var(--color-status-rose-text)";
const YELLOW = "var(--color-status-yellow-text)";
const LIME = "var(--color-status-lime-text)";
const BLUE = "var(--color-status-blue-text)";
const PURPLE = "var(--color-status-purple-text)";
const QUIET = "var(--color-text-tertiary)";

/** ISPU's own ladder (Permen LHK 14/2020): green, blue, yellow, red, and the darkest for hazardous. */
export const ISPU_COLORS = [LIME, BLUE, YELLOW, ROSE, PURPLE] as const;
/** Fire density tiers: nothing to note, then warming towards red. */
export const FIRE_COLORS = [QUIET, YELLOW, `color-mix(in oklab, ${YELLOW}, ${ROSE})`, ROSE] as const;
export const LEVEL_COLORS = { siaga: ROSE, waspada: YELLOW } as const;

/** The thresholds every attention score in the app uses: 50 starts "sedang", 75 "tinggi". */
export const SCORE_TICKS = [50, 75] as const;

export function scoreColor(score: number | null | undefined) {
  if (score == null) return QUIET;
  return score >= 75 ? ROSE : score >= 50 ? YELLOW : QUIET;
}

export function scoreWord(score: number | null | undefined) {
  if (score == null) return "Belum ada data";
  return score >= 75 ? "Tinggi" : score >= 50 ? "Sedang" : "Rendah";
}

const compact = new Intl.NumberFormat("id-ID", { notation: "compact", maximumFractionDigits: 2 });
/** 2.740.000 → "2,74 jt": population is context, so it gets the short form. */
export const formatCompact = (n: number) => compact.format(n);
