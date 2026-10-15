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
  | "trend" | "panel" | "sensor";
export type IotStat = "devices" | "active" | "reporting" | "rejected";
export type WidgetConfig = { kind?: EventKind; stat?: IotStat; metric?: string; deviceId?: number; field?: string; panel?: string };
/** `title` is the user's own name for the widget; without it each widget names itself. */
export type WidgetInstance = { id: string; type: WidgetType; config: WidgetConfig; title?: string };
export type Placement = { i: string; x: number; y: number; w: number; h: number };
export type WidgetSize = { w: number; h: number; minW: number; minH: number };

export const GRID = { cols: 12, rowHeight: 40, gap: 16 } as const;
/** Pixel height of `h` grid rows, so the stacked (narrow) layout keeps the same heights. */
export const rowsToPx = (h: number) => h * GRID.rowHeight + (h - 1) * GRID.gap;

const KPI: WidgetSize = { w: 3, h: 4, minW: 2, minH: 3 };
const CARD: WidgetSize = { w: 6, h: 8, minW: 4, minH: 6 };
// Bento sizes: a wide tile for what reads best wide (maps, charts over time), a narrow tall
// one beside it for a gauge or a ranked list, a short one where two stack beside a tall tile.
const WIDE: WidgetSize = { w: 8, h: 8, minW: 4, minH: 6 };
const SIDE: WidgetSize = { w: 4, h: 8, minW: 3, minH: 6 };
const SHORT: WidgetSize = { w: 4, h: 5, minW: 3, minH: 4 };
export const WIDGET_SIZES: Record<WidgetType, WidgetSize> = {
  "kpi-mode": KPI, "kpi-event": KPI, "kpi-alerts": KPI, "kpi-indicator": KPI,
  "kpi-iot": { w: 3, h: 3, minW: 2, minH: 3 },
  map: { ...WIDE, h: 9 }, insight: { ...SIDE, h: 9 }, ranking: CARD, score: SIDE, impact: CARD, history: CARD,
  trend: { w: 6, h: 7, minW: 4, minH: 6 }, panel: { w: 6, h: 8, minW: 3, minH: 4 },
  // One table page (8 rows) without a scrollbar; fewer rows leave room inside the card, not a hole below it.
  indicators: { w: 12, h: 9, minW: 6, minH: 6 },
  sensor: { w: 4, h: 7, minW: 3, minH: 5 },
};
/** Each catalogue panel's starting size, by what it draws; unknown panels get the panel default. */
const PANEL_SIZES: Record<string, WidgetSize> = {
  // Air and fire panels carry a plain explanation and a verdict above the chart, so they get more height.
  aq_index: { ...SIDE, h: 10 }, aq_pollutants: { ...CARD, h: 10 }, aq_pm25_week: { ...WIDE, h: 10 }, aq_pollutants_week: WIDE,
  aq_outlook: { ...SHORT, h: 7 }, aq_ranking: SIDE,
  fire_smoke_week: { ...WIDE, h: 11 }, fire_risk: { ...SIDE, h: 10 }, fire_week: SHORT,
  heat_week: CARD, heat_now: { ...SHORT, w: 6 }, rain_outlook: SHORT,
  water_now: CARD, marine_week: { ...WIDE, h: 10 }, quake_hazard: SIDE, solar_week: CARD,
  city_services: SIDE, profile_attention: SIDE,
};
/** A widget's starting size: its panel's own for catalogue panels, else its type's. */
export const sizeOf = (item: Pick<WidgetInstance, "type" | "config">): WidgetSize =>
  (item.type === "panel" && item.config.panel && PANEL_SIZES[item.config.panel]) || WIDGET_SIZES[item.type];

// Widgets whose content scrolls or fills any size (lists, tables, the map): they may be made small.
const FLEXIBLE = new Set<WidgetType>(["ranking", "insight", "indicators", "sensor", "map"]);
const FLEXIBLE_PANELS = new Set(["aq_ranking"]);
export type SizeLimits = { minW: number; minH: number; maxH?: number };

