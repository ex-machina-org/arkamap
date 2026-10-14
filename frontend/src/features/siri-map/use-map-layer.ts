import { useEffect, useState } from "react";
import { api } from "@/lib/api/client";
import type { MapLayer } from "./atlas";
import type { ChoroplethSpec } from "./spatial-layers";

/**
 * The coloured layer behind the map, its ranking and the region detail's peer strip, fetched once here
 * so all three read the same numbers.
 */
export function useMapLayer(spec: ChoroplethSpec | null) {
  const [state, setState] = useState<{ key: string; layer?: MapLayer; error?: string }>({ key: "" });
  const metric = spec?.metric;
  const level = spec?.level;
  const parentId = spec?.parentId ?? null;
  const key = metric && level ? `${metric}|${level}|${parentId ?? ""}` : "";
  useEffect(() => {
    if (!metric || !level) return;
    const controller = new AbortController();
    // 519 kabupaten need less per-polygon detail than 34 provinces; the coarser tolerance keeps both payloads close.
    api(`/map/${encodeURIComponent(metric)}?level=${level}&simplify=${level === "kabkota" ? 0.02 : 0.01}`, "MapLayer", { signal: controller.signal })
      .then(value => {
        if (controller.signal.aborted) return;
        const layer = parentId ? { ...value, features: value.features.filter(feature => feature.properties.parent_id === parentId) } : value;
        setState({ key: `${metric}|${level}|${parentId ?? ""}`, layer });
      })
      .catch(cause => { if (!controller.signal.aborted) setState({ key: `${metric}|${level}|${parentId ?? ""}`, error: cause.message }); });
    return () => controller.abort();
  }, [metric, level, parentId]);
  // A stale layer for another metric would paint the wrong legend, so it only counts while its key matches.
  const current = state.key === key ? state : { key, layer: undefined, error: undefined };
  return { layer: current.layer, error: current.error, loading: Boolean(key) && !current.layer && !current.error };
}
