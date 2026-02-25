export default function CareListsLoading() {
  return (
    <div className="h-full overflow-y-auto">
      <div className="space-y-6 p-6 animate-pulse">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div className="h-8 w-48 bg-light-secondary dark:bg-dark-secondary rounded-lg" />
          <div className="h-10 w-32 bg-light-secondary dark:bg-dark-secondary rounded-lg" />
        </div>

        {/* Stats Grid */}
        <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-4">
          {[1, 2, 3, 4].map((index) => (
            <div
              key={index}
              className="bg-light-primary dark:bg-dark-primary rounded-lg border border-light-border dark:border-dark-border p-6 shadow-md"
            >
              <div className="flex items-start justify-between">
                <div>
                  <div className="h-4 w-24 bg-light-secondary dark:bg-dark-secondary rounded-lg" />
                  <div className="mt-2 h-8 w-16 bg-light-secondary dark:bg-dark-secondary rounded-lg" />
                  <div className="mt-1 h-4 w-20 bg-light-secondary dark:bg-dark-secondary rounded-lg" />
                </div>
                <div className="rounded-lg bg-light-secondary dark:bg-dark-secondary p-3">
                  <div className="h-6 w-6" />
                </div>
              </div>
              <div className="mt-4 h-4 w-48 bg-light-secondary dark:bg-dark-secondary rounded-lg" />
            </div>
          ))}
        </div>

        {/* Main Content Panel */}
        <div className="bg-light-primary dark:bg-dark-primary rounded-lg border border-light-border dark:border-dark-border p-6 shadow-md">
          {/* Search and Filters */}
          <div className="flex flex-col sm:flex-row gap-4 mb-6">
            <div className="flex-1">
              <div className="h-10 bg-light-secondary dark:bg-dark-secondary rounded-lg" />
            </div>
            <div className="flex gap-4">
              <div className="h-10 w-24 bg-light-secondary dark:bg-dark-secondary rounded-lg" />
              <div className="h-10 w-32 bg-light-secondary dark:bg-dark-secondary rounded-lg" />
            </div>
          </div>

          {/* Care Lists Grid */}
          <div className="space-y-4">
            {[1, 2, 3].map((index) => (
              <div
                key={index}
                className="p-4 rounded-lg bg-light-secondary/50 dark:bg-dark-secondary/50 border border-light-border dark:border-dark-border"
              >
                <div className="flex items-start justify-between">
                  <div className="flex-1">
                    <div className="flex items-center space-x-2">
                      <div className="h-6 w-48 bg-light-secondary dark:bg-dark-secondary rounded-lg" />
                      <div className="h-5 w-24 bg-light-secondary dark:bg-dark-secondary rounded-full" />
                    </div>
                    <div className="mt-1 h-4 w-full bg-light-secondary dark:bg-dark-secondary rounded-lg" />
                    <div className="mt-4 flex items-center space-x-4">
                      <div className="h-4 w-24 bg-light-secondary dark:bg-dark-secondary rounded-lg" />
                      <div className="h-4 w-24 bg-light-secondary dark:bg-dark-secondary rounded-lg" />
                      <div className="h-4 w-24 bg-light-secondary dark:bg-dark-secondary rounded-lg" />
                    </div>
                    <div className="mt-2 flex items-center space-x-2">
                      <div className="h-5 w-16 bg-light-secondary dark:bg-dark-secondary rounded-full" />
                      <div className="h-5 w-16 bg-light-secondary dark:bg-dark-secondary rounded-full" />
                      <div className="h-5 w-16 bg-light-secondary dark:bg-dark-secondary rounded-full" />
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
