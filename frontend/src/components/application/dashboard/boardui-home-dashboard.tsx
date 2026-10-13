import { DataTableExample } from "@/components/application/data-table/data-table";
import { StatCards } from "./stat-cards";
import { RecentHiresCard } from "./recent-hires-card";
import { HomeChartCard } from "./home-chart-card";
import { ContributionsCard } from "./contributions-card";

/** Composition measured from the BoardUI Home export: 16px row and card gaps,
 * a 532/673 first row, equal-width second row, then four 132px KPI cards. */
export function BoardUIHomeDashboard({ embedded = false }: { embedded?: boolean }) {
  return <div className="flex min-w-0 flex-col gap-4">
    <div className={`grid min-w-0 gap-4 ${embedded ? "" : "xl:grid-cols-[minmax(0,532fr)_minmax(0,673fr)]"}`}><RecentHiresCard /><HomeChartCard kind="earned" /></div>
    <div className={`grid min-w-0 gap-4 ${embedded ? "" : "xl:grid-cols-2"}`}><HomeChartCard kind="revenue" /><ContributionsCard /></div>
    <StatCards columns={embedded ? 2 : 4} />
    <div className="min-w-0"><DataTableExample showSizeToggle={false} pageSize={6} /></div>
  </div>;
}
