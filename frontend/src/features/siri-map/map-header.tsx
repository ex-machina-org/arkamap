"use client";

import type { ReactNode, Ref } from "react";
import {
  RiArrowLeftLine,
  RiCloseLine,
  RiSearchLine,
  RiStackLine,
} from "@remixicon/react";
import { Button, ButtonLink } from "@/components/base/buttons/button";
import { SegmentedControl, SegmentedControlItem } from "@/components/base/segmented-control/segmented-control";
import { Kbd } from "@/components/base/kbd/kbd";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import type { BasemapType } from "./types";

interface MapHeaderProps {
  /** The dashboard needs a session, so guests get no link to it. */
  signedIn: boolean;
  searchQuery: string;
  onSearchChange: (q: string) => void;
  searchRef: Ref<HTMLInputElement>;
  basemap: BasemapType;
  onBasemapChange: (b: BasemapType) => void;
  is3D: boolean;
  onIs3DChange: (value: boolean) => void;
  /** Account entry, rendered last. */
  children?: ReactNode;
}

const GLASS = "border border-border-button-default bg-background-primary-default";

export function MapHeader({
  signedIn,
  searchQuery,
  onSearchChange,
  searchRef,
  basemap,
  onBasemapChange,
  is3D,
  onIs3DChange,
  children,
}: MapHeaderProps) {
  const basemapLabel = basemap === "satellite" ? "Ganti ke peta jalan" : "Ganti ke satelit";

  return (
    // Overlays the top of the map: the empty space between pieces stays draggable map.
    <header className="pointer-events-none absolute inset-x-3 top-3 z-20 flex items-center gap-2">
      {signedIn && (
        <ButtonLink
          href="/dashboard"
          variant="secondary"
          size="small"
          leadingIcon={RiArrowLeftLine}
          aria-label="Kembali ke dashboard"
          className="pointer-events-auto shrink-0 shadow-2xs max-2xl:w-9 max-2xl:px-0 [&>span]:max-2xl:hidden"
        >
          Dashboard
        </ButtonLink>
      )}

      <div className="pointer-events-auto relative flex w-full min-w-0 max-w-72 items-center">
        <RiSearchLine className="pointer-events-none absolute left-2.5 size-4 text-foreground-icon-secondary" aria-hidden="true" />
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
          className={`${GLASS} h-9 w-full rounded-lg shadow-2xs pl-8 pr-9 text-body-medium text-text-primary outline-none transition-colors placeholder:text-text-placeholder focus:border-accent-500 focus-visible:ring-2 focus-visible:ring-border-focus-ring [&::-webkit-search-cancel-button]:hidden`}
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

      <div className="pointer-events-auto ml-auto flex shrink-0 items-center gap-2 [&>*]:shadow-2xs">
        {/* xl and up: both choices visible. Below xl: one tap, to save width. */}
        <SegmentedControl
          aria-label="Peta dasar"
          selectedKeys={[basemap]}
          onSelectionChange={(keys) => {
            const k = Array.from(keys)[0] as BasemapType | undefined;
            if (k) onBasemapChange(k);
          }}
          className="max-xl:hidden"
        >
          <SegmentedControlItem id="satellite" className="px-3 text-caption-1-medium">Satelit</SegmentedControlItem>
          <SegmentedControlItem id="street" className="px-3 text-caption-1-medium">Peta jalan</SegmentedControlItem>
        </SegmentedControl>
        <Tooltip>
          <TooltipTrigger
            render={
              <Button
                variant="secondary"
                size="small"
                iconOnly
                leadingIcon={RiStackLine}
                aria-label={basemapLabel}
                onClick={() => onBasemapChange(basemap === "satellite" ? "street" : "satellite")}
                className="xl:hidden"
              />
            }
          />
          <TooltipContent side="bottom">{basemapLabel}</TooltipContent>
        </Tooltip>

        <SegmentedControl
          aria-label="Sudut pandang"
          selectedKeys={[is3D ? "3d" : "2d"]}
          onSelectionChange={(keys) => {
            const k = Array.from(keys)[0];
            if (k) onIs3DChange(k === "3d");
          }}
        >
          <SegmentedControlItem id="2d" className="px-3 text-caption-1-medium">2D</SegmentedControlItem>
          <SegmentedControlItem id="3d" className="px-3 text-caption-1-medium">3D</SegmentedControlItem>
        </SegmentedControl>

        {children}
      </div>
    </header>
  );
}
