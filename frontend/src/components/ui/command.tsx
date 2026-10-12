import { Command } from "cmdk";
import { RiSearchLine } from "@remixicon/react";

export type CommandAction = { id: string; label: string; group: string; keywords?: string; onSelect: () => void };

export function CommandMenu({ open, onOpenChange, actions }: { open: boolean; onOpenChange: (open: boolean) => void; actions: CommandAction[] }) {
  const groups = [...new Set(actions.map(action => action.group))];
  return <Command.Dialog open={open} onOpenChange={onOpenChange} label="Arkamap command menu" overlayClassName="fixed inset-0 z-[80] bg-black/40 backdrop-blur-[2px]" contentClassName="fixed inset-0 z-[81] flex items-center justify-center p-4 pointer-events-none" className="joints-command pointer-events-auto relative w-full max-w-[520px] overflow-hidden rounded-[16px] border border-border-button-default bg-background-primary-default text-text-primary shadow-2xl outline-none">
    <div className="flex items-center gap-3 border-b border-border-button-default px-4"><RiSearchLine className="size-5 shrink-0 text-text-tertiary" aria-hidden /><Command.Input autoFocus placeholder="Search pages and actions..." className="h-13 w-full bg-transparent text-sm outline-none placeholder:text-text-tertiary" /><kbd className="rounded border border-border-button-default px-1.5 py-0.5 text-[10px] text-text-tertiary">ESC</kbd></div>
    <Command.List className="max-h-[min(50vh,360px)] overflow-y-auto p-2"><Command.Empty className="px-3 py-8 text-center text-sm text-text-secondary">No results found.</Command.Empty>{groups.map(group => <Command.Group key={group} heading={group} className="[&_[cmdk-group-heading]]:px-3 [&_[cmdk-group-heading]]:py-2 [&_[cmdk-group-heading]]:text-[11px] [&_[cmdk-group-heading]]:font-semibold [&_[cmdk-group-heading]]:uppercase [&_[cmdk-group-heading]]:tracking-wide [&_[cmdk-group-heading]]:text-text-tertiary">{actions.filter(action => action.group === group).map(action => <Command.Item key={action.id} value={`${action.label} ${action.keywords ?? ""}`} onSelect={() => { onOpenChange(false); action.onSelect(); }} className="cursor-pointer rounded-[9px] px-3 py-2.5 text-sm text-text-primary outline-none">{action.label}</Command.Item>)}</Command.Group>)}</Command.List>
    <div className="border-t border-border-button-default px-4 py-2 text-[11px] text-text-tertiary">{"Use \u2191 \u2193 to navigate \u00b7 Enter to select"}</div>
  </Command.Dialog>;
}
