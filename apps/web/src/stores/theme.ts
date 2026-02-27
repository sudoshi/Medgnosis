// =============================================================================
// Medgnosis Web — Theme store (Zustand) — palette-aware
// Replaces the old light/dark/system store with a 5-palette switcher.
// =============================================================================

import { create } from 'zustand';
import { applyPalette } from '../styles/palettes.js';

const DEFAULT_PALETTE = 'clinical-teal';
const STORAGE_KEY = 'mg_palette';

interface ThemeStore {
  paletteId: string;
  initFromStorage(): void;
  setPalette(id: string): void;
}

export const useThemeStore = create<ThemeStore>((set) => ({
  paletteId: DEFAULT_PALETTE,

  initFromStorage() {
    const id = localStorage.getItem(STORAGE_KEY) ?? DEFAULT_PALETTE;
    applyPalette(id);
    set({ paletteId: id });
  },

  setPalette(id: string) {
    applyPalette(id);
    localStorage.setItem(STORAGE_KEY, id);
    set({ paletteId: id });
  },
}));
