// =============================================================================
// Medgnosis Web — Theme store (Zustand)
// Two orthogonal axes:
//   theme   ∈ { auto, dark, light }   — surfaces/text/borders (data-theme attr)
//   palette ∈ 5 accent palettes       — primary/accent hue (CSS var overrides)
// 'auto' follows the OS prefers-color-scheme and live-updates.
// =============================================================================

import { create } from 'zustand';
import { applyPalette } from '../styles/palettes.js';

type ThemeMode = 'auto' | 'dark' | 'light';
type Resolved = 'dark' | 'light';

const THEME_KEY = 'mg_theme';
const PALETTE_KEY = 'mg_palette';
const DEFAULT_PALETTE = 'clinical-teal';

const systemPrefersDark = (): boolean =>
  typeof window !== 'undefined' && typeof window.matchMedia === 'function'
    ? window.matchMedia('(prefers-color-scheme: dark)').matches
    : true;

const resolve = (mode: ThemeMode): Resolved =>
  mode === 'auto' ? (systemPrefersDark() ? 'dark' : 'light') : mode;

function apply(resolved: Resolved, paletteId: string): void {
  document.documentElement.dataset.theme = resolved;
  applyPalette(paletteId, resolved);
}

interface ThemeStore {
  theme: ThemeMode;
  resolvedTheme: Resolved;
  paletteId: string;
  initFromStorage(): void;
  setTheme(mode: ThemeMode): void;
  toggleTheme(): void;
  setPalette(id: string): void;
}

export const useThemeStore = create<ThemeStore>((set, get) => ({
  theme: 'auto',
  resolvedTheme: 'dark',
  paletteId: DEFAULT_PALETTE,

  initFromStorage() {
    const theme = (localStorage.getItem(THEME_KEY) as ThemeMode | null) ?? 'auto';
    const paletteId = localStorage.getItem(PALETTE_KEY) ?? DEFAULT_PALETTE;
    const resolvedTheme = resolve(theme);
    apply(resolvedTheme, paletteId);
    set({ theme, resolvedTheme, paletteId });

    // Live-follow the OS only while in 'auto'
    if (typeof window !== 'undefined' && typeof window.matchMedia === 'function') {
      window
        .matchMedia('(prefers-color-scheme: dark)')
        .addEventListener('change', () => {
          if (get().theme !== 'auto') return;
          const next = resolve('auto');
          apply(next, get().paletteId);
          set({ resolvedTheme: next });
        });
    }
  },

  setTheme(theme) {
    const resolvedTheme = resolve(theme);
    apply(resolvedTheme, get().paletteId);
    localStorage.setItem(THEME_KEY, theme);
    set({ theme, resolvedTheme });
  },

  toggleTheme() {
    get().setTheme(get().resolvedTheme === 'dark' ? 'light' : 'dark');
  },

  setPalette(paletteId) {
    apply(get().resolvedTheme, paletteId);
    localStorage.setItem(PALETTE_KEY, paletteId);
    set({ paletteId });
  },
}));
