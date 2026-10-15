import { useEffect, useState } from "react";
import { Skeleton } from "@/components/ui/skeleton";
import { api, jsonBody, type DTO } from "@/lib/api/client";
import { DashboardCard, PanelUnavailable } from "./dashboard-card";
import { ScoreGauge } from "./score-gauge";

const SCORE_WEIGHTS = { fire_risk: 1, seismic_hazard: 1, water_stress: 1 };

/** Combined attention score for the profile's region (mode `responden`); a grid cell, so it always renders something. */
export function ScoreCard({ regionId, title = "Skor perhatian gabungan" }: { regionId: string; title?: string }) {
  // undefined: loading; null: the API had no score for this region or failed.
  const [score, setScore] = useState<DTO<"ScoreResult"> | null>();
  useEffect(() => {
    const controller = new AbortController();
    api("/score", "ScoreResponse", { method: "POST", ...jsonBody({ weights: SCORE_WEIGHTS }), signal: controller.signal })
      .then(value => { if (!controller.signal.aborted) setScore(value.results.find(row => row.region_id === regionId) ?? null); })
      .catch(() => { if (!controller.signal.aborted) setScore(null); });
    return () => controller.abort();
  }, [regionId]);
  if (score === undefined) return <DashboardCard title={title}><Skeleton className="min-h-0 flex-1 rounded-2lg" /></DashboardCard>;
  if (score === null) return <DashboardCard title={title}><PanelUnavailable title="Skor belum tersedia" description="Wilayah ini belum punya data untuk ketiga komponen skor." /></DashboardCard>;
  return <ScoreGauge result={score} title={title} />;
}
