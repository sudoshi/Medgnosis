export default function SettingsLoading() {
  return (
    <div className="h-full overflow-y-auto">
      <div className="space-y-6 p-6 animate-pulse">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div className="h-8 w-48 bg-light-secondary dark:bg-dark-secondary rounded-lg" />
        </div>

        {/* Notifications Section */}
        <div className="bg-light-primary dark:bg-dark-primary rounded-lg border border-light-border dark:border-dark-border p-6 shadow-md">
          <div className="flex items-start space-x-4">
            <div className="rounded-lg bg-light-secondary dark:bg-dark-secondary p-3">
              <div className="h-6 w-6" />
            </div>
            <div className="flex-1">
              <div className="h-6 w-48 bg-light-secondary dark:bg-dark-secondary rounded-lg" />
              <div className="h-4 w-96 mt-1 bg-light-secondary dark:bg-dark-secondary rounded-lg" />
              <div className="mt-4 space-y-4">
                {[1, 2, 3, 4].map((index) => (
                  <div
                    key={index}
                    className="flex justify-between items-center"
                  >
                    <div className="h-4 w-32 bg-light-secondary dark:bg-dark-secondary rounded-lg" />
                    <div className="h-8 w-14 bg-light-secondary dark:bg-dark-secondary rounded-full" />
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>

        {/* ETL Settings Section */}
        <div className="bg-light-primary dark:bg-dark-primary rounded-lg border border-light-border dark:border-dark-border p-6 shadow-md">
          <div className="flex items-start space-x-4">
            <div className="rounded-lg bg-light-secondary dark:bg-dark-secondary p-3">
              <div className="h-6 w-6" />
            </div>
            <div className="flex-1">
              <div className="h-6 w-48 bg-light-secondary dark:bg-dark-secondary rounded-lg" />
              <div className="h-4 w-96 mt-1 bg-light-secondary dark:bg-dark-secondary rounded-lg" />
              <div className="mt-4 space-y-4">
                {[1, 2, 3].map((index) => (
                  <div
                    key={index}
                    className="flex justify-between items-center"
                  >
                    <div>
                      <div className="h-4 w-48 bg-light-secondary dark:bg-dark-secondary rounded-lg" />
                      <div className="h-3 w-64 mt-1 bg-light-secondary dark:bg-dark-secondary rounded-lg" />
                    </div>
                    <div className="h-8 w-14 bg-light-secondary dark:bg-dark-secondary rounded-full" />
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>

        {/* Schedule Section */}
        <div className="bg-light-primary dark:bg-dark-primary rounded-lg border border-light-border dark:border-dark-border p-6 shadow-md">
          <div className="flex items-start space-x-4">
            <div className="rounded-lg bg-light-secondary dark:bg-dark-secondary p-3">
              <div className="h-6 w-6" />
            </div>
            <div className="flex-1">
              <div className="h-6 w-48 bg-light-secondary dark:bg-dark-secondary rounded-lg" />
              <div className="h-4 w-96 mt-1 bg-light-secondary dark:bg-dark-secondary rounded-lg" />
              <div className="mt-4">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {[1, 2].map((index) => (
                    <div
                      key={index}
                      className="bg-light-secondary/50 dark:bg-dark-secondary/50 rounded-lg border border-light-border dark:border-dark-border p-4"
                    >
                      <div className="h-5 w-32 bg-light-secondary dark:bg-dark-secondary rounded-lg mb-2" />
                      <div className="h-10 w-full bg-light-secondary dark:bg-dark-secondary rounded-lg" />
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Security Section */}
        <div className="bg-light-primary dark:bg-dark-primary rounded-lg border border-light-border dark:border-dark-border p-6 shadow-md">
          <div className="flex items-start space-x-4">
            <div className="rounded-lg bg-light-secondary dark:bg-dark-secondary p-3">
              <div className="h-6 w-6" />
            </div>
            <div className="flex-1">
              <div className="h-6 w-48 bg-light-secondary dark:bg-dark-secondary rounded-lg" />
              <div className="h-4 w-96 mt-1 bg-light-secondary dark:bg-dark-secondary rounded-lg" />
              <div className="mt-4 space-y-4">
                {[1, 2].map((index) => (
                  <div
                    key={index}
                    className="bg-light-secondary/50 dark:bg-dark-secondary/50 rounded-lg border border-light-border dark:border-dark-border p-4"
                  >
                    <div className="h-5 w-32 bg-light-secondary dark:bg-dark-secondary rounded-lg mb-2" />
                    {index === 1 ? (
                      <div className="h-10 w-32 bg-light-secondary dark:bg-dark-secondary rounded-lg" />
                    ) : (
                      <div className="flex items-center justify-between">
                        <div className="h-10 flex-1 mr-4 bg-light-secondary dark:bg-dark-secondary rounded-lg" />
                        <div className="h-10 w-24 bg-light-secondary dark:bg-dark-secondary rounded-lg" />
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>

        {/* Profile Section */}
        <div className="bg-light-primary dark:bg-dark-primary rounded-lg border border-light-border dark:border-dark-border p-6 shadow-md">
          <div className="flex items-start space-x-4">
            <div className="rounded-lg bg-light-secondary dark:bg-dark-secondary p-3">
              <div className="h-6 w-6" />
            </div>
            <div className="flex-1">
              <div className="h-6 w-48 bg-light-secondary dark:bg-dark-secondary rounded-lg" />
              <div className="h-4 w-96 mt-1 bg-light-secondary dark:bg-dark-secondary rounded-lg" />
              <div className="mt-4 space-y-4">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {[1, 2, 3, 4].map((index) => (
                    <div key={index}>
                      <div className="h-4 w-24 bg-light-secondary dark:bg-dark-secondary rounded-lg mb-1" />
                      <div className="h-10 w-full bg-light-secondary dark:bg-dark-secondary rounded-lg" />
                    </div>
                  ))}
                </div>
                <div className="flex justify-end">
                  <div className="h-10 w-32 bg-light-secondary dark:bg-dark-secondary rounded-lg" />
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
