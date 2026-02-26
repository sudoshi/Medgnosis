// =============================================================================
// Medgnosis Web — UI state store (Zustand)
// =============================================================================

import { create } from 'zustand';

// ─── Toast ────────────────────────────────────────────────────────────────────

export interface Toast {
  id: string;
  type: 'success' | 'error' | 'warning' | 'info';
  message: string;
}

const MAX_TOASTS = 3;

// ─── State ────────────────────────────────────────────────────────────────────

interface UiState {
  sidebarOpen: boolean;
  searchOpen: boolean;
  toggleSidebar: () => void;
  toggleSearch: () => void;
  setSidebarOpen: (open: boolean) => void;
  setSearchOpen: (open: boolean) => void;
  // Toasts
  toasts: Toast[];
  addToast: (toast: Omit<Toast, 'id'>) => void;
  removeToast: (id: string) => void;
}

export const useUiStore = create<UiState>()((set) => ({
  sidebarOpen: true,
  searchOpen: false,
  toggleSidebar: () => set((s) => ({ sidebarOpen: !s.sidebarOpen })),
  toggleSearch: () => set((s) => ({ searchOpen: !s.searchOpen })),
  setSidebarOpen: (open) => set({ sidebarOpen: open }),
  setSearchOpen: (open) => set({ searchOpen: open }),
  // Toasts
  toasts: [],
  addToast: (toast) =>
    set((s) => {
      const id = Math.random().toString(36).slice(2);
      const next = [{ ...toast, id }, ...s.toasts].slice(0, MAX_TOASTS);
      return { toasts: next };
    }),
  removeToast: (id) =>
    set((s) => ({ toasts: s.toasts.filter((t) => t.id !== id) })),
}));

// ─── Convenience hook ─────────────────────────────────────────────────────────

export function useToast() {
  const addToast = useUiStore((s) => s.addToast);
  return {
    success: (message: string) => addToast({ type: 'success', message }),
    error:   (message: string) => addToast({ type: 'error',   message }),
    warning: (message: string) => addToast({ type: 'warning', message }),
    info:    (message: string) => addToast({ type: 'info',    message }),
  };
}
