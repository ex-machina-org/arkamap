import { RiHistoryLine } from "@remixicon/react";

export type AuditEntry = { id: string; action: string; actor: string; time: string; detail?: string };
export function AuditCard({ title = "Recent changes", entries }: { title?: string; entries: AuditEntry[] }) {
  return <section className="rounded-[16px] border border-border-button-default bg-background-primary-default p-5 shadow-xs"><div className="mb-4 flex items-center gap-2"><RiHistoryLine className="size-4 text-text-secondary" aria-hidden /><h3 className="text-sm font-semibold text-text-primary">{title}</h3></div><ol className="space-y-0">{entries.map((entry, index) => <li key={entry.id} className={`flex gap-3 py-3 ${index ? "border-t border-border-button-default" : ""}`}><span className="mt-1 size-2 shrink-0 rounded-full bg-accent-500" aria-hidden /><div className="min-w-0 flex-1"><p className="text-sm font-medium text-text-primary">{entry.action}</p><p className="mt-0.5 text-xs text-text-secondary">{entry.actor} · {entry.time}</p>{entry.detail && <p className="mt-1 text-xs text-text-secondary">{entry.detail}</p>}</div></li>)}</ol></section>;
}
