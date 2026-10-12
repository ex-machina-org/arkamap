import type { ComponentProps } from "react";

export function Collapsible(props: ComponentProps<"details">) {
  return <details {...props} className={`group rounded-xl border border-border-button-default bg-background-primary-default ${props.className ?? ""}`} />;
}

export function CollapsibleTrigger(props: ComponentProps<"summary">) {
  return <summary {...props} className={`flex cursor-pointer list-none items-center justify-between gap-3 rounded-xl px-4 py-3 text-sm font-medium text-text-primary outline-none focus-visible:ring-2 focus-visible:ring-accent-500 [&::-webkit-details-marker]:hidden ${props.className ?? ""}`} />;
}

export function CollapsibleContent(props: ComponentProps<"div">) {
  return <div {...props} className={`border-t border-border-button-default px-4 py-3 text-sm leading-6 text-text-secondary ${props.className ?? ""}`} />;
}
