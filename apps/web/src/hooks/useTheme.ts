// =============================================================================
// Medgnosis Web — Theme hook (no-op — always dark; palette switching via CSS vars)
// This hook is retained to avoid removing the useTheme() call in App.tsx.
// Palette persistence is handled by useThemeStore.initFromStorage() in main.tsx.
// =============================================================================

export function useTheme() {
  // Design is dark-only. The html element already has dark class from the body
  // class in index.html. Palette variables are applied via CSS custom properties
  // by the palette engine (stores/theme.ts + styles/palettes.ts).
}
