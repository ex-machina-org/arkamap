"use client";

import type { ReactNode, Ref } from "react";
import { RiCloseLine, RiDashboardLine, RiSearchLine } from "@remixicon/react";
import { ButtonLink } from "@/components/base/buttons/button";
import { Kbd } from "@/components/base/kbd/kbd";

interface MapHeaderProps {
  /** The dashboard needs a session, so guests get no link to it. */
  signedIn: boolean;
  searchQuery: string;
  onSearchChange: (q: string) => void;
  searchRef: Ref<HTMLInputElement>;
  /** Account entry, rendered last. */
  children?: ReactNode;
}

/** Navigation and search only; the view controls live on the map's right edge (see MapTools). */
export function MapHeader({ signedIn, searchQuery, onSearchChange, searchRef, children }: MapHeaderProps) {
  return (
    // Overlays the top of the map: the empty space between pieces stays draggable map.
    <header className="pointer-events-none absolute inset-x-3 top-3 z-20 flex items-center gap-2">
      {signedIn && (
        <ButtonLink
          href="/dashboard"
          variant="primary"
          size="small"
          leadingIcon={RiDashboardLine}
          aria-label="Kembali ke dashboard"
          className="pointer-events-auto shrink-0 max-xl:w-9 max-xl:px-0 [&>span]:max-xl:hidden"
        >
          Dashboard
        </ButtonLink>
      )}

      <div className="pointer-events-auto relative flex w-full min-w-0 max-w-80 items-center">
        <RiSearchLine className="pointer-events-none absolute left-3 size-4 text-foreground-icon-secondary" aria-hidden="true" />
        <input
          ref={searchRef}
          type="search"
          aria-label="Cari kejadian"
          placeholder="Cari kejadian atau sumber"
          value={searchQuery}
          onChange={(e) => onSearchChange(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Escape") {
              if (searchQuery) onSearchChange("");
              else e.currentTarget.blur();
            }
          }}
          // Matches the dashboard header's search field: input border, Body 1 size.
          className="h-9 w-full rounded-2lg border border-border-input-default bg-background-primary-default pl-9 pr-9 text-body-regular text-text-primary shadow-xs outline-none transition-colors placeholder:text-text-placeholder focus:border-accent-500 focus-visible:ring-2 focus-visible:ring-border-focus-ring [&::-webkit-search-cancel-button]:hidden"
        />
        {searchQuery ? (
          <button
            type="button"
            aria-label="Hapus pencarian"
            onClick={() => onSearchChange("")}
            className="button-press-motion absolute right-1.5 grid size-6 place-items-center rounded-md text-foreground-icon-secondary hover:bg-background-primary-hover hover:text-foreground-icon-primary"
          >
            <RiCloseLine className="size-4" aria-hidden="true" />
          </button>
        ) : (
          <Kbd className="pointer-events-none absolute right-2 px-1 py-0 text-caption-2-medium text-text-tertiary max-md:hidden">/</Kbd>
        )}
      </div>

      <div className="pointer-events-auto ml-auto flex shrink-0 items-center">{children}</div>
    </header>
  );
}