/**
 * How far a widget may be resized. A flexible one keeps its type's minimum and no maximum.
 * Every other widget draws a fixed picture (gauge, chart, tiles) that would be cut off when
 * smaller: it stays at least as tall as designed (and up to 4 rows taller, past which it is
 * only empty space), and at least its designed width up to 6 columns.
 */
export function limitsOf(item: Pick<WidgetInstance, "type" | "config">): SizeLimits {
  const size = sizeOf(item);
  if (FLEXIBLE.has(item.type) || (item.type === "panel" && FLEXIBLE_PANELS.has(item.config.panel ?? ""))) return { minW: size.minW, minH: size.minH };
  return { minW: Math.max(size.minW, Math.min(size.w, 6)), minH: size.h, maxH: size.h + 4 };
}

/** Width choices offered in a widget's settings, in grid columns. */
export const WIDTH_PRESETS = [{ w: 3, label: "1/4" }, { w: 4, label: "1/3" }, { w: 6, label: "1/2" }, { w: 8, label: "2/3" }, { w: 12, label: "Penuh" }] as const;

/** Stable id from type and configuration, so the same widget is never added twice. */
export function widgetId(type: WidgetType, config: WidgetConfig = {}) {
  const parts = [config.kind, config.stat, config.metric, config.deviceId, config.field, config.panel].filter(part => part != null);
  return parts.length ? `${type}:${parts.join(":")}` : type;
}
export const instance = (type: WidgetType, config: WidgetConfig = {}): WidgetInstance => ({ id: widgetId(type, config), type, config });

const IOT_STATS: IotStat[] = ["devices", "active", "reporting", "rejected"];

/**
 * What a profile starts with, main information first: the KPI band, then the fixed frame
 * every profile has (highlights, map, ranking, score), then the panels the AI picked for the
 * profile (`view.panels`: gauges, 7-day lines, bars from app/panels.py), most important
 * first and already narrowed to the ones the region has data for, then the indicator table
 * as the detail behind them, and every sensor field.
 */
export function defaultWidgets(view: DashboardView, devices: DTO<"DeviceDashboard">[], region: DTO<"OurRegion"> | null | undefined): WidgetInstance[] {
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
  out.push(...cards);
  out.push(...(view.panels ?? []).map(panel => instance("panel", { panel: panel.id })));
  if (region?.indicators.length) out.push(instance("indicators"));
  for (const { device, widgets } of devices) for (const widget of widgets) if (!widget.hidden) out.push(instance("sensor", { deviceId: device.id, field: widget.field }));
  return out;
}

const isKpi = (item: WidgetInstance) => item.type.startsWith("kpi-");
/** The fixed frame every profile has; packed as its own block so it is never mixed with the AI's panels. */
const FRAME: WidgetType[] = ["map", "insight", "ranking", "score", "impact", "history"];
const blockOf = (item: WidgetInstance) => isKpi(item) ? "kpi" : FRAME.includes(item.type) ? "frame" : item.type === "indicators" ? "detail" : "rest";

/**
 * The KPI band: as many even rows as needed, at most 4 tiles a row, each row filling the
 * full width (5 tiles become 3 + 2, not 4 + a lone tile).
 */
function packBand(items: WidgetInstance[], startY: number): Placement[] {
  const out: Placement[] = [];
  const rows = Math.ceil(items.length / 4);
  let y = startY, index = 0;
  for (let row = 0; row < rows; row++) {
    const count = Math.ceil((items.length - index) / (rows - row));
    let x = 0;
    for (const item of items.slice(index, index + count)) {
      const w = row === rows - 1 && item === items[index + count - 1] ? GRID.cols - x : Math.floor(GRID.cols / count);
      out.push({ i: item.id, x, y, w, h: sizeOf(item).h });
      x += w;
    }
    y += Math.max(...items.slice(index, index + count).map(item => sizeOf(item).h));
    index += count;
  }
  return out;
}

/** How far ahead of the importance order a widget may be pulled to complete a row. */
const LOOKAHEAD = 4;
const MIN_COLUMN = 3;
type Column = { w: number; items: WidgetInstance[] };

