import { useEffect, useState } from "react";
import { api, jsonBody, type DTO } from "@/lib/api/client";
import { ScoreGauge } from "./score-gauge";

const SCORE_WEIGHTS = { fire_risk: 1, seismic_hazard: 1, water_stress: 1 };

/** Combined attention score for the profile's region (mode `responden`); renders nothing until the API answers. */
export function ScoreCard({ regionId }: { regionId: string }) {
  const [score, setScore] = useState<DTO<"ScoreResult">>();
  useEffect(() => {
    const controller = new AbortController();
    api("/score", "ScoreResponse", { method: "POST", ...jsonBody({ weights: SCORE_WEIGHTS }), signal: controller.signal })
      .then(value => { if (!controller.signal.aborted) setScore(value.results.find(row => row.region_id === regionId)); })
      .catch(() => undefined);
    return () => controller.abort();
  }, [regionId]);
  return score ? <ScoreGauge result={score} /> : null;
}
