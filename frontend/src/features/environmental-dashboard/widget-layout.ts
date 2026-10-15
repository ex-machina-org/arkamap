import type { DTO } from "@/lib/api/client";
import type { DashboardView, EventKind } from "./types";

/**
 * The whole dashboard is a list of widget instances placed on a 12-column grid. An instance
 * is a type plus its configuration (which event kind, which metric, which sensor field).
 * Which instances a profile starts with is `defaultWidgets`; the user can then move, resize,
 * add, configure and remove them. Arrangements are saved per profile.
 */
export type WidgetType =
  | "kpi-mode" | "kpi-event" | "kpi-alerts" | "kpi-iot" | "kpi-indicator"
  | "ranking" | "map" | "impact" | "insight" | "score" | "indicators" | "history"
  | "sensor";
export type IotStat = "devices" | "active" | "reporting" | "rejected";
export type WidgetConfig = { kind?: EventKind; stat?: IotStat; metric?: string; deviceId?: number; field?: string };
/** `title` is the user's own name for the widget; without it each widget names itself. */
export type WidgetInstance = { id: string; type: WidgetType; config: WidgetConfig; title?: string };
export type Placement = { i: string; x: number; y: number; w: number; h: number };
export type WidgetSize = { w: number; h: number; minW: number; minH: number };

export const GRID = { cols: 12, rowHeight: 40, gap: 16 } as const;
/** Pixel height of `h` grid rows, so the stacked (narrow) layout keeps the same heights. */
export const rowsToPx = (h: number) => h * GRID.rowHeight + (h - 1) * GRID.gap;

const KPI: WidgetSize = { w: 3, h: 4, minW: 2, minH: 3 };
const CARD: WidgetSize = { w: 6, h: 8, minW: 4, minH: 6 };
export const WIDGET_SIZES: Record<WidgetType, WidgetSize> = {
  "kpi-mode": KPI, "kpi-event": KPI, "kpi-alerts": KPI, "kpi-indicator": KPI,
  "kpi-iot": { w: 3, h: 3, minW: 2, minH: 3 },
  ranking: CARD, map: CARD, impact: CARD, insight: CARD, score: CARD, history: CARD,
  indicators: { w: 12, h: 11, minW: 6, minH: 7 },
  sensor: { w: 4, h: 7, minW: 3, minH: 5 },
};
/** Width choices offered in a widget's settings, in grid columns. */
export const WIDTH_PRESETS = [{ w: 3, label: "1/4" }, { w: 4, label: "1/3" }, { w: 6, label: "1/2" }, { w: 8, label: "2/3" }, { w: 12, label: "Penuh" }] as const;

/** Stable id from type and configuration, so the same widget is never added twice. */
export function widgetId(type: WidgetType, config: WidgetConfig = {}) {
  const parts = [config.kind, config.stat, config.metric, config.deviceId, config.field].filter(part => part != null);
  return parts.length ? `${type}:${parts.join(":")}` : type;
}
export const instance = (type: WidgetType, config: WidgetConfig = {}): WidgetInstance => ({ id: widgetId(type, config), type, config });

const IOT_STATS: IotStat[] = ["devices", "active", "reporting", "rejected"];

/**
 * What a profile starts with: the KPI band, device numbers when there are devices, the
 * cards the mode asks for in the backend's panel order, then every visible sensor field.
 *
 * The card choice is the single place to swap for an AI choice later (a backend
 * `view.widgets` list picked by Gemini with structured output). Anything it returns must
 * still pass the data checks here, so a widget never renders empty because it was asked for.
 */
export function defaultWidgets(view: DashboardView, devices: DTO<"DeviceDashboard">[], hasIndicators: boolean): WidgetInstance[] {
  const out: WidgetInstance[] = [instance("kpi-mode"), ...view.events.map(event => instance("kpi-event", { kind: event.kind })), instance("kpi-alerts")];
  if (devices.length) out.push(...IOT_STATS.map(stat => instance("kpi-iot", { stat })));
  const cards: WidgetInstance[] = [];
  const add = (item: WidgetInstance) => { if (!cards.some(card => card.id === item.id)) cards.push(item); };
  for (const panel of view.mode.panels) {
    if (panel === "ranking" && view.ranking.results.length) add(instance("ranking"));
    if (panel === "impact" && view.impact) add(instance("impact"));
    if (panel === "events" || panel === "alerts") add(instance("insight"));
    if (panel === "history") for (const series of view.history ?? []) if (series.months.length) add(instance("history", { kind: series.kind }));
  }
  if (view.focus) cards.splice(Math.min(1, cards.length), 0, instance("map"));
  if (view.mode.id === "responden" && view.focus) add(instance("score"));
  if (hasIndicators) add(instance("indicators"));
  out.push(...cards);
  for (const { device, widgets } of devices) for (const widget of widgets) if (!widget.hidden) out.push(instance("sensor", { deviceId: device.id, field: widget.field }));
  return out;
}

/** Reading-order packing: widgets fill rows left to right and wrap when a row is full. */
export function packLayout(items: WidgetInstance[], startY = 0): Placement[] {
  const out: Placement[] = [];
  let x = 0, y = startY, rowHeight = 0;
  for (const item of items) {
    const { w, h } = WIDGET_SIZES[item.type];
    if (x + w > GRID.cols) { x = 0; y += rowHeight; rowHeight = 0; }
    out.push({ i: item.id, x, y, w, h });
    x += w;
    rowHeight = Math.max(rowHeight, h);
  }
  return out;
}

export const byReadingOrder = (a: Placement, b: Placement) => a.y - b.y || a.x - b.x;
const bottomOf = (layout: Placement[]) => layout.reduce((max, item) => Math.max(max, item.y + item.h), 0);

/** Places `added` under everything already on the grid. */
export const appendLayout = (layout: Placement[], added: WidgetInstance[]) => [...layout, ...packLayout(added, bottomOf(layout))];

export type SavedLayout = { version: 2; items: WidgetInstance[]; layout: Placement[]; seen: string[] };

/**
 * A saved dashboard against today's defaults. The user's own list wins; a default that
 * appeared since the last save (a new device field, a new event kind) is appended at the
 * bottom, while a default the user removed stays removed because it was already seen.
 */
export function resolveLayout(saved: SavedLayout | undefined, defaults: WidgetInstance[]): { items: WidgetInstance[]; layout: Placement[] } {
  if (!saved) return { items: defaults, layout: packLayout(defaults) };
  const fresh = defaults.filter(item => !saved.seen.includes(item.id) && !saved.items.some(own => own.id === item.id));
  const items = [...saved.items, ...fresh];
  const kept = saved.layout.filter(place => items.some(item => item.id === place.i));
  return { items, layout: appendLayout(kept, items.filter(item => !kept.some(place => place.i === item.id))) };
}

/** Keyboard alternative to dragging: trade places with the neighbour in reading order. */
export function moveWidget(layout: Placement[], id: string, step: -1 | 1): Placement[] {
  const order = [...layout].sort(byReadingOrder);
  const index = order.findIndex(item => item.i === id);
  const other = order[index + step];
  if (index < 0 || !other) return layout;
  const self = order[index];
  return layout.map(item => item.i === self.i ? { ...item, x: other.x, y: other.y }
    : item.i === other.i ? { ...item, x: self.x, y: self.y } : item);
}
