export default function LoadingMeasuresReportsPage() {
  return (
    <div className="p-6">
      <div className="max-w-4xl mx-auto">
        {/* Header */}
        <div className="mb-6">
          <div className="h-8 bg-dark-secondary rounded w-32 animate-pulse"></div>
          <div className="h-4 bg-dark-secondary rounded w-64 mt-2 animate-pulse"></div>
        </div>
        
        {/* Report Cards */}
        <div className="space-y-4">
          {[1, 2, 3].map((index) => (
            <div key={index} className="p-6 bg-dark-primary border border-dark-border rounded-lg">
              <div className="flex items-start justify-between">
                <div className="flex-1">
                  <div className="flex items-center space-x-2">
                    <div className="h-6 bg-dark-secondary rounded w-48 animate-pulse"></div>
                    <div className="h-5 bg-dark-secondary rounded w-24 animate-pulse"></div>
                  </div>
                  <div className="h-4 bg-dark-secondary rounded w-3/4 mt-2 animate-pulse"></div>
                </div>
                <div className="ml-4">
                  <div className="h-6 w-6 bg-dark-secondary rounded animate-pulse"></div>
                </div>
              </div>
              <div className="mt-4 flex items-center space-x-4">
                <div className="h-9 bg-dark-secondary rounded w-36 animate-pulse"></div>
                <div className="h-9 bg-dark-secondary rounded w-36 animate-pulse"></div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
