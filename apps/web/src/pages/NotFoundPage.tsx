// =============================================================================
// Medgnosis Web — 404 Not Found
// =============================================================================

import { Link } from 'react-router-dom';
import { Button } from '@/components/ui/button';

export function NotFoundPage() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-void">
      <div className="text-center">
        <h1 className="text-6xl font-bold text-teal font-data tabular-nums">404</h1>
        <p className="mt-4 text-xl text-bright">Page not found</p>
        <p className="mt-2 text-dim">
          The page you&apos;re looking for doesn&apos;t exist.
        </p>
        <Button asChild className="mt-6">
          <Link to="/dashboard">Go to Dashboard</Link>
        </Button>
      </div>
    </div>
  );
}
