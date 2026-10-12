const tones = {
  gold: "bg-amber-100 text-amber-800 ring-amber-300 dark:bg-amber-950 dark:text-amber-200 dark:ring-amber-700",
  silver: "bg-slate-100 text-slate-700 ring-slate-300 dark:bg-slate-800 dark:text-slate-200 dark:ring-slate-600",
  bronze: "bg-orange-100 text-orange-800 ring-orange-300 dark:bg-orange-950 dark:text-orange-200 dark:ring-orange-700",
} as const;

export function RankBadge({ rank, tier }: { rank: number; tier: keyof typeof tones }) {
  return <span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-semibold ring-1 ring-inset ${tones[tier]}`}><span aria-hidden>★</span><span>Rank {rank}</span></span>;
}
