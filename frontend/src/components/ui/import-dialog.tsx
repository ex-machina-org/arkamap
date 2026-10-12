import { useId, useState, type DragEvent } from "react";
import { RiUploadCloud2Line } from "@remixicon/react";
import { Button } from "@/components/base/buttons/button";
import { Dialog, DialogClose, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "./dialog";

export function ImportDialog({ open, onOpenChange, onImport, accept = ".csv,.xlsx", title = "Import data" }: { open: boolean; onOpenChange: (open: boolean) => void; onImport: (file: File) => void; accept?: string; title?: string }) {
  const id = useId();
  const [file, setFile] = useState<File | null>(null);
  const [error, setError] = useState("");
  const [dragging, setDragging] = useState(false);
  const changeOpen = (nextOpen: boolean) => { if (!nextOpen) { setFile(null); setError(""); setDragging(false); } onOpenChange(nextOpen); };
  const allowed = accept.split(",").map(item => item.trim().toLowerCase());
  function choose(next?: File) {
    if (!next) return;
    if (!allowed.some(ext => next.name.toLowerCase().endsWith(ext))) { setFile(null); setError(`Choose a ${allowed.join(" or ")} file.`); return; }
    setFile(next); setError("");
  }
  function drop(event: DragEvent<HTMLLabelElement>) { event.preventDefault(); setDragging(false); choose(event.dataTransfer.files[0]); }
  function submit() { if (!file) return; onImport(file); setFile(null); onOpenChange(false); }
  return <Dialog open={open} onOpenChange={changeOpen}><DialogContent><DialogHeader><DialogTitle>{title}</DialogTitle><DialogDescription>Select or drop a file. Accepted formats: {allowed.join(", ")}.</DialogDescription></DialogHeader><label htmlFor={id} onDragOver={event => { event.preventDefault(); setDragging(true); }} onDragLeave={() => setDragging(false)} onDrop={drop} className={`flex cursor-pointer flex-col items-center rounded-xl border border-dashed px-5 py-8 text-center transition-colors focus-within:border-accent-500 focus-within:ring-2 focus-within:ring-accent-500/30 motion-reduce:transition-none ${dragging ? "border-accent-500 bg-accent-50 dark:bg-accent-950/40" : "border-border-button-default bg-background-secondary-default hover:border-accent-500"}`}><RiUploadCloud2Line className="size-7 text-accent-500" aria-hidden /><span className="mt-2 text-sm font-medium text-text-primary">{file ? file.name : "Choose a file or drop it here"}</span><span className="mt-1 text-xs text-text-secondary">{file ? `${Math.ceil(file.size / 1024)} KB selected` : allowed.join(", ")}</span><input id={id} type="file" accept={accept} className="sr-only" onChange={event => choose(event.target.files?.[0])} /></label>{error && <p role="alert" className="mt-2 text-xs text-text-error-primary">{error}</p>}<DialogFooter><DialogClose className="rounded-lg border border-border-button-default px-3 py-2 text-sm text-text-primary outline-none hover:bg-background-primary-hover focus-visible:ring-2 focus-visible:ring-accent-500">Cancel</DialogClose><Button disabled={!file} onClick={submit}>Import file</Button></DialogFooter></DialogContent></Dialog>;
}
