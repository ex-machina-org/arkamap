import { RiBookOpenLine, RiArrowRightLine } from "@remixicon/react";

export function GuideCard({ title, description, href, actionLabel = "Read guide" }: { title: string; description: string; href: string; actionLabel?: string }) {
  return <section className="rounded-[16px] border border-border-button-default bg-background-secondary-default p-5"><span className="mb-4 flex size-9 items-center justify-center rounded-[10px] border border-border-button-default bg-background-primary-default text-accent-500 shadow-xs"><RiBookOpenLine className="size-5" aria-hidden /></span><h3 className="text-sm font-semibold text-text-primary">{title}</h3><p className="mt-1 text-sm leading-6 text-text-secondary">{description}</p><a href={href} className="mt-4 inline-flex items-center gap-1 rounded text-sm font-medium text-accent-500 hover:underline focus-visible:outline-2 focus-visible:outline-accent-500">{actionLabel}<RiArrowRightLine className="size-4" aria-hidden /></a></section>;
}
