import { cx } from "@/utils/cx";

const MASK = 'url("/brand/kodama.svg") center / contain no-repeat';

/**
 * Kodama's mascot as a one-colour icon, like the Remix icons beside it: it takes the surrounding
 * text colour (white on a green button, grey on a plain one). The artwork is used as a luminance
 * mask, so its dark outlines and shading stay visible instead of collapsing into a flat silhouette.
 * Size it with `size-*` classes.
 */
export function KodamaIcon({ className }: { className?: string; "aria-hidden"?: boolean | "true" | "false" }) {
  return (
    <span
      aria-hidden="true"
      className={cx("inline-block shrink-0 bg-current", className)}
      style={{ mask: MASK, WebkitMask: MASK, maskMode: "luminance" }}
    />
  );
}

/**
 * The mascot in white with a thin accent outline, for plain light surfaces where bare white would
 * disappear. The filter sits on a wrapper because a filter on the masked element itself is applied
 * before the mask and would be cut away with it.
 */
export function KodamaMark({ className }: { className?: string; "aria-hidden"?: boolean | "true" | "false" }) {
  return (
    <span
      aria-hidden="true"
      className={cx("inline-block shrink-0", className)}
      style={{ filter: "drop-shadow(0 0 0.5px var(--color-accent-700)) drop-shadow(0 0 0.5px var(--color-accent-700)) drop-shadow(0 0 0.5px var(--color-accent-700))" }}
    >
      <KodamaIcon className="block size-full text-white" />
    </span>
  );
}
