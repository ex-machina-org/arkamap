import type { HTMLAttributes, ReactNode } from "react";
import { RiInbox2Line } from "@remixicon/react";

export function EmptyState({ title, description, action, className = "", ...props }: HTMLAttributes<HTMLDivElement> & { title: string; description?: string; action?: ReactNode }) {
  return <div className={`flex flex-col items-center justify-center rounded-[16px] border border-dashed border-border-button-default bg-background-secondary-default px-6 py-10 text-center ${className}`} {...props}>
    <span className="mb-4 flex size-11 items-center justify-center rounded-xl border border-border-button-default bg-background-primary-default text-text-secondary shadow-xs"><RiInbox2Line className="size-5" aria-hidden /></span>
    <h3 className="text-body-medium text-text-primary">{title}</h3>
    {description && <p className="mt-1 max-w-sm text-body-2-regular text-text-secondary">{description}</p>}
    {action && <div className="mt-5">{action}</div>}
  </div>;
}
