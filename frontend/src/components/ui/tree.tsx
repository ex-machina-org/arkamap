import { useState, type KeyboardEvent } from "react";
import { RiArrowDownSLine, RiFolder2Line, RiFileTextLine } from "@remixicon/react";

export type TreeItem = { id: string; label: string; children?: TreeItem[] };

export function Tree({ items, defaultExpandedIds = [], onSelect, "aria-label": ariaLabel = "Tree" }: { items: TreeItem[]; defaultExpandedIds?: string[]; onSelect?: (item: TreeItem) => void; "aria-label"?: string }) {
  const [expanded, setExpanded] = useState(() => new Set(defaultExpandedIds));
  const [selected, setSelected] = useState<string | null>(null);
  const toggle = (id: string) => setExpanded(current => { const next = new Set(current); if (next.has(id)) next.delete(id); else next.add(id); return next; });
  const keyboard = (event: KeyboardEvent<HTMLButtonElement>, item: TreeItem) => {
    const root = event.currentTarget.closest('[role="tree"]');
    const visible = Array.from(root?.querySelectorAll<HTMLButtonElement>('[role="treeitem"]') ?? []).filter(node => node.getClientRects().length);
    const index = visible.indexOf(event.currentTarget);
    const level = Number(event.currentTarget.getAttribute("aria-level"));
    if (event.key === "ArrowRight" && item.children?.length) {
      event.preventDefault();
      if (!expanded.has(item.id)) toggle(item.id);
      else if (Number(visible[index + 1]?.getAttribute("aria-level")) === level + 1) visible[index + 1]?.focus();
    }
    if (event.key === "ArrowLeft") {
      if (item.children?.length && expanded.has(item.id)) { event.preventDefault(); toggle(item.id); }
      else { const parent = visible.slice(0, index).reverse().find(node => Number(node.getAttribute("aria-level")) === level - 1); if (parent) { event.preventDefault(); parent.focus(); } }
    }
    if (["ArrowDown", "ArrowUp", "Home", "End"].includes(event.key)) {
      event.preventDefault();
      const target = event.key === "Home" ? visible[0] : event.key === "End" ? visible.at(-1) : visible[index + (event.key === "ArrowDown" ? 1 : -1)];
      target?.focus();
    }
  };
  const render = (item: TreeItem, level: number) => {
    const hasChildren = Boolean(item.children?.length);
    const isOpen = expanded.has(item.id);
    return <div key={item.id}>
      <button type="button" role="treeitem" aria-level={level} aria-expanded={hasChildren ? isOpen : undefined} aria-selected={selected === item.id} onKeyDown={event => keyboard(event, item)} onClick={() => { setSelected(item.id); if (hasChildren) toggle(item.id); onSelect?.(item); }} className="group flex w-full items-center gap-2 rounded-[8px] px-2 py-1.5 text-left text-sm text-text-primary outline-none hover:bg-background-primary-hover focus-visible:ring-2 focus-visible:ring-accent-500 aria-selected:bg-background-primary-hover" style={{ paddingLeft: `${(level - 1) * 16 + 8}px` }}>
        {hasChildren ? <RiArrowDownSLine className={`size-4 shrink-0 text-text-tertiary transition-transform duration-150 motion-reduce:transition-none ${isOpen ? "" : "-rotate-90"}`} aria-hidden /> : <span className="w-4" />}
        {hasChildren ? <RiFolder2Line className="size-4 shrink-0 text-text-secondary" aria-hidden /> : <RiFileTextLine className="size-4 shrink-0 text-text-secondary" aria-hidden />}
        <span className="truncate">{item.label}</span>
      </button>
      {hasChildren && isOpen && <div role="group">{item.children!.map(child => render(child, level + 1))}</div>}
    </div>;
  };
  return <div role="tree" aria-label={ariaLabel} className="w-full rounded-xl border border-border-button-default bg-background-primary-default p-2 shadow-xs">{items.map(item => render(item, 1))}</div>;
}
