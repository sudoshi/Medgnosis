export default function LoadingMeasuresPerformancePage() {
  return (
    <div className="p-6">
      <div className="max-w-4xl mx-auto">
        <div className="h-8 bg-dark-secondary rounded w-64 mb-6 animate-pulse"></div>
        
        <div className="space-y-6">
          {/* Main chart placeholder */}
          <div className="p-6 bg-dark-primary border border-dark-border rounded-lg">
            <div className="h-64 bg-dark-secondary rounded animate-pulse"></div>
          </div>
          
          {/* Grid placeholders */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div className="p-6 bg-dark-primary border border-dark-border rounded-lg">
              <div className="h-48 bg-dark-secondary rounded animate-pulse"></div>
            </div>
            <div className="p-6 bg-dark-primary border border-dark-border rounded-lg">
              <div className="h-48 bg-dark-secondary rounded animate-pulse"></div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
