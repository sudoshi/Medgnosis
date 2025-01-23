'use client';

import { useEffect } from 'react';
import { ExclamationTriangleIcon } from '@heroicons/react/24/outline';

export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    // Log the error to an error reporting service
    console.error(error);
  }, [error]);

  return (
    <div className="min-h-screen bg-gradient-dark flex flex-col items-center justify-center p-4">
      <div className="max-w-md w-full space-y-8 text-center">
        <div className="flex justify-center">
          <div className="rounded-full bg-accent-error/10 p-4">
            <ExclamationTriangleIcon className="h-12 w-12 text-accent-error" />
          </div>
        </div>
        <div>
          <h1 className="text-2xl font-bold text-dark-text-primary">
            Something went wrong
          </h1>
          <p className="mt-2 text-dark-text-secondary">
            {error.message || 'An unexpected error occurred'}
          </p>
          {error.digest && (
            <p className="mt-1 text-sm text-dark-text-secondary">
              Error ID: {error.digest}
            </p>
          )}
        </div>
        <div className="flex flex-col space-y-4">
          <button
            onClick={reset}
            className="btn btn-primary w-full justify-center"
          >
            Try again
          </button>
          <button
            onClick={() => window.location.href = '/'}
            className="btn btn-secondary w-full justify-center"
          >
            Go to Dashboard
          </button>
        </div>
        <p className="text-sm text-dark-text-secondary">
          If the problem persists, please contact support
        </p>
      </div>
    </div>
  );
}
