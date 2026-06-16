// =============================================================================
// Medgnosis Web — Screen-reader announcer
// Single source for polite/assertive live-region messages. The app previously
// had ZERO aria-live, so realtime alerts and save-status changes were silent to
// screen readers. Any code (hooks, socket handlers, components) can call
// `announce(...)`; <LiveRegion> renders the visually-hidden regions.
// =============================================================================

import { create } from 'zustand';

interface AnnouncerState {
  polite: string;
  assertive: string;
  announce: (message: string, opts?: { assertive?: boolean }) => void;
}

export const useAnnouncerStore = create<AnnouncerState>((set, get) => ({
  polite: '',
  assertive: '',
  announce: (message, opts) => {
    const key = opts?.assertive ? 'assertive' : 'polite';
    // Force a DOM text change even for repeats (e.g. two "Saved"s) so the
    // screen reader re-announces — a zero-width space is invisible on screen.
    const next = get()[key] === message ? `${message}​` : message;
    set({ [key]: next } as Partial<AnnouncerState>);
  },
}));

/** Imperative announce for use outside React render (socket handlers, etc.). */
export function announce(message: string, opts?: { assertive?: boolean }): void {
  useAnnouncerStore.getState().announce(message, opts);
}
