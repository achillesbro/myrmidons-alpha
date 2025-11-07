import { Skeleton } from "../ui/Skeleton";

export function LoadingState() {
  return (
    <div className="space-y-6">
      {/* Header KPIs skeleton */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        {[1, 2, 3, 4].map((i) => (
          <div key={i} className="rounded-2xl shadow-sm bg-white border border-black/5 p-6">
            <Skeleton className="h-3 w-20 mb-2" />
            <Skeleton className="h-8 w-32 mb-2" />
            <Skeleton className="h-2 w-24" />
          </div>
        ))}
      </div>
      
      {/* Table skeleton */}
      <div className="rounded-2xl shadow-sm bg-white border border-black/5 p-6">
        <Skeleton className="h-4 w-32 mb-4" />
        <div className="space-y-3">
          {[1, 2, 3, 4, 5].map((i) => (
            <div key={i} className="flex items-center gap-4">
              <Skeleton className="h-4 w-32" />
              <Skeleton className="h-4 w-24" />
              <Skeleton className="h-4 w-28" />
              <Skeleton className="h-4 w-20" />
              <Skeleton className="h-4 w-16" />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

