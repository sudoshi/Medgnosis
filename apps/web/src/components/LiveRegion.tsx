// =============================================================================
// Medgnosis Web — LiveRegion
// Visually-hidden aria-live regions, mounted once in <App>. Driven by the
// announcer store; gives screen readers a voice for realtime alerts (assertive)
// and status changes like autosave (polite).
// =============================================================================

import { useAnnouncerStore } from '../stores/announcer.js';

export function LiveRegion() {
  const polite = useAnnouncerStore((s) => s.polite);
  const assertive = useAnnouncerStore((s) => s.assertive);
  return (
    <>
      <div className="sr-only" role="status" aria-live="polite" aria-atomic="true">
        {polite}
      </div>
      <div className="sr-only" role="alert" aria-live="assertive" aria-atomic="true">
        {assertive}
      </div>
    </>
  );
}
