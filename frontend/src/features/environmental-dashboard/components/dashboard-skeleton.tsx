import { Skeleton } from "@/components/ui/skeleton";

export function DashboardSkeleton() {
  return <div role="status" aria-label="Memuat dashboard akun" className="flex flex-col gap-4">
    <Skeleton className="h-36 rounded-2xl" />
    <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">{[0, 1, 2].map(key => <Skeleton key={key} className="h-[132px] rounded-2xl" />)}</div>
    <div className="grid gap-4 xl:grid-cols-12">
      <Skeleton className="h-72 rounded-2xl xl:col-span-7" />
      <Skeleton className="h-72 rounded-2xl xl:col-span-5" />
    </div>
  </div>;
}
