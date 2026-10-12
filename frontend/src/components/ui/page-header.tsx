import type { HTMLAttributes, ReactNode } from "react";

export function PageHeader({ eyebrow, title, description, action, className = "", ...props }: HTMLAttributes<HTMLElement> & { eyebrow?: string; title: string; description?: string; action?: ReactNode }) {
  return <header className={`flex flex-wrap items-start justify-between gap-4 ${className}`} {...props}>
    <div className="min-w-0">{eyebrow && <p className="mb-1 text-caption-1-semibold uppercase tracking-[0.08em] text-text-tertiary">{eyebrow}</p>}
      <h1 className="text-title-2-medium text-text-primary">{title}</h1>
      {description && <p className="mt-1 text-body-regular text-text-secondary">{description}</p>}
    </div>{action && <div className="shrink-0">{action}</div>}
  </header>;
}
