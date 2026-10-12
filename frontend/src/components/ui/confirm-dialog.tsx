import { useState } from "react";
import { Button } from "@/components/base/buttons/button";
import { Dialog, DialogClose, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "./dialog";
import { Textarea } from "./textarea";

export function ConfirmDialog({ open, onOpenChange, title, description, confirmLabel = "Confirm", destructive = false, requireReason = false, onConfirm }: { open: boolean; onOpenChange: (open: boolean) => void; title: string; description: string; confirmLabel?: string; destructive?: boolean; requireReason?: boolean; onConfirm: (reason: string) => void }) {
  const [reason, setReason] = useState("");
  const changeOpen = (nextOpen: boolean) => { if (!nextOpen) setReason(""); onOpenChange(nextOpen); };
  const confirm = () => { onConfirm(reason.trim()); setReason(""); onOpenChange(false); };
  return <Dialog open={open} onOpenChange={changeOpen}><DialogContent><DialogHeader><DialogTitle>{title}</DialogTitle><DialogDescription>{description}</DialogDescription></DialogHeader>{requireReason && <div><label htmlFor="confirm-reason" className="mb-1.5 block text-sm font-medium text-text-primary">Reason</label><Textarea id="confirm-reason" value={reason} onChange={event => setReason(event.target.value)} placeholder="Explain this decision" /></div>}<DialogFooter><DialogClose className="rounded-lg border border-border-button-default px-3 py-2 text-sm text-text-primary outline-none hover:bg-background-primary-hover focus-visible:ring-2 focus-visible:ring-accent-500">Cancel</DialogClose><Button variant={destructive ? "danger" : "primary"} disabled={requireReason && !reason.trim()} onClick={confirm}>{confirmLabel}</Button></DialogFooter></DialogContent></Dialog>;
}
