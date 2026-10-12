import type { ComponentProps } from "react";

export function Textarea({ className = "", ...props }: ComponentProps<"textarea">) {
  return <textarea {...props} className={`min-h-28 w-full resize-y rounded-[10px] border border-border-button-default bg-background-primary-default px-3 py-2.5 text-sm leading-6 text-text-primary shadow-xs outline-none placeholder:text-text-tertiary focus:border-accent-500 focus:ring-2 focus:ring-accent-500/20 disabled:cursor-not-allowed disabled:opacity-50 ${className}`} />;
}
