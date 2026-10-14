"use client";

import type { ReactNode, Ref } from "react";
import {
  RiCloseLine,
  RiDashboardLine,
  RiEyeLine,
  RiEyeOffLine,
  RiSearchLine,
  RiStackLine,
  RiWindyLine,
} from "@remixicon/react";
import { Button, ButtonLink } from "@/components/base/buttons/button";
import { SegmentedControl, SegmentedControlItem } from "@/components/base/segmented-control/segmented-control";
import { Kbd } from "@/components/base/kbd/kbd";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { BASEMAPS, BASEMAP_ORDER } from "./atlas";
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
  /** Off shows the plain basemap under the regions. */
  showData: boolean;
  onShowDataChange: (value: boolean) => void;
  wind: boolean;
  onWindChange: (value: boolean) => void;
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
  showData,
  onShowDataChange,
  wind,
  onWindChange,
  children,
}: MapHeaderProps) {
  const nextBasemap = BASEMAP_ORDER[(BASEMAP_ORDER.indexOf(basemap) + 1) % BASEMAP_ORDER.length];
  const basemapLabel = `Peta dasar: ${BASEMAPS[basemap].label}. Ganti ke ${BASEMAPS[nextBasemap].label}`;

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
          className="pointer-events-auto shrink-0 max-2xl:w-9 max-2xl:px-0 [&>span]:max-2xl:hidden"
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
        {/* 2xl and up: every basemap visible. Below: one tap cycles them, to save width. */}
        <SegmentedControl
          aria-label="Peta dasar"
          selectedKeys={[basemap]}
          onSelectionChange={(keys) => {
            const k = Array.from(keys)[0] as BasemapType | undefined;
            if (k) onBasemapChange(k);
          }}
          className="max-2xl:hidden"
        >
          {BASEMAP_ORDER.map((id) => (
            <SegmentedControlItem key={id} id={id} className="px-3 text-caption-1-medium">
              <span title={BASEMAPS[id].hint}>{BASEMAPS[id].label}</span>
            </SegmentedControlItem>
          ))}
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
                onClick={() => onBasemapChange(nextBasemap)}
                className="2xl:hidden"
              />
            }
          />
          <TooltipContent side="bottom">{basemapLabel}</TooltipContent>
        </Tooltip>

        {/* The regions deliberately cover the basemap, so this is how to see what is underneath. */}
        <Tooltip>
          <TooltipTrigger
            render={
              <Button
                variant={showData ? "primary" : "secondary"}
                size="small"
                leadingIcon={showData ? RiEyeLine : RiEyeOffLine}
                aria-pressed={showData}
                aria-label={showData ? "Sembunyikan data wilayah" : "Tampilkan data wilayah"}
                onClick={() => onShowDataChange(!showData)}
                className="max-xl:w-9 max-xl:px-0 [&>span]:max-xl:hidden"
              >
                Data
              </Button>
            }
          />
          <TooltipContent side="bottom">{showData ? "Sembunyikan warna wilayah, lihat peta polos" : "Tampilkan warna wilayah"}</TooltipContent>
        </Tooltip>
        {/* Direction is hard to read as a number, and it decides where smoke from a fire drifts. */}
        <Tooltip>
          <TooltipTrigger
            render={
              <Button
                variant={wind ? "primary" : "secondary"}
                size="small"
                leadingIcon={RiWindyLine}
                aria-pressed={wind}
                aria-label={wind ? "Sembunyikan arah angin" : "Tampilkan arah angin"}
                onClick={() => onWindChange(!wind)}
                className="max-xl:w-9 max-xl:px-0 [&>span]:max-xl:hidden"
              >
                Angin
              </Button>
            }
          />
          <TooltipContent side="bottom">{wind ? "Sembunyikan arah angin" : "Tampilkan arah angin"}</TooltipContent>
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
