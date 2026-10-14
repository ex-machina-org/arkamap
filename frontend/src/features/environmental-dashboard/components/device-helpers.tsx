import { useState, type ComponentType } from "react";
import { RiAddCircleLine, RiDropLine, RiPlantLine, RiRainyLine, RiWaterFlashLine, RiWindyLine } from "@remixicon/react";
import { toast } from "sonner";
import { Button } from "@/components/base/buttons/button";
import { Dialog, DialogClose, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import type { DeviceKindChoice } from "../device-data";

type IconComponent = ComponentType<{ className?: string; "aria-hidden"?: boolean | "true" | "false" }>;

export const KIND_ICON: Record<DeviceKindChoice, IconComponent> = {
  awlr: RiWaterFlashLine,
  peat_level: RiPlantLine,
  air_quality: RiWindyLine,
  water_quality: RiDropLine,
  rainfall: RiRainyLine,
  other: RiAddCircleLine,
};

export function copyText(text: string, label: string) {
  void navigator.clipboard.writeText(text).then(() => toast.success(`${label} disalin`)).catch(() => toast.error("Clipboard tidak tersedia"));
}

type ConfirmRequest = { title: string; description: string; confirmLabel: string; destructive?: boolean; run: () => void };

/**
 * Replaces `window.confirm` with a dialog whose confirm button repeats the
 * consequence. `ask` opens it; `dialog` must be rendered once.
 */
export function useConfirm() {
  const [request, setRequest] = useState<ConfirmRequest>();
  const dialog = <Dialog open={Boolean(request)} onOpenChange={open => { if (!open) setRequest(undefined); }}>
    {request && <DialogContent>
      <DialogHeader><DialogTitle>{request.title}</DialogTitle><DialogDescription>{request.description}</DialogDescription></DialogHeader>
      <DialogFooter>
        <DialogClose render={<Button variant="secondary">Batal</Button>} />
        <Button variant={request.destructive ? "danger" : "primary"} onClick={() => { request.run(); setRequest(undefined); }}>{request.confirmLabel}</Button>
      </DialogFooter>
    </DialogContent>}
  </Dialog>;
  return { ask: setRequest, dialog };
}
