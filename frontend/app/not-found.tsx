import Link from 'next/link';
import { HomeIcon } from '@heroicons/react/24/outline';

export default function NotFound() {
  return (
    <div className="min-h-screen bg-gradient-dark flex flex-col items-center justify-center p-4">
      <div className="max-w-md w-full space-y-8 text-center">
        <div>
          <h1 className="text-8xl font-bold text-accent-primary">404</h1>
          <h2 className="mt-6 text-2xl font-semibold text-dark-text-primary">
            Page not found
          </h2>
          <p className="mt-2 text-dark-text-secondary">
            The page you&apos;re looking for doesn&apos;t exist or has been moved.
          </p>
        </div>

        {/* Illustration */}
        <div className="relative py-12">
          <div className="absolute inset-0 flex items-center justify-center opacity-10">
            <div className="w-64 h-64 bg-accent-primary rounded-full blur-3xl" />
          </div>
          <div className="relative">
            <svg
              className="mx-auto h-32 w-32 text-dark-text-secondary"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              aria-hidden="true"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={0.5}
                d="M9.172 16.172a4 4 0 015.656 0M9 10h.01M15 10h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
              />
            </svg>
          </div>
        </div>

        <div className="flex flex-col space-y-4">
          <Link
            href="/"
            className="btn btn-primary w-full justify-center inline-flex items-center"
          >
            <HomeIcon className="h-5 w-5 mr-2" />
            Go to Dashboard
          </Link>
          <button
            onClick={() => window.history.back()}
            className="btn btn-secondary w-full justify-center"
          >
            Go Back
          </button>
        </div>

        <div className="pt-4 border-t border-dark-border">
          <p className="text-sm text-dark-text-secondary">
            Need help? <Link href="/support" className="text-accent-primary hover:text-accent-primary/80">Contact support</Link>
          </p>
        </div>
      </div>
    </div>
  );
}
