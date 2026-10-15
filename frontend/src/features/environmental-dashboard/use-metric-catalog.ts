import { useEffect, useState } from "react";
import { apiList, type DTO } from "@/lib/api/client";

type Metric = DTO<"MetricDef">;

// One request per page load; a failure only costs units and labels, never the dashboard.
let catalog: Promise<Metric[]> | undefined;
const load = () => catalog ??= apiList("/metrics", "MetricDef")
  .catch(() => { catalog = undefined; return [] as Metric[]; });

/** Metric definitions (label, unit, polarity) from the backend registry: lookup and the full list. */
export function useMetricCatalog() {
  const [metrics, setMetrics] = useState<Metric[]>([]);
  useEffect(() => {
    let active = true;
    void load().then(value => { if (active) setMetrics(value); });
    return () => { active = false; };
  }, []);
  return { all: metrics, get: (metric: string) => metrics.find(item => item.metric === metric) };
}
