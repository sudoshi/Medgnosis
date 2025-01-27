"use client";

import { ExclamationTriangleIcon } from "@heroicons/react/24/outline";

export default function MeasuresReportsError({
  error,
  reset,
}: {
  error: Error;
  reset: () => void;
}) {
  return (
    <div className="p-6">
      <div className="max-w-4xl mx-auto">
        <div className="p-6 bg-light-primary dark:bg-dark-primary border border-light-border dark:border-dark-border rounded-lg">
          <div className="flex flex-col items-center text-center">
            <ExclamationTriangleIcon className="h-12 w-12 text-accent-error mb-4" />
            <h2 className="text-xl font-semibold text-light-text-primary dark:text-dark-text-primary mb-2">
              Failed to Load Reports
            </h2>
            <p className="text-light-text-secondary dark:text-dark-text-secondary mb-6">
              {error.message ||
                "An unexpected error occurred while loading reports."}
            </p>
            <div className="flex items-center space-x-4">
              <button
                aria-label="Try loading reports again"
                className="btn btn-primary"
                onClick={() => reset()}
              >
                Try Again
              </button>
              <a
                aria-label="Return to measures page"
                className="btn btn-secondary"
                href="/measures"
              >
                Return to Measures
              </a>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
