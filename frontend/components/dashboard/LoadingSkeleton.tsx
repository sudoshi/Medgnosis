export function LoadingSkeleton() {
  return (
    <div className="panel-analytics relative animate-pulse">
      <div className="h-6 w-48 bg-dark-secondary/30 rounded mb-4" />
      <div className="space-y-4">
        <div className="h-24 bg-dark-secondary/20 rounded" />
        <div className="h-24 bg-dark-secondary/20 rounded" />
        <div className="h-24 bg-dark-secondary/20 rounded" />
      </div>
    </div>
  );
}
