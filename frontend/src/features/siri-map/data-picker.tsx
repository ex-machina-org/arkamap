"use client";

import { useState, type ReactNode } from "react";
import { RiArrowUpSLine, RiPaletteLine } from "@remixicon/react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { cx } from "@/utils/cx";

/**
 * What colours the regions, as the first control in the dock. The button names the current layer and shows
 * its colour ramp, so the strip that filters the pins also says what the colours mean; it opens the full
 * metric list upward, over the map it changes.
 */
export function DataPicker({ label, swatch, children }: {
  /** The layer drawn now; absent while it loads or when none is picked. */
  label?: string;
  swatch?: readonly string[];
  /** The picker body. `close` dismisses it, for a pick that is final. */
  children: (close: () => void) => ReactNode;
}) {
  const [open, setOpen] = useState(false);
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger
        aria-label={`Warna wilayah: ${label ?? "belum dipilih"}. Ganti data`}
        className={cx(
          "button-press-motion flex h-9 max-w-64 shrink-0 items-center gap-2 rounded-full pr-2.5 pl-3 text-text-primary outline-none focus-visible:ring-2 focus-visible:ring-border-focus-ring",
          open ? "bg-background-primary-default shadow-card" : "hover:bg-background-primary-hover",
        )}
      >
        {swatch?.length ? (
          <span aria-hidden="true" className="h-2.5 w-6 shrink-0 rounded-full" style={{ backgroundImage: `linear-gradient(to right, ${swatch.join(", ")})` }} />
        ) : (
          <RiPaletteLine className="size-4 shrink-0 text-foreground-icon-secondary" aria-hidden="true" />
        )}
        <span className="hidden min-w-0 truncate text-body-2-medium md:inline">{label ?? "Pilih data"}</span>
        <RiArrowUpSLine className={cx("size-4 shrink-0 text-foreground-icon-secondary transition-transform duration-200 ease-[cubic-bezier(0.23,1,0.32,1)] motion-reduce:transition-none", open && "rotate-180")} aria-hidden="true" />
      </PopoverTrigger>
      <PopoverContent side="top" align="center" sideOffset={12} className="w-[340px] p-0">
        <div className="flex flex-col">
          <header className="px-4 pt-4 pb-3">
            <p className="text-headline-semibold text-text-primary">Warna Wilayah</p>
            <p className="text-caption-1-regular text-text-tertiary">Bawaan mengikuti profil. Pilih data lain untuk mewarnai wilayah di peta.</p>
          </header>
          <div className="max-h-[min(60svh,520px)] overflow-y-auto px-3 pb-3 [scrollbar-width:thin]">{children(() => setOpen(false))}</div>
        </div>
      </PopoverContent>
    </Popover>
  );
}
