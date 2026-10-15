import { StatHint } from "@/components/application/dashboard/stat-cards";
import type { DTO } from "@/lib/api/client";
import { cx } from "@/utils/cx";
import { formatDecimal } from "../format";
import { DashboardCard, PanelUnavailable } from "./dashboard-card";

/**
 * Neighbouring regions on the ranked metric: real values with their unit as bars, in
 * attention order, the profile's own region highlighted. The 0-100 score stays in the hint
 * because it is a relative rank, not a measurement.
 */
type Ranking = Omit<DTO<"RankPanel">, "results"> & { results: (DTO<"RankRow"> & { rank?: number })[] };

export function RankingCard({ ranking, metricLabel, unit, focusName, title }: { ranking: Ranking; metricLabel: string; unit?: string; focusName?: string; title?: string }) {
  // A province profile ranks the kabupaten/kota inside it, so the user's own region is not listed.
  const scope = ranking.your_rank == null && focusName && ranking.scope === focusName ? `Kab/kota di ${ranking.scope}` : ranking.scope;
  const rows = ranking.results;
  const max = Math.max(...rows.map(row => Math.abs(row.value)), 0) || 1;
  const order = ranking.sort === "value_desc" ? "Diurutkan dari nilai tertinggi."
    : ranking.polarity === "high_good" ? "Diurutkan dari yang paling perlu perhatian; untuk metrik ini nilai rendah lebih perlu perhatian."
    : "Diurutkan dari yang paling perlu perhatian; nilai tinggi lebih perlu perhatian.";
  const youListed = rows.some(row => row.is_you);
  return <DashboardCard
    title={title ?? `Peringkat ${metricLabel.toLowerCase()}`}
    description={scope}
    action={<StatHint label="Cara membaca peringkat" hint={`${order} Skor perhatian: ${ranking.score_meaning}`} />}
    footer={ranking.your_rank != null && <p className="text-body-2-regular text-text-secondary">
      Wilayah Anda di peringkat <span className="text-body-2-medium text-text-primary tabular-nums">{ranking.your_rank}</span> dari {ranking.of}{youListed ? "." : ", di luar daftar teratas."}
    </p>}>
    {rows.length ? <ol aria-label={`Peringkat ${metricLabel}`} className="flex min-h-0 flex-1 flex-col gap-1 overflow-y-auto">
      {rows.map((row, index) => <li key={row.region_id}
        className={cx(index > 0 && row.rank != null && row.rank - (rows[index - 1].rank ?? index) > 1 && "mt-2", "grid grid-cols-[1.5rem_minmax(0,9rem)_minmax(3rem,1fr)_auto] items-center gap-x-3 rounded-lg px-2 py-1.5", row.is_you && "bg-background-primary-default ring-1 ring-inset ring-border-button-default")}>
        <span className="text-caption-1 text-text-tertiary tabular-nums">{row.rank ?? index + 1}</span>
        <span className={cx("truncate text-body-compact text-text-primary", row.is_you && "font-semibold")} title={row.name}>{row.name}{row.is_you && <span className="sr-only"> (wilayah Anda)</span>}</span>
        <span aria-hidden className="relative h-2.5 rounded-full bg-background-tertiary-default">
          <span className="absolute inset-y-0 left-0 rounded-full bg-[var(--color-series-1)]" style={{ width: `${Math.max(2, (Math.abs(row.value) / max) * 100)}%` }} />
        </span>
        <span className="text-right text-body-compact text-text-primary tabular-nums" title={`Skor perhatian ${formatDecimal(row.score)} dari 100`}>
          {formatDecimal(row.value)}{unit && <span className="text-text-secondary"> {unit}</span>}
        </span>
      </li>)}
    </ol> : <PanelUnavailable title="Belum ada peringkat" description="Belum ada wilayah dengan data untuk metrik ini." />}
  </DashboardCard>;
}
