// =============================================================================
// Medgnosis Web — DataBoundary
// Standardizes the loading → error → empty → data render order for any
// query-backed section.
//
// The ORDER is a clinical-safety guarantee: an API error must NEVER fall
// through to an empty state. "No medications on record" and "couldn't load
// medications" are dangerously different, and several pages historically
// rendered the former on a failed fetch. Here, `isError` always wins over
// `isEmpty`. See QueryError.
// =============================================================================

import type { ReactNode } from 'react';
import { QueryError } from './QueryError.js';

interface DataBoundaryProps {
  /** Query is fetching with no usable data yet. */
  isLoading: boolean;
  /** Query failed. Takes precedence over `isEmpty` — never show empty on error. */
  isError?: boolean;
  /** Data loaded successfully but the result set is empty. */
  isEmpty?: boolean;
  /** Skeleton/loading node — pass one that preserves layout. */
  loading: ReactNode;
  /** Shown when `isEmpty` and not loading/errored. */
  empty?: ReactNode;
  /** Custom error node; defaults to <QueryError what onRetry />. */
  error?: ReactNode;
  /** Subject for the default QueryError message, e.g. "the care-gap worklist". */
  what?: string;
  /** Retry handler wired into the default QueryError (e.g. TanStack `refetch`). */
  onRetry?: () => void;
  /** Rendered when data is present. */
  children: ReactNode;
}

export function DataBoundary({
  isLoading,
  isError = false,
  isEmpty = false,
  loading,
  empty = null,
  error,
  what = 'data',
  onRetry,
  children,
}: DataBoundaryProps) {
  if (isLoading) return <>{loading}</>;
  // Error MUST win over empty — a failed fetch must never read as "no data".
  if (isError) return <>{error ?? <QueryError what={what} onRetry={onRetry} />}</>;
  if (isEmpty) return <>{empty}</>;
  return <>{children}</>;
}
