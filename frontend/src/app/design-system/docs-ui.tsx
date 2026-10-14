import { useState, type ReactNode } from "react";
import { RiCheckLine, RiFileCopyLine } from "@remixicon/react";

export function DocSection({ id, title, description, children }: { id: string; title: string; description?: string; children: ReactNode }) {
  return <section id={id} className="scroll-mt-24 border-t border-border-button-default pt-9 sm:pt-10">
    <h2 className="text-[20px] font-semibold tracking-[-0.02em] text-text-primary">{title}</h2>
    {description && <p className="mt-2 max-w-[66ch] text-body-regular text-text-secondary">{description}</p>}
    <div className="mt-5">{children}</div>
  </section>;
}

export function UsageGuide({ use, avoid }: { use: string; avoid: string }) {
  return <div className="grid gap-3 sm:grid-cols-2">
    <div className="rounded-xl border border-accent-200 bg-accent-50 p-4 dark:border-accent-700/60 dark:bg-accent-950/40"><p className="text-xs font-semibold uppercase tracking-wide text-accent-700 dark:text-accent-300">Use when</p><p className="mt-2 text-sm leading-6 text-text-primary">{use}</p></div>
    <div className="rounded-xl border border-border-button-default bg-background-secondary-default p-4"><p className="text-xs font-semibold uppercase tracking-wide text-text-secondary">Avoid when</p><p className="mt-2 text-sm leading-6 text-text-primary">{avoid}</p></div>
  </div>;
}

export function ComponentPreview({ title, children, code, previewClassName = "" }: { title?: string; children: ReactNode; code?: string; previewClassName?: string }) {
  const [copied, setCopied] = useState(false);
  async function copy() { if (!code) return; await navigator.clipboard.writeText(code); setCopied(true); window.setTimeout(() => setCopied(false), 1600); }
  return <div className="overflow-hidden rounded-[14px] border border-border-button-default bg-background-primary-default shadow-xs">
    {title && <div className="border-b border-border-button-default px-5 py-3 text-sm font-medium text-text-secondary">{title}</div>}
    <div className={`flex min-h-32 flex-wrap items-center gap-3 p-6 sm:p-8 ${previewClassName}`}>{children}</div>
    {code && <div className="relative border-t border-border-button-default bg-background-secondary-default"><button type="button" onClick={copy} aria-label={copied ? "Copied code" : "Copy code"} className="absolute right-3 top-3 rounded-md border border-border-button-default bg-background-primary-default p-1.5 text-text-secondary hover:text-text-primary">{copied ? <RiCheckLine className="size-4" /> : <RiFileCopyLine className="size-4" />}</button><pre className="overflow-x-auto px-5 py-5 pr-14 text-xs leading-6 text-text-secondary"><code>{code}</code></pre></div>}
  </div>;
}

export function ComponentDoc({ title, description, source, sections, children }: { title: string; description: string; source?: string; sections: { id: string; label: string }[]; children: ReactNode }) {
  return <div className="mx-auto grid max-w-[1180px] gap-12 xl:grid-cols-[minmax(0,1fr)_176px]">
    <article className="min-w-0 max-w-[860px]">
      <header className="mb-10 border-b border-border-button-default pb-8"><p className="mb-3 text-xs font-semibold uppercase tracking-[0.12em] text-accent-600">JOINTS DESIGN SYSTEM</p><h1 className="text-[32px] font-semibold tracking-[-0.035em] text-text-primary sm:text-[38px]">{title}</h1><p className="mt-3 max-w-2xl text-[15px] leading-7 text-text-secondary">{description}</p>{source && <code className="mt-4 inline-block max-w-full break-all rounded-md bg-background-secondary-default px-2.5 py-1.5 text-xs text-text-secondary">{source}</code>}</header>
      <div className="space-y-10 pb-24">{children}</div>
    </article>
    <aside className="hidden xl:block"><div className="sticky top-24"><p className="mb-3 text-xs font-semibold uppercase tracking-wide text-text-tertiary">On this page</p><nav className="flex flex-col gap-1 border-l border-border-button-default" aria-label="On this page">{sections.map(section => <a key={section.id} href={`#${section.id}`} className="-ml-px border-l-2 border-transparent py-1.5 pl-3 text-sm text-text-secondary hover:border-accent-500 hover:text-text-primary">{section.label}</a>)}</nav></div></aside>
  </div>;
}
