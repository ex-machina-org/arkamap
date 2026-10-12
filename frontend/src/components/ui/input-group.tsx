import { useId, type InputHTMLAttributes, type ReactNode } from "react";

export function InputGroup({ label, prefix, suffix, hint, className = "", id, ...props }: Omit<InputHTMLAttributes<HTMLInputElement>, "prefix"> & { label?: string; prefix?: ReactNode; suffix?: ReactNode; hint?: string }) {
  const generatedId = useId();
  const inputId = id ?? generatedId;
  return <div className={`w-full ${className}`}>
    {label && <label htmlFor={inputId} className="mb-1.5 block text-sm font-medium text-text-primary">{label}</label>}
    <div className="flex h-9 items-center overflow-hidden rounded-[10px] border border-border-button-default bg-background-primary-default text-sm text-text-primary shadow-xs focus-within:border-accent-500 focus-within:ring-2 focus-within:ring-accent-500/20">
      {prefix && <span className="shrink-0 border-r border-border-button-default bg-background-secondary-default px-3 py-2 text-text-secondary">{prefix}</span>}
      <input id={inputId} {...props} aria-describedby={hint ? `${inputId}-hint` : props["aria-describedby"]} className="min-w-0 flex-1 bg-transparent px-3 py-2 outline-none placeholder:text-text-tertiary disabled:opacity-50" />
      {suffix && <span className="shrink-0 border-l border-border-button-default bg-background-secondary-default px-3 py-2 text-text-secondary">{suffix}</span>}
    </div>
    {hint && <p id={`${inputId}-hint`} className="mt-1.5 text-xs text-text-secondary">{hint}</p>}
  </div>;
}
