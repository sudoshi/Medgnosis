// =============================================================================
// Medgnosis Web — 404 page
// =============================================================================

import { Link } from 'react-router-dom';

export function NotFoundPage() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-dark">
      <div className="text-center">
        <h1 className="text-6xl font-bold text-accent-primary">404</h1>
        <p className="mt-4 text-xl text-dark-text-primary">Page not found</p>
        <p className="mt-2 text-dark-text-secondary">
          The page you&apos;re looking for doesn&apos;t exist.
        </p>
        <Link
          to="/dashboard"
          className="mt-6 inline-block px-6 py-3 rounded-lg bg-accent-primary text-white hover:bg-accent-primary/90 transition-all"
        >
          Go to Dashboard
        </Link>
      </div>
    </div>
  );
}
