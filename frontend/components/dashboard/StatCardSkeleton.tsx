export function StatCardSkeleton() {
  return (
    <div className="panel-stat relative animate-pulse">
      <div className="flex items-start justify-between">
        <div>
          <div className="h-4 w-32 bg-dark-secondary/30 rounded mb-4" />
          <div className="h-8 w-24 bg-dark-secondary/30 rounded mb-2" />
          <div className="h-4 w-20 bg-dark-secondary/30 rounded" />
        </div>
        <div className="rounded-lg bg-dark-secondary/20 p-3">
          <div className="h-6 w-6" />
        </div>
      </div>
      <div className="mt-4 h-4 w-48 bg-dark-secondary/30 rounded" />
    </div>
  );
}
