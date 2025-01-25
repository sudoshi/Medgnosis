export default function LoadingMeasuresMipsPage() {
  return (
    <div className="max-w-6xl mx-auto p-6">
      {/* MIPS Overview Skeleton */}
      <div className="mb-8">
        <div className="h-8 w-96 bg-dark-secondary rounded-lg animate-pulse mb-3" />
        <div className="h-4 w-full max-w-2xl bg-dark-secondary rounded-lg animate-pulse mb-4" />
      </div>

      {/* MIPS Categories Grid Skeleton */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-8">
        {[...Array(4)].map((_, i) => (
          <div key={i} className="panel-analytics relative">
            <div className="flex items-start justify-between mb-4">
              <div className="space-y-2">
                <div className="h-6 w-32 bg-dark-primary rounded-lg animate-pulse" />
                <div className="h-4 w-48 bg-dark-primary rounded-lg animate-pulse" />
              </div>
              <div className="h-8 w-16 bg-dark-primary rounded-lg animate-pulse" />
            </div>
            <div className="h-2 bg-dark-primary rounded-full animate-pulse" />
          </div>
        ))}
      </div>

      {/* Composite Score Skeleton */}
      <div className="panel-base relative mb-8">
        <div className="h-6 w-48 bg-dark-primary rounded-lg animate-pulse mb-4" />
        <div className="flex items-center gap-4">
          <div className="flex-1">
            <div className="h-4 bg-dark-primary rounded-full animate-pulse" />
          </div>
          <div className="h-8 w-12 bg-dark-primary rounded-lg animate-pulse" />
        </div>
        <div className="mt-4 p-4 bg-dark-primary/10 border border-dark-border/20 rounded-lg">
          <div className="h-5 w-40 bg-dark-primary rounded-lg animate-pulse mb-2" />
          <div className="h-4 w-full bg-dark-primary rounded-lg animate-pulse" />
        </div>
      </div>
    </div>
  );
}
