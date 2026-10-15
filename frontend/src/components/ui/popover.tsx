import type { ReactNode } from "react";
import { Popover as PopoverPrimitive } from "@base-ui/react/popover";

export const Popover = PopoverPrimitive.Root;
export const PopoverTrigger = PopoverPrimitive.Trigger;
export const PopoverClose = PopoverPrimitive.Close;

export function PopoverContent({ children, className = "", side = "bottom", sideOffset = 8, align = "start" }: { children: ReactNode; className?: string; side?: "top" | "bottom" | "left" | "right"; sideOffset?: number; align?: "start" | "center" | "end" }) {
  return <PopoverPrimitive.Portal><PopoverPrimitive.Positioner side={side} sideOffset={sideOffset} align={align} className="z-[60]"><PopoverPrimitive.Popup className={`max-w-[min(90vw,340px)] origin-(--transform-origin) rounded-[14px] border border-border-button-default bg-background-primary-default p-4 text-text-primary shadow-dropdown outline-none transition-[opacity,transform] duration-150 ease-out data-starting-style:scale-[0.97] data-starting-style:opacity-0 data-ending-style:scale-[0.97] data-ending-style:opacity-0 motion-reduce:transition-none ${className}`}>{children}</PopoverPrimitive.Popup></PopoverPrimitive.Positioner></PopoverPrimitive.Portal>;
}

export function PopoverTitle({ children }: { children: ReactNode }) { return <PopoverPrimitive.Title className="text-sm font-semibold text-text-primary">{children}</PopoverPrimitive.Title>; }
export function PopoverDescription({ children }: { children: ReactNode }) { return <PopoverPrimitive.Description className="mt-1 text-sm leading-6 text-text-secondary">{children}</PopoverPrimitive.Description>; }
