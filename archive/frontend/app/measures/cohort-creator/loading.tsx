export default function LoadingCohortCreatorPage() {
  return (
    <div className="flex h-full">
      {/* Left Sidebar - Filters */}
      <div className="w-80 border-r border-dark-border p-6 overflow-y-auto">
        <div className="space-y-6">
          <div className="h-8 bg-dark-secondary rounded w-32 animate-pulse"></div>
          <div className="space-y-4">
            {[1, 2, 3].map((i) => (
              <div key={i} className="space-y-2">
                <div className="h-4 bg-dark-secondary rounded w-24 animate-pulse"></div>
                <div className="h-10 bg-dark-secondary rounded w-full animate-pulse"></div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Middle - Measure List */}
      <div className="w-96 border-r border-dark-border p-6 overflow-y-auto">
        <div className="mb-6">
          <div className="h-8 bg-dark-secondary rounded w-48 animate-pulse"></div>
          <div className="h-4 bg-dark-secondary rounded w-64 mt-2 animate-pulse"></div>
        </div>
        <div className="space-y-4">
          {[1, 2, 3, 4, 5].map((i) => (
            <div
              key={i}
              className="p-4 bg-dark-primary border border-dark-border rounded-lg"
            >
              <div className="flex items-start justify-between">
                <div className="flex-1">
                  <div className="flex items-center space-x-2">
                    <div className="h-6 bg-dark-secondary rounded w-48 animate-pulse"></div>
                    <div className="h-5 bg-dark-secondary rounded w-24 animate-pulse"></div>
                  </div>
                  <div className="h-4 bg-dark-secondary rounded w-64 mt-2 animate-pulse"></div>
                  <div className="mt-4 flex items-center space-x-4">
                    <div className="h-4 bg-dark-secondary rounded w-16 animate-pulse"></div>
                    <div className="h-4 bg-dark-secondary rounded w-16 animate-pulse"></div>
                  </div>
                </div>
                <div className="ml-4 flex-shrink-0">
                  <div className="h-4 w-4 bg-dark-secondary rounded animate-pulse"></div>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Right - Cohort Analysis */}
      <div className="flex-1 p-6 overflow-y-auto">
        <div className="mb-6">
          <div className="h-8 bg-dark-secondary rounded w-48 animate-pulse"></div>
          <div className="h-4 bg-dark-secondary rounded w-96 mt-2 animate-pulse"></div>
        </div>

        <div className="space-y-6">
          {/* Stats */}
          <div className="grid grid-cols-4 gap-4">
            {[1, 2, 3, 4].map((i) => (
              <div key={i} className="p-4 bg-dark-primary border border-dark-border rounded-lg">
                <div className="flex items-center space-x-2">
                  <div className="h-5 w-5 bg-dark-secondary rounded animate-pulse"></div>
                  <div className="h-4 bg-dark-secondary rounded w-24 animate-pulse"></div>
                </div>
                <div className="h-8 bg-dark-secondary rounded w-16 mt-2 animate-pulse"></div>
              </div>
            ))}
          </div>

          {/* Patient Preview */}
          <div>
            <div className="h-6 bg-dark-secondary rounded w-48 mb-4 animate-pulse"></div>
            <div className="space-y-2">
              {[1, 2, 3].map((i) => (
                <div
                  key={i}
                  className="p-4 bg-dark-primary border border-dark-border rounded-lg"
                >
                  <div className="flex items-center justify-between">
                    <div>
                      <div className="h-5 bg-dark-secondary rounded w-48 animate-pulse"></div>
                      <div className="h-4 bg-dark-secondary rounded w-32 mt-1 animate-pulse"></div>
                    </div>
                    <div className="flex items-center space-x-4">
                      <div className="h-4 bg-dark-secondary rounded w-24 animate-pulse"></div>
                      <div className="h-6 bg-dark-secondary rounded w-16 animate-pulse"></div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
