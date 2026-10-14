import { cx } from "@/utils/cx";

const MASK = 'url("/brand/arkamap-icon.svg") center / contain no-repeat';

/**
 * The Arkamap tree mark as the dashboard sidebar shows it: brand green in light mode, white in dark
 * mode. Size it with `size-*` classes; the default matches the sidebar.
 */
export function ArkamapMark({ className }: { className?: string }) {
  return (
    <span
      aria-hidden="true"
      className={cx("block size-8 shrink-0 bg-accent-500 dark:bg-text-white", className)}
      style={{ mask: MASK, WebkitMask: MASK }}
    />
  );
}

/**
 * The canonical Arkamap lockup, taken from the dashboard sidebar: the mark beside the wordmark.
 * Use it wherever the product name appears with its logo so every page shows the same brand.
 */
export function ArkamapLockup({ className }: { className?: string }) {
  return (
    <span className={cx("flex items-center gap-2.5", className)}>
      {/* The mark's visual centre sits low in its box, so it is nudged up to line up with the wordmark. */}
      <ArkamapMark className="-translate-y-0.5" />
      <img src="/brand/arkamap-wordmark.svg" alt="Arkamap" className="block h-6 w-auto shrink-0 dark:invert" />
    </span>
  );
}
