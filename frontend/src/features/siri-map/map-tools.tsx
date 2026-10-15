"use client";

import type { ReactElement } from "react";
import { AnimatePresence, motion } from "motion/react";
import { type RemixiconComponentType, RiCheckLine, RiMap2Line, RiPaletteFill, RiPaletteLine, RiWindyFill, RiWindyLine } from "@remixicon/react";
import { spring } from "@/lib/springs";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { cx } from "@/utils/cx";
import { BASEMAPS, BASEMAP_ORDER } from "./atlas";
import type { BasemapType } from "./types";

interface MapToolsProps {
  basemap: BasemapType;
  onBasemapChange: (b: BasemapType) => void;
  is3D: boolean;
  onIs3DChange: (value: boolean) => void;
  /** Off shows the plain basemap under the regions. */
  showData: boolean;
  onShowDataChange: (value: boolean) => void;
  wind: boolean;
  onWindChange: (value: boolean) => void;
  className?: string;
}

// Same footprint as the zoom controls below it, so the right edge reads as one column of map controls.
const TOOL = "button-press-motion flex size-8 items-center justify-center text-foreground-icon-secondary outline-none hover:bg-background-primary-hover hover:text-foreground-icon-primary focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-border-focus-ring";
const ON = "bg-button-ghost-background text-button-ghost-foreground hover:bg-button-ghost-background hover:text-button-ghost-foreground";

function Hint({ label, children }: { label: string; children: ReactElement }) {
  return (
    <Tooltip>
      <TooltipTrigger render={children} />
      <TooltipContent side="left">{label}</TooltipContent>
    </Tooltip>
  );
}

type Icon = RemixiconComponentType;

/** Line icon off, fill icon on; the swap is a quick crossfade with a little scale so the change registers without a flash. */
function Toggle({ icon, activeIcon, on, label, onPress }: { icon: Icon; activeIcon: Icon; on: boolean; label: string; onPress: () => void }) {
  const Glyph = on ? activeIcon : icon;
  return (
    <Hint label={label}>
      <button type="button" aria-pressed={on} aria-label={label} onClick={onPress} className={cx(TOOL, on && ON)}>
        <AnimatePresence mode="popLayout" initial={false}>
          <motion.span
            key={on ? "on" : "off"}
            initial={{ opacity: 0, scale: 0.7 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.7, transition: spring.moderate.exit }}
            transition={spring.moderate}
            className="grid place-items-center"
          >
            <Glyph className="size-4" aria-hidden="true" />
          </motion.span>
        </AnimatePresence>
      </button>
    </Hint>
  );
}

/** The map's view controls, stacked on the right edge above zoom: what lies under the data, and how it is drawn. */
export function MapTools({ basemap, onBasemapChange, is3D, onIs3DChange, showData, onShowDataChange, wind, onWindChange, className }: MapToolsProps) {
  return (
    <div className={cx("pointer-events-auto flex flex-col gap-1.5", className)}>
      <div className="flex flex-col overflow-hidden rounded-2lg border border-border-button-default bg-background-primary-default shadow-xs [&>*:not(:last-child)]:border-b [&>*:not(:last-child)]:border-border-button-default">
        <Popover>
          <PopoverTrigger aria-label={`Peta dasar: ${BASEMAPS[basemap].label}`} className={TOOL}>
            <RiMap2Line className="size-4" aria-hidden="true" />
          </PopoverTrigger>
          <PopoverContent side="left" align="start" className="w-64 p-1.5">
            <p className="px-2 pt-1 pb-1.5 text-caption-1-medium text-text-secondary">Peta Dasar</p>
            <div role="radiogroup" aria-label="Peta dasar" className="flex flex-col gap-0.5">
              {BASEMAP_ORDER.map((id) => {
                const on = id === basemap;
                return (
                  <button
                    key={id}
                    type="button"
                    role="radio"
                    aria-checked={on}
                    onClick={() => onBasemapChange(id)}
                    className={cx(
                      "flex w-full items-start gap-2 rounded-lg px-2 py-1.5 text-left outline-none transition-colors focus-visible:ring-2 focus-visible:ring-border-focus-ring",
                      on ? "bg-background-primary-active" : "hover:bg-background-primary-hover",
                    )}
                  >
                    <span className="min-w-0 flex-1">
                      <span className="block text-body-2-medium text-text-primary">{BASEMAPS[id].label}</span>
                      <span className="block text-caption-1-regular text-text-tertiary">{BASEMAPS[id].hint}</span>
                    </span>
                    <RiCheckLine className={cx("mt-0.5 size-4 shrink-0 text-foreground-icon-primary transition-[opacity,transform] duration-150 ease-[cubic-bezier(0.23,1,0.32,1)] motion-reduce:transition-none", on ? "scale-100 opacity-100" : "scale-75 opacity-0")} aria-hidden="true" />
                  </button>
                );
              })}
            </div>
          </PopoverContent>
        </Popover>
        {/* The regions deliberately cover the basemap, so this is how to see what is underneath. */}
        <Toggle icon={RiPaletteLine} activeIcon={RiPaletteFill} on={showData} label={showData ? "Sembunyikan warna wilayah" : "Tampilkan warna wilayah"} onPress={() => onShowDataChange(!showData)} />
        {/* Direction is hard to read as a number, and it decides where smoke from a fire drifts. */}
        <Toggle icon={RiWindyLine} activeIcon={RiWindyFill} on={wind} label={wind ? "Sembunyikan arah angin" : "Tampilkan arah angin"} onPress={() => onWindChange(!wind)} />
      </div>

      <div className="overflow-hidden rounded-2lg border border-border-button-default bg-background-primary-default shadow-xs">
        <Hint label={is3D ? "Kembali ke tampilan datar" : "Miringkan peta, bangunan tampil mulai zoom 14"}>
          <button type="button" aria-pressed={is3D} aria-label="Tampilan 3D" onClick={() => onIs3DChange(!is3D)} className={cx(TOOL, "text-caption-1-semibold", is3D && ON)}>
            3D
          </button>
        </Hint>
      </div>
    </div>
  );
}
