import { useEffect, useMemo, useState } from "react";
import { useApi } from "@/hooks/use-api";
import { api, apiList, type DTO } from "@/lib/api/client";
import { assessPriorities, DECISION_METRICS, FIRE_SMOKE_FIELDS, type Priority, type PrioritySummary } from "./decision";

type View = DTO<"DashboardView">;
type EventKind = DTO<"EventPanel">["kind"];

export type EventWindows = Record<EventKind, number>;

/** Days each event kind reaches back when no profile says otherwise. */
export const DEFAULT_WINDOWS: EventWindows = { hotspot: 7, quake: 30, disaster: 30 };

/** Which event layers the map draws, and the filters the field puts on them. */
export interface EventFeeds {
  hotspot: boolean;
  quake: boolean;
  disaster: boolean;
  warnings: boolean;
  /** Only this disaster type, when the field names one (a firefighter sees wildfires). */
  disasterType?: string;
  quakeMinMag?: number;
}

/** Guests and signed-in users still loading get the national picture of every kind. */
export const ALL_FEEDS: EventFeeds = { hotspot: true, quake: true, disaster: true, warnings: true };

const EVENT_LABEL: Record<EventKind, string> = { hotspot: "Titik panas", quake: "Gempa", disaster: "Bencana" };
const ENDPOINT_KIND: Record<string, EventKind> = { "/hotspots": "hotspot", "/quakes": "quake", "/disasters": "disaster" };

// Guests get a national lens; fire risk is what the public overview already leads with.
const GUEST_METRIC = "fire_risk";
const GUEST_DETAILS = ["hotspot_count_7d", "aqi_forecast_max"];

export interface SituationTile {
  label: string;
  value: string;
  caption: string;
  tone?: "rose" | "yellow" | "neutral";
}

export interface RankDetail {
  label: string;
  /** With unit, for tables. */
  value: string;
  /** Number only, for compact rows where the label already names the unit. */
  short: string;
}

export interface RankEntry {
  regionId: string;
  name: string;
  /** 0-100 attention score; 100 = needs attention most. */
  score: number | null;
  value: number | null;
  isYou: boolean;
  population: number | null;
  details: RankDetail[];
  /** Set when the region was picked from the priority list, so its card can say why and what to do. */
  priority?: Priority;
}

export interface Situation {
  signedIn: boolean;
  scopeName: string;
  fieldLabel: string | null;
  modeTitle: string | null;
  modeDescription: string | null;
  tiles: SituationTile[];
  rank: {
    metric: string;
    metricLabel: string;
    unit: string;
    modelled: boolean;
    scopeLabel: string;
    of: number;
    entries: RankEntry[];
  } | null;
  choropleth: { metric: string; level: "provinsi" | "kabkota"; parentId: string | null };
  windows: EventWindows;
  feeds: EventFeeds;
  /** Where to act first for fire and smoke; null when the field does not work on those. */
  priorities: PrioritySummary | null;
  prioritiesLoading: boolean;
}

// The API names fire_risk "Indeks rawan kebakaran", but 70% of it is fires burning now.
const LABEL_OVERRIDE: Record<string, string> = { fire_risk: "Api aktif (indeks)" };

const integer = new Intl.NumberFormat("id-ID");
const decimal = new Intl.NumberFormat("id-ID", { maximumFractionDigits: 1 });

export function formatValue(value: number | null | undefined, unit?: string) {
  if (value == null || !Number.isFinite(value)) return "Belum ada data";
  const text = Math.abs(value) >= 100 ? integer.format(Math.round(value)) : decimal.format(value);
  // Index units ("indeks 0-100") read as noise next to the number.
  return unit && !unit.startsWith("indeks") ? `${text} ${unit}` : text;
}

export function scoreTone(score: number | null): SituationTile["tone"] {
  if (score == null) return "neutral";
  if (score >= 75) return "rose";
  if (score >= 50) return "yellow";
  return "neutral";
}

function windowsFrom(view: View | undefined): EventWindows {
  const windows = { ...DEFAULT_WINDOWS };
  for (const layer of view?.layers ?? []) {
    const kind = layer.endpoint ? ENDPOINT_KIND[layer.endpoint] : undefined;
    const days = layer.params?.days;
    if (kind && typeof days === "number") windows[kind] = days;
  }
  for (const event of view?.events ?? []) windows[event.kind] = event.days;
  return windows;
}

/** What the field draws: its point layers and the kinds of event it lists, plus the area warnings it asks for. */
function feedsFrom(view: View): EventFeeds {
  const feeds: EventFeeds = { hotspot: false, quake: false, disaster: false, warnings: false };
  for (const layer of view.layers) {
    if (layer.endpoint === "/warnings") feeds.warnings = true;
    const kind = layer.type === "points" && layer.endpoint ? ENDPOINT_KIND[layer.endpoint] : undefined;
    if (!kind) continue;
    feeds[kind] = true;
    const { type, min_mag: minMag } = layer.params ?? {};
    if (kind === "disaster" && typeof type === "string") feeds.disasterType = type;
    if (kind === "quake" && typeof minMag === "number") feeds.quakeMinMag = minMag;
  }
  for (const event of view.events) feeds[event.kind] = true;
  return feeds;
}

