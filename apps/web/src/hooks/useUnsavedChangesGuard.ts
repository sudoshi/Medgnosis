// =============================================================================
// Medgnosis Web — useUnsavedChangesGuard
// Prevents silent loss of unsaved clinical documentation. The app uses a
// declarative <BrowserRouter> (not a data router), so React Router's useBlocker
// is unavailable; instead this hook:
//   1. warns on tab close / refresh while dirty (beforeunload), and
//   2. flushes pending changes when the component unmounts (in-app navigation),
//      so edits are persisted rather than dropped.
// isDirty / onFlush are read through refs so the listeners always see the latest
// values without re-subscribing.
// =============================================================================

import { useEffect, useRef } from 'react';

export function useUnsavedChangesGuard(isDirty: boolean, onFlush?: () => void): void {
  const dirtyRef = useRef(isDirty);
  const flushRef = useRef(onFlush);
  dirtyRef.current = isDirty;
  flushRef.current = onFlush;

  useEffect(() => {
    const onBeforeUnload = (e: BeforeUnloadEvent): void => {
      if (!dirtyRef.current) return;
      e.preventDefault();
      e.returnValue = ''; // some browsers require a truthy returnValue to prompt
    };
    window.addEventListener('beforeunload', onBeforeUnload);
    return () => {
      window.removeEventListener('beforeunload', onBeforeUnload);
      // Component unmounting (e.g. in-app navigation) — persist pending work.
      if (dirtyRef.current) flushRef.current?.();
    };
  }, []);
}
