// =============================================================================
// Medgnosis Web — QueryError
// A loud, honest failure state for data worklists. Critical on clinical pages:
// without it, an API error leaves `data` undefined and the page falls through
// to its empty state ("No open loops") — silently reading as "all clear" when
// the truth is "we don't know." Surfacing the failure is a safety requirement.
// =============================================================================

import { AlertTriangle } from 'lucide-react';

export function QueryError({
  what = 'data',
  onRetry,
}: {
  what?: string;
  onRetry?: () => void;
}) {
  return (
    <div
      role="alert"
      className="p-4 bg-crimson/10 text-crimson rounded-card border border-crimson/20 text-sm flex items-center gap-2"
    >
      <AlertTriangle size={15} strokeWidth={2} aria-hidden="true" />
      <span>Couldn&rsquo;t load {what}. Check API connectivity, then refresh.</span>
      {onRetry && (
        <button
          type="button"
          onClick={onRetry}
          className="ml-auto flex-shrink-0 rounded-btn border border-crimson/30 px-2.5 py-1 text-xs font-medium text-crimson transition-colors hover:bg-crimson/15 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-crimson/40"
        >
          Retry
        </button>
      )}
    </div>
  );
}
