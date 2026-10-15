import { PolarAngleAxis, RadialBar, RadialBarChart, ResponsiveContainer } from "recharts";
import { StatHint } from "@/components/application/dashboard/stat-cards";
import type { DTO } from "@/lib/api/client";
import { formatDecimal } from "../format";
import { DashboardCard, LegendTiles } from "./dashboard-card";

/** Combined 0-100 attention score as a ring gauge, with how much of it rests on modelled data. */
export function ScoreGauge({ result, title = "Skor perhatian gabungan" }: { result: DTO<"ScoreResult">; title?: string }) {
  return <DashboardCard
    title={title}
    action={<StatHint label="Skor perhatian gabungan" hint="Bobot sama untuk risiko kebakaran, bahaya gempa, dan tekanan air. Skor relatif antarwilayah, bukan probabilitas bencana." />}
    footer={<LegendTiles items={[
      { key: "coverage", label: "Cakupan data", value: `${Math.round(result.coverage * 100)}%` },
      { key: "modelled", label: "Porsi model", value: `${Math.round(result.modelled_share * 100)}%` },
      { key: "confidence", label: "Keyakinan terendah", value: `${result.min_confidence}/5` },
    ]} />}>
    <div className="relative mx-auto min-h-0 w-full max-w-64 flex-1" role="img" aria-label={`Skor perhatian gabungan ${formatDecimal(result.score)} dari 100`}>
      <ResponsiveContainer width="100%" height="100%">
        <RadialBarChart data={[{ value: result.score }]} startAngle={210} endAngle={-30} innerRadius="74%" outerRadius="100%" barSize={16}>
          <PolarAngleAxis type="number" domain={[0, 100]} tick={false} />
          <RadialBar dataKey="value" cornerRadius={10} fill="var(--color-chart-1-active)" background={{ fill: "var(--color-chart-track)" }} isAnimationActive={false} />
        </RadialBarChart>
      </ResponsiveContainer>
      <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
        <span className="text-display-4-medium text-text-primary tabular-nums">{formatDecimal(result.score)}</span>
        <span className="text-body-2-regular text-text-secondary">dari 100</span>
      </div>
    </div>
  </DashboardCard>;
}