function numberAt(row: Record<string, unknown> | undefined, key: string) {
  const value = row?.[key];
  return typeof value === "number" ? value : null;
}

/**
 * Turns the active profile's dashboard view (or, for guests, the national
 * overview) into what the map screen leads with: where, which lens, three
 * headline figures, and the regions ranked by the field's metric.
 */
export function useSituation(view: View | undefined, signedIn: boolean): { situation: Situation | null; loading: boolean; error?: string; metricLabel: (metric: string) => string } {
  const [metrics, setMetrics] = useState<DTO<"MetricDef">[]>([]);
  const [fields, setFields] = useState<DTO<"FieldInfo">[]>([]);
  const overview = useApi(view ? null : "/public/overview", "PublicOverview");

  useEffect(() => {
    const controller = new AbortController();
    apiList("/metrics", "MetricDef", { signal: controller.signal }).then(setMetrics).catch(() => {});
    apiList("/fields", "FieldInfo", { signal: controller.signal }).then(setFields).catch(() => {});
    return () => controller.abort();
  }, []);

  const focus = view?.focus ?? null;
  const provinceId = focus ? (focus.level === "provinsi" ? focus.id : focus.parent_id ?? null) : null;
  const rankMetric = view?.ranking.metric ?? GUEST_METRIC;
  const fieldId = view?.field.id;
  const detailMetrics = useMemo(() => {
    if (!fieldId) return GUEST_DETAILS;
    const fieldMetrics = fields.find((field) => field.id === fieldId)?.metrics ?? [];
    return fieldMetrics.filter((metric) => metric !== rankMetric).slice(0, 2);
  }, [fieldId, fields, rankMetric]);
  const level = provinceId ? "kabkota" : "provinsi";
  const query = new URLSearchParams({ level, metrics: [rankMetric, ...detailMetrics].join(","), sort: rankMetric, order: "desc", limit: "100" });
  if (provinceId) query.set("parent", provinceId);
  // Wait for the field catalog so the detail columns are known before asking.
  const ready = !view || fields.length > 0;
  const table = useApi(ready ? `/indicators?${query}` : null, "IndicatorTable");

  // Fire and smoke priorities read their own indicators over the same scope as the ranking.
  const assessable = !fieldId || FIRE_SMOKE_FIELDS.has(fieldId);
  const decisionQuery = new URLSearchParams({ level, metrics: DECISION_METRICS.join(","), limit: "1000" });
  if (provinceId) decisionQuery.set("parent", provinceId);
  const decisionTable = useApi(assessable ? `/indicators?${decisionQuery}` : null, "IndicatorTable");
  // Fire density needs each region's area, which the indicator table leaves out and the map layer carries.
  const [areaLayer, setAreaLayer] = useState<{ level: string; areas: ReadonlyMap<string, number> } | null>(null);
  useEffect(() => {
    if (!assessable) return;
    const controller = new AbortController();
    api(`/map/hotspot_count_7d?level=${level}&simplify=0.5`, "MapLayer", { signal: controller.signal })
      .then((layer) => {
        const areas = new Map<string, number>();
        for (const feature of layer.features) if (feature.properties.area_km2) areas.set(feature.properties.region_id, feature.properties.area_km2);
        setAreaLayer({ level, areas });
      })
      .catch(() => { if (!controller.signal.aborted) setAreaLayer({ level, areas: new Map() }); });
    return () => controller.abort();
  }, [assessable, level]);
  const areas = areaLayer?.level === level ? areaLayer.areas : null;

  const situation = useMemo<Situation | null>(() => {
    const def = (metric: string) => metrics.find((item) => item.metric === metric);
    const column = (metric: string) => table.data?.columns.find((item) => item.metric === metric);
    const label = (metric: string) => LABEL_OVERRIDE[metric] ?? def(metric)?.label ?? column(metric)?.label ?? metric.replaceAll("_", " ");
    const priorities = assessable && decisionTable.data && areas ? assessPriorities(decisionTable.data.rows, areas) : null;
    const prioritiesLoading = assessable && priorities === null && !decisionTable.error;
    const unit = (metric: string) => def(metric)?.unit ?? column(metric)?.unit ?? "";
    const rows = new Map((table.data?.rows ?? []).map((row) => [String(row.region_id), row]));
    const details = (row: Record<string, unknown> | undefined) => detailMetrics
      .filter((metric) => numberAt(row, metric) != null)
      .map((metric) => ({ label: label(metric), value: formatValue(numberAt(row, metric), unit(metric)), short: formatValue(numberAt(row, metric)) }));

    if (view) {
      const entries: RankEntry[] = view.ranking.results.map((result) => {
        const row = rows.get(result.region_id);
        return { regionId: result.region_id, name: result.name, score: result.score, value: result.value, isYou: result.is_you, population: numberAt(row, "population"), details: details(row) };
      });
      const top = entries[0];
      const mainEvent = view.events.find((event) => event.count > 0) ?? view.events[0];
      const alert = [...view.alerts.region_alerts].sort((a, b) => b.normalised - a.normalised)[0];
      const warnings = view.alerts.weather_warnings?.length ?? 0;
      const tiles: SituationTile[] = [];
      if (top) tiles.push({ label: "Paling perlu perhatian", value: top.name, caption: `Skor ${decimal.format(top.score ?? 0)} · ${label(rankMetric).toLowerCase()}`, tone: scoreTone(top.score) });
      if (mainEvent) tiles.push({ label: EVENT_LABEL[mainEvent.kind], value: integer.format(mainEvent.count), caption: `${mainEvent.days} hari terakhir` });
      if (alert) {
        // "PM2.5 tertinggi (prakiraan 48 jam)": the bracket goes to the caption so the label fits a half-width tile.
        const [, name = alert.label, qualifier] = alert.label.match(/^(.*?)\s*\((.*)\)$/) ?? [];
        const when = qualifier ? qualifier.charAt(0).toUpperCase() + qualifier.slice(1) : alert.name;
        tiles.push({ label: name, value: formatValue(alert.value, unit(alert.metric)), caption: `${when} · skor ${decimal.format(alert.normalised)}`, tone: scoreTone(alert.normalised) });
      }
      else tiles.push({ label: "Peringatan cuaca", value: integer.format(warnings), caption: warnings ? "Aktif dari BMKG" : "Tidak ada yang aktif", tone: warnings ? "yellow" : "neutral" });
      return {
        signedIn,
        scopeName: focus?.name ?? "Indonesia",
        fieldLabel: view.field.label,
        modeTitle: view.mode.title,
        modeDescription: view.mode.description,
        tiles,
        rank: entries.length ? {
          metric: rankMetric,
          metricLabel: label(rankMetric),
          unit: unit(rankMetric),
          modelled: Boolean(column(rankMetric)?.modelled),
          scopeLabel: provinceId ? `kab/kota di ${view.ranking.scope}` : "provinsi",
          of: view.ranking.of,
          entries,
        } : null,
        choropleth: { metric: rankMetric, level, parentId: provinceId },
        windows: windowsFrom(view),
        feeds: feedsFrom(view),
        priorities,
        prioritiesLoading,
      };
    }

    const data = overview.data;
    const guestRows = (table.data?.rows ?? []).slice(0, 5);
    // The region tile leads: it is the only one whose value is a name, and it gets the full width.
    const tiles: SituationTile[] = data ? [
      ...(data.fire_risk_top[0] ? [{ label: "Api aktif paling tinggi", value: data.fire_risk_top[0].name, caption: `Skor ${decimal.format(data.fire_risk_top[0].score)} · ${label(GUEST_METRIC).toLowerCase()}`, tone: scoreTone(data.fire_risk_top[0].score) }] : []),
      { label: "Titik panas", value: integer.format(data.counts.hotspots_7d), caption: "7 hari terakhir" },
      { label: "Gempa M4,5 ke atas", value: integer.format(data.counts.quakes_7d_m45), caption: "7 hari terakhir" },
    ] : [];
    return {
      signedIn,
      scopeName: "Indonesia",
      fieldLabel: null,
      modeTitle: null,
      modeDescription: null,
      tiles,
      rank: guestRows.length ? {
        metric: GUEST_METRIC,
        metricLabel: label(GUEST_METRIC),
        unit: unit(GUEST_METRIC),
        modelled: Boolean(column(GUEST_METRIC)?.modelled),
        scopeLabel: "provinsi",
        of: table.data?.total ?? guestRows.length,
        entries: guestRows.map((row) => {
          const score = numberAt(row, GUEST_METRIC);
          return { regionId: String(row.region_id), name: String(row.name), score, value: score, isYou: false, population: numberAt(row, "population"), details: details(row) };
        }),
      } : null,
      choropleth: { metric: GUEST_METRIC, level: "provinsi", parentId: null },
      windows: DEFAULT_WINDOWS,
      feeds: ALL_FEEDS,
      priorities,
      prioritiesLoading,
    };
  }, [view, signedIn, overview.data, table.data, decisionTable.data, decisionTable.error, areas, assessable, metrics, detailMetrics, rankMetric, provinceId, level, focus]);

  const metricLabel = (metric: string) => metrics.find((item) => item.metric === metric)?.label ?? metric.replaceAll("_", " ");
  return { situation, loading: table.loading || overview.loading, error: table.error || overview.error, metricLabel };
}
