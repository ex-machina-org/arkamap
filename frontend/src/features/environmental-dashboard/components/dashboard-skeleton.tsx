import { Skeleton } from "@/components/ui/skeleton";

/** Mirrors ApiDashboard: the IoT stat card, a full row of KPI tiles, then the first 344px card pair. */
export function DashboardSkeleton() {
  return <div role="status" aria-label="Memuat dashboard akun" className="flex flex-col gap-4">
    <Skeleton className="h-36 rounded-2xl" />
    <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">{[0, 1, 2, 3].map(key => <Skeleton key={key} className="h-[132px] rounded-2xl" />)}</div>
    <div className="grid gap-4 xl:grid-cols-[minmax(0,532fr)_minmax(0,673fr)]">
      <Skeleton className="h-[344px] rounded-2xl" />
      <Skeleton className="h-[344px] rounded-2xl" />
    </div>
  </div>;
}
