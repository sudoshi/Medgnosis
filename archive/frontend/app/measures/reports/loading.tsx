export default function MeasuresReportsLoading() {
  return (
    <div className="p-6 animate-pulse">
      <div className="max-w-4xl mx-auto">
        {/* Header */}
        <div className="mb-6">
          <div className="h-8 w-48 bg-light-secondary dark:bg-dark-secondary rounded-lg" />
          <div className="h-4 w-96 mt-2 bg-light-secondary dark:bg-dark-secondary rounded-lg" />
        </div>

        {/* Report Cards */}
        <div className="space-y-4">
          {[1, 2, 3].map((index) => (
            <div
              key={index}
              className="p-6 bg-light-primary dark:bg-dark-primary border border-light-border dark:border-dark-border rounded-lg"
            >
              <div className="flex items-start justify-between">
                <div className="flex-1">
                  <div className="flex items-center space-x-2">
                    <div className="h-6 w-48 bg-light-secondary dark:bg-dark-secondary rounded-lg" />
                    {index === 3 && (
                      <div className="h-5 w-24 bg-light-secondary dark:bg-dark-secondary rounded-full" />
                    )}
                  </div>
                  <div className="h-4 w-full mt-2 bg-light-secondary dark:bg-dark-secondary rounded-lg" />
                </div>
                <div className="ml-4">
                  <div className="h-6 w-6 bg-light-secondary dark:bg-dark-secondary rounded-lg" />
                </div>
              </div>
              {index !== 3 && (
                <div className="mt-4 flex items-center space-x-4">
                  <div className="h-9 w-32 bg-light-secondary dark:bg-dark-secondary rounded-lg" />
                  <div className="h-9 w-32 bg-light-secondary dark:bg-dark-secondary rounded-lg" />
                </div>
              )}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
