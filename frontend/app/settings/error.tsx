"use client";

import { ExclamationTriangleIcon } from "@heroicons/react/24/outline";

export default function SettingsError({
  error,
  reset,
}: {
  error: Error;
  reset: () => void;
}) {
  return (
    <div className="h-full overflow-y-auto">
      <div className="p-6">
        <div className="max-w-4xl mx-auto">
          <div className="bg-light-primary dark:bg-dark-primary rounded-lg border border-light-border dark:border-dark-border p-6 shadow-md">
            <div className="flex flex-col items-center text-center">
              <ExclamationTriangleIcon className="h-12 w-12 text-accent-error mb-4" />
              <h2 className="text-xl font-semibold text-light-text-primary dark:text-dark-text-primary mb-2">
                Failed to Load Settings
              </h2>
              <p className="text-light-text-secondary dark:text-dark-text-secondary mb-6">
                {error.message ||
                  "An unexpected error occurred while loading settings."}
              </p>
              <div className="flex items-center space-x-4">
                <button
                  aria-label="Try loading settings again"
                  className="px-4 py-2 rounded-lg bg-accent-primary text-white hover:bg-accent-primary/90 focus:ring-2 focus:ring-accent-primary focus:ring-offset-2 dark:focus:ring-offset-dark-primary transition-all"
                  onClick={() => reset()}
                >
                  Try Again
                </button>
                <a
                  aria-label="Return to dashboard"
                  className="px-4 py-2 rounded-lg bg-light-secondary dark:bg-dark-secondary text-light-text-secondary dark:text-dark-text-secondary hover:text-light-text-primary dark:hover:text-dark-text-primary border border-light-border dark:border-dark-border transition-colors"
                  href="/dashboard"
                >
                  Return to Dashboard
                </a>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
