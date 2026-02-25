// =============================================================================
// Medgnosis Web — UI state store (Zustand)
// =============================================================================

import { create } from 'zustand';

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
