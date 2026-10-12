import type { ComponentProps } from "react";

export function NativeSelect({ className = "", children, ...props }: ComponentProps<"select">) {
  return <select {...props} className={`h-9 rounded-[10px] border border-border-button-default bg-background-primary-default px-3 text-sm text-text-primary shadow-xs outline-none focus:border-accent-500 focus:ring-2 focus:ring-accent-500/20 disabled:opacity-50 ${className}`}>{children}</select>;
}
