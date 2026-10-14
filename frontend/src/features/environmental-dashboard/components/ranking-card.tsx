import { RecentHiresCard } from "@/components/application/dashboard/recent-hires-card";
import { StatHint } from "@/components/application/dashboard/stat-cards";
import type { DTO } from "@/lib/api/client";
import { formatDecimal } from "../format";

/** BoardUI Recent hires card, filled with the top regions of the profile's ranking. */
export function RankingCard({ ranking, metricLabel, focusName }: { ranking: DTO<"RankPanel">; metricLabel: string; focusName?: string }) {
  // A province profile ranks the kabupaten/kota inside it, so the user's own region is not listed.
  const scope = ranking.your_rank == null && focusName && ranking.scope === focusName ? `Kab/kota di ${ranking.scope}` : ranking.scope;
  return <RecentHiresCard
    title={`Peringkat ${metricLabel.toLowerCase()}`}
    total={ranking.your_rank != null ? `#${ranking.your_rank} dari ${ranking.of}` : `${ranking.of} wilayah`}
    filter={<StatHint label="Arti skor" hint={`${scope}. ${ranking.score_meaning}`} />}
    className="h-[344px]"
    hires={ranking.results.slice(0, 4).map((row, index) => ({
      name: row.name,
      joined: row.is_you ? "Wilayah Anda" : `Peringkat ${index + 1}`,
      role: `Skor ${formatDecimal(row.score)}`,
      leading: <span className="flex size-9 shrink-0 items-center justify-center rounded-full bg-background-tertiary-default text-body-medium text-text-primary tabular-nums">{index + 1}</span>,
    }))}
  />;
}
