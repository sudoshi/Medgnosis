'use client';

export default function MeasuresPerformancePage() {
  return (
    <div className="p-6">
      <div className="max-w-4xl mx-auto">
        <h1 className="text-2xl font-semibold mb-6">Performance Overview</h1>
        
        {/* Placeholder content */}
        <div className="space-y-6">
          <div className="p-6 bg-dark-primary border border-dark-border rounded-lg">
            <div className="flex items-center justify-center h-64 text-dark-text-secondary">
              Performance metrics and analytics dashboard coming soon
            </div>
          </div>
          
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div className="p-6 bg-dark-primary border border-dark-border rounded-lg">
              <div className="flex items-center justify-center h-48 text-dark-text-secondary">
                Trending measures
              </div>
            </div>
            <div className="p-6 bg-dark-primary border border-dark-border rounded-lg">
              <div className="flex items-center justify-center h-48 text-dark-text-secondary">
                Performance by domain
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
