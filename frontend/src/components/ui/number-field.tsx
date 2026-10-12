import { useId, useState, type InputHTMLAttributes } from "react";
import { RiAddLine, RiSubtractLine } from "@remixicon/react";

export function NumberField({ label, value, defaultValue = 0, onValueChange, min, max, step = 1, disabled = false, className = "", ...props }: Omit<InputHTMLAttributes<HTMLInputElement>, "value" | "defaultValue" | "onChange" | "min" | "max" | "step" | "type"> & { label: string; value?: number; defaultValue?: number; onValueChange?: (value: number) => void; min?: number; max?: number; step?: number }) {
  const id = useId();
  const [internal, setInternal] = useState(defaultValue);
  const [draft, setDraft] = useState<string | null>(null);
  const current = value ?? internal;
  const clamp = (next: number) => Math.min(max ?? Infinity, Math.max(min ?? -Infinity, next));
  const change = (next: number) => { const bounded = clamp(next); setDraft(null); if (value === undefined) setInternal(bounded); onValueChange?.(bounded); };
  const commitDraft = () => { if (draft === null) return; const parsed = Number(draft); change(draft.trim() && Number.isFinite(parsed) ? parsed : current); };
  return <div className={className}>
    <label htmlFor={id} className="mb-1.5 block text-sm font-medium text-text-primary">{label}</label>
    <div className="inline-flex h-9 items-center overflow-hidden rounded-[10px] border border-border-button-default bg-background-primary-default shadow-xs focus-within:border-accent-500 focus-within:ring-2 focus-within:ring-accent-500/20">
      <button type="button" aria-label={`Decrease ${label}`} disabled={disabled || current <= (min ?? -Infinity)} onClick={() => change(current - step)} className="flex h-full w-9 items-center justify-center border-r border-border-button-default text-text-secondary outline-none hover:bg-background-primary-hover focus-visible:bg-background-primary-hover disabled:opacity-40"><RiSubtractLine className="size-4" /></button>
      <input {...props} id={id} type="number" inputMode="decimal" min={min} max={max} step={step} disabled={disabled} value={draft ?? current} onChange={event => setDraft(event.target.value)} onBlur={commitDraft} onKeyDown={event => { if (event.key === "Enter") event.currentTarget.blur(); }} className="w-16 bg-transparent px-2 text-center text-sm text-text-primary outline-none [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none" />
      <button type="button" aria-label={`Increase ${label}`} disabled={disabled || current >= (max ?? Infinity)} onClick={() => change(current + step)} className="flex h-full w-9 items-center justify-center border-l border-border-button-default text-text-secondary outline-none hover:bg-background-primary-hover focus-visible:bg-background-primary-hover disabled:opacity-40"><RiAddLine className="size-4" /></button>
    </div>
  </div>;
}
