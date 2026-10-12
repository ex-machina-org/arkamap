import type { ReactNode } from "react";
import { Dialog as DialogPrimitive } from "@base-ui/react/dialog";
import { RiCloseLine } from "@remixicon/react";

export const Dialog = DialogPrimitive.Root;
export const DialogTrigger = DialogPrimitive.Trigger;
export const DialogClose = DialogPrimitive.Close;

export function DialogContent({ children, className = "" }: { children: ReactNode; className?: string }) {
  return <DialogPrimitive.Portal>
    <DialogPrimitive.Backdrop className="fixed inset-0 z-50 bg-black/35 backdrop-blur-[2px] transition-opacity data-ending-style:opacity-0 data-starting-style:opacity-0" />
    <DialogPrimitive.Viewport className="fixed inset-0 z-50 flex items-center justify-center overflow-y-auto p-4">
      <DialogPrimitive.Popup className={`relative w-full max-w-md rounded-[16px] border border-border-button-default bg-background-primary-default p-6 text-text-primary shadow-2xl outline-none transition duration-150 data-ending-style:scale-95 data-ending-style:opacity-0 data-starting-style:scale-95 data-starting-style:opacity-0 ${className}`}>
        <DialogPrimitive.Close aria-label="Close dialog" className="absolute right-4 top-4 rounded-lg p-1.5 text-text-secondary hover:bg-background-primary-hover hover:text-text-primary"><RiCloseLine className="size-5" /></DialogPrimitive.Close>
        {children}
      </DialogPrimitive.Popup>
    </DialogPrimitive.Viewport>
  </DialogPrimitive.Portal>;
}

export function DialogHeader({ children, className = "" }: { children: ReactNode; className?: string }) { return <div className={`mb-5 pr-6 ${className}`}>{children}</div>; }
export function DialogTitle({ children, className = "" }: { children: ReactNode; className?: string }) { return <DialogPrimitive.Title className={`text-lg font-semibold tracking-tight ${className}`}>{children}</DialogPrimitive.Title>; }
export function DialogDescription({ children, className = "" }: { children: ReactNode; className?: string }) { return <DialogPrimitive.Description className={`mt-1 text-sm leading-6 text-text-secondary ${className}`}>{children}</DialogPrimitive.Description>; }
export function DialogFooter({ children, className = "" }: { children: ReactNode; className?: string }) { return <div className={`mt-6 flex justify-end gap-2 ${className}`}>{children}</div>; }
