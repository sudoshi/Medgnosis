// =============================================================================
// Medgnosis Web — Theme hook (syncs Zustand with <html> class)
// =============================================================================

import { useEffect } from 'react';
import { useThemeStore } from '../stores/theme.js';

export function useTheme() {
  const { theme } = useThemeStore();

  useEffect(() => {
    const root = document.documentElement;

    if (theme === 'dark') {
      root.classList.add('dark');
    } else if (theme === 'light') {
      root.classList.remove('dark');
    } else {
      // system
      const mq = window.matchMedia('(prefers-color-scheme: dark)');
      const apply = () => {
        if (mq.matches) {
          root.classList.add('dark');
        } else {
          root.classList.remove('dark');
        }
      };
      apply();
      mq.addEventListener('change', apply);
      return () => mq.removeEventListener('change', apply);
    }
  }, [theme]);
}
