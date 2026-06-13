// =============================================================================
// Medgnosis Web — QueryError
// A loud, honest failure state for data worklists. Critical on clinical pages:
// without it, an API error leaves `data` undefined and the page falls through
// to its empty state ("No open loops") — silently reading as "all clear" when
// the truth is "we don't know." Surfacing the failure is a safety requirement.
// =============================================================================

import { AlertTriangle } from 'lucide-react';

export function QueryError({ what = 'data' }: { what?: string }) {
  return (
    <div
      role="alert"
      className="p-4 bg-crimson/10 text-crimson rounded-card border border-crimson/20 text-sm flex items-center gap-2"
    >
      <AlertTriangle size={15} strokeWidth={2} aria-hidden="true" />
      Couldn&rsquo;t load {what}. Check API connectivity, then refresh.
    </div>
  );
}