/**
 * Bento rows: each row is filled to the full width from the next widgets in importance order
 * (pulling one at most LOOKAHEAD ahead), so a wide chart gets a tall side tile or two short
 * tiles stacked beside it, and three narrow tiles share a row. Rows that hold a wide tile
 * alternate which side it sits on. Every column grows to the row's height, so rows end flush.
 * A widget that would leave a sliver too narrow for any column is stretched to the row end.
 */
function packBento(items: WidgetInstance[], startY: number, fillLast: boolean): Placement[] {
  const queue = [...items];
  const out: Placement[] = [];
  let y = startY, wideRows = 0;
  const take = (item: WidgetInstance) => queue.splice(queue.indexOf(item), 1)[0];
  const short = (item: WidgetInstance) => sizeOf(item).h <= 5;
  while (queue.length) {
    const columns: Column[] = [];
    let left = GRID.cols;
    while (left > 0 && queue.length) {
      const ahead = queue.slice(0, LOOKAHEAD);
      // Fits, and leaves either nothing or room for another column.
      const fits = (item: WidgetInstance) => sizeOf(item).w <= left && (left - sizeOf(item).w === 0 || left - sizeOf(item).w >= MIN_COLUMN);
      // Last resort: a narrower tile, widened below to close the row.
      const pick = ahead.find(item => sizeOf(item).w === left) ?? ahead.find(fits) ?? ahead.find(item => sizeOf(item).w <= left);
      if (!pick) break;
      take(pick);
      const column: Column = { w: sizeOf(pick).w, items: [pick] };
      // Two short tiles stack in one column beside a taller neighbour.
      const partner = short(pick) && queue.slice(0, LOOKAHEAD).find(item => short(item) && sizeOf(item).w === column.w);
      if (partner) column.items.push(take(partner));
      columns.push(column);
      left -= column.w;
    }
    // No gap at the row end; a widget the user just added keeps its own width.
    if (left > 0 && (fillLast || columns.length > 1 || queue.length)) columns[columns.length - 1].w += left;
    if (!columns.length) columns.push({ w: Math.min(GRID.cols, sizeOf(queue[0]).w), items: [take(queue[0])] });
    if (columns.some(column => column.w >= 8) && wideRows++ % 2 === 1) columns.reverse();
    const height = Math.max(...columns.map(column => column.items.reduce((sum, item) => sum + sizeOf(item).h, 0)));
    let x = 0;
    for (const column of columns) {
      let top = y;
      column.items.forEach((item, index) => {
        // The last tile of a column takes what is left, so the column reaches the row's bottom.
        const h = index === column.items.length - 1 ? y + height - top : sizeOf(item).h;
        out.push({ i: item.id, x, y: top, w: column.w, h });
        top += h;
      });
      x += column.w;
    }
    y += height;
  }
  return out;
}

/**
 * Top to bottom in blocks, each starting under the previous one: the KPI band, then the
 * fixed frame (map, highlights, ranking, score), then the AI's panels and the rest, so the
 * main information always comes first. A block is a run of consecutive widgets of one kind.
 */
export function packLayout(items: WidgetInstance[], startY = 0, fillLast = true): Placement[] {
  const out: Placement[] = [];
  let y = startY;
  for (let start = 0; start < items.length;) {
    let end = start;
    while (end < items.length && blockOf(items[end]) === blockOf(items[start])) end++;
    const block = items.slice(start, end);
    const placed = blockOf(block[0]) === "kpi" ? packBand(block, y) : packBento(block, y, fillLast);
    out.push(...placed);
    y = Math.max(y, bottomOf(placed));
    start = end;
  }
  return out;
}

export const byReadingOrder = (a: Placement, b: Placement) => a.y - b.y || a.x - b.x;
const bottomOf = (layout: Placement[]) => layout.reduce((max, item) => Math.max(max, item.y + item.h), 0);

/** Places `added` under everything already on the grid. */
export const appendLayout = (layout: Placement[], added: WidgetInstance[]) => [...layout, ...packLayout(added, bottomOf(layout), false)];

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
