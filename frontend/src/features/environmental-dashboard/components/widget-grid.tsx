import { useMemo, type ReactNode } from "react";
import { RiArrowDownLine, RiArrowUpLine, RiDraggable, RiSettings3Line } from "@remixicon/react";
import ReactGridLayout, { useContainerWidth, type Layout } from "react-grid-layout";
import "react-grid-layout/css/styles.css";
import { Button } from "@/components/base/buttons/button";
import { cx } from "@/utils/cx";
import { GRID, WIDGET_SIZES, byReadingOrder, rowsToPx, type Placement, type WidgetType } from "../widget-layout";
import "./widget-grid.css";

export type WidgetItem = { id: string; type: WidgetType; title: string; node: ReactNode };

// Below this the cards stack in one column in reading order; editing there uses the move buttons.
const GRID_MIN_WIDTH = 960;

/** Edit chrome over a widget: drag handle, keyboard moves, and settings. The widget itself is inert meanwhile. */
function EditBar({ title, first, last, onMove, onSettings }: { title: string; first: boolean; last: boolean; onMove: (step: -1 | 1) => void; onSettings: () => void }) {
  return <div className="absolute inset-x-2 top-2 z-10 flex items-center gap-1 rounded-xl bg-background-primary-default p-1 shadow-dropdown">
    <span className="widget-drag-handle flex min-w-0 flex-1 cursor-grab items-center gap-1.5 px-1.5 active:cursor-grabbing" title="Seret untuk memindahkan">
      <RiDraggable className="size-4 shrink-0 text-text-tertiary" aria-hidden />
      <span className="truncate text-body-2-medium text-text-primary">{title}</span>
    </span>
    <Button size="xs" variant="ghost" iconOnly leadingIcon={RiArrowUpLine} aria-label={`Pindahkan ${title} ke sebelumnya`} disabled={first} onClick={() => onMove(-1)} />
    <Button size="xs" variant="ghost" iconOnly leadingIcon={RiArrowDownLine} aria-label={`Pindahkan ${title} ke berikutnya`} disabled={last} onClick={() => onMove(1)} />
    <Button size="xs" variant="ghost" iconOnly leadingIcon={RiSettings3Line} aria-label={`Atur ${title}`} onClick={onSettings} />
  </div>;
}

/**
 * Dashboard widgets on a 12-column grid. Drag and resize only while `editing`, and only on
 * wide screens; narrow screens stack the same widgets in reading order at the same heights,
 * and are rearranged with the move buttons.
 */
export function WidgetGrid({ widgets, layout, editing, onLayoutChange, onMove, onSettings }: {
  widgets: WidgetItem[];
  layout: Placement[];
  editing: boolean;
  onLayoutChange: (layout: readonly Placement[]) => void;
  onMove: (id: string, step: -1 | 1) => void;
  onSettings: (id: string) => void;
}) {
  const { width, containerRef, mounted } = useContainerWidth();
  const byId = useMemo(() => new Map(widgets.map(widget => [widget.id, widget])), [widgets]);
  const placed = useMemo(() => layout.flatMap(item => {
    const widget = byId.get(item.i);
    if (!widget) return [];
    const { minW, minH } = WIDGET_SIZES[widget.type];
    return [{ ...item, minW, minH }];
  }), [layout, byId]);
  const order = useMemo(() => [...placed].sort(byReadingOrder), [placed]);
  const wide = mounted && width >= GRID_MIN_WIDTH;

  const cell = (id: string) => {
    const widget = byId.get(id)!;
    const index = order.findIndex(item => item.i === id);
    return <div className={cx("relative h-full min-w-0", editing && "widget-editing")}>
      <div className="h-full min-w-0" inert={editing || undefined}>{widget.node}</div>
      {editing && <EditBar title={widget.title} first={index === 0} last={index === order.length - 1} onMove={step => onMove(id, step)} onSettings={() => onSettings(id)} />}
    </div>;
  };

  return <div ref={containerRef} className="min-w-0">
    {wide ? <ReactGridLayout
      className="widget-grid"
      width={width}
      layout={placed}
      gridConfig={{ cols: GRID.cols, rowHeight: GRID.rowHeight, margin: [GRID.gap, GRID.gap], containerPadding: [0, 0] }}
      dragConfig={{ enabled: editing, handle: ".widget-drag-handle" }}
      resizeConfig={{ enabled: editing, handles: ["se"] }}
      // Only a user's drag or resize is saved; the grid also reports on mount and compaction.
      onDragStop={(next: Layout) => onLayoutChange(next as Placement[])}
      onResizeStop={(next: Layout) => onLayoutChange(next as Placement[])}>
      {placed.map(item => <div key={item.i}>{cell(item.i)}</div>)}
    </ReactGridLayout> : <div className="flex flex-col gap-4">
      {order.map(item => <div key={item.i} style={{ height: rowsToPx(item.h) }}>{cell(item.i)}</div>)}
    </div>}
  </div>;
}
