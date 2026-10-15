import { useEffect, useState } from "react";
import { api, apiList, jsonBody, type DTO } from "@/lib/api/client";

type Focus = DTO<"Focus">;
type RegionRef = DTO<"RegionRef">;
export type RankRow = DTO<"RankRow"> & { rank: number };
export type MetricRanking = Omit<DTO<"RankPanel">, "results"> & { results: RankRow[] };

/*
 * Data for widgets the user configures (a metric of their own choice). One request per key
 * per page load; a failed request is dropped from the cache so the next mount retries.
 */
const cache = new Map<string, Promise<unknown>>();
function once<T>(key: string, run: () => Promise<T>): Promise<T> {
  let value = cache.get(key) as Promise<T> | undefined;
  if (!value) {
    value = run();
    value.catch(() => cache.delete(key));
    cache.set(key, value);
  }
  return value;
}

/** undefined while loading, null when it failed. */
function useLoad<T>(key: string | null, run: () => Promise<T>) {
  const [state, setState] = useState<{ key: string | null; value?: T | null }>({ key });
  useEffect(() => {
    if (!key) return;
    let active = true;
    once(key, run).then(value => { if (active) setState({ key, value }); }, () => { if (active) setState({ key, value: null }); });
    return () => { active = false; };
    // `run` is rebuilt every render; `key` names what it loads.
  }, [key]); // eslint-disable-line react-hooks/exhaustive-deps
  return state.key === key ? state.value : undefined;
}

/** Every indicator known for one region (not only the ones the AI picked for the profile). */
export const useRegionSummary = (regionId: string | null) =>
  useLoad(regionId && `region:${regionId}`, () => api(`/regions/${encodeURIComponent(regionId!)}`, "RegionSummary"));

const loadRegions = () => once("regions", () => Promise.all([
  apiList("/regions?level=provinsi&limit=100", "RegionRef"),
  apiList("/regions?level=kabkota&limit=600", "RegionRef"),
]).then(([provinces, kabkotas]) => ({ provinces, kabkotas })));

/**
 * Neighbouring regions on any metric, ranked the way the backend ranks the profile's own
 * metric: the kabupaten/kota of the profile's province, or the provinces without a region.
 * Unlike the backend panel, the profile's region is always included with its real rank.
 */
export function useMetricRanking(metric: string | undefined, focus: Focus | null | undefined, top = 5): MetricRanking | null | undefined {
  return useLoad(metric ? `rank:${metric}:${focus?.id ?? "national"}:${top}` : null, async () => {
    const [{ provinces, kabkotas }, score] = await Promise.all([
      loadRegions(),
      api("/score", "ScoreResponse", { method: "POST", ...jsonBody({ weights: { [metric!]: 1 } }) }),
    ]);
    const province = focus ? (focus.level === "provinsi" ? focus.id : focus.parent_id ?? null) : null;
    const scope: RegionRef[] = province ? kabkotas.filter(region => region.parent_id === province) : provinces;
    const ids = new Set(scope.map(region => region.id));
    const rows = score.results.filter(row => ids.has(row.region_id) && row.parts[metric!])
      .sort((a, b) => b.score - a.score)
      .map((row, index) => ({ region_id: row.region_id, name: row.name, score: row.score, value: row.parts[metric!].value, is_you: row.region_id === focus?.id, rank: index + 1 }));
    const you = rows.find(row => row.is_you);
    const results = rows.slice(0, top);
    if (you && you.rank > top) results.push(you);
    return {
      metric: metric!, sort: "attention", polarity: score.polarity[metric!] ?? "high_bad",
      scope: province ? provinces.find(region => region.id === province)?.name ?? "Provinsi" : "Indonesia",
      your_rank: you?.rank ?? null, of: rows.length, results, score_meaning: score.score_meaning,
    };
  });
}
