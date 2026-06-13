// =============================================================================
// Medgnosis Web — UI state store (Zustand)
// =============================================================================

import { create } from 'zustand';
import { toast } from 'sonner';

// ─── State ────────────────────────────────────────────────────────────────────

interface UiState {
  sidebarOpen: boolean;
  searchOpen: boolean;
  toggleSidebar: () => void;
  toggleSearch: () => void;
  setSidebarOpen: (open: boolean) => void;
  setSearchOpen: (open: boolean) => void;
}

export const useUiStore = create<UiState>()((set) => ({
  sidebarOpen: true,
  searchOpen: false,
  toggleSidebar: () => set((s) => ({ sidebarOpen: !s.sidebarOpen })),
  toggleSearch: () => set((s) => ({ searchOpen: !s.searchOpen })),
  setSidebarOpen: (open) => set({ sidebarOpen: open }),
  setSearchOpen: (open) => set({ searchOpen: open }),
}));

// ─── Toast ────────────────────────────────────────────────────────────────────
// Delegates to sonner (rendered by <Toaster> at the app root). Stable object so
// the prior useToast() shape — { success, error, warning, info } — is unchanged
// and existing call sites need no edits.

const toastApi = {
  success: (message: string) => toast.success(message),
  error: (message: string) => toast.error(message),
  warning: (message: string) => toast.warning(message),
  info: (message: string) => toast.info(message),
};

export function useToast() {
  return toastApi;
}
