// =============================================================================
// Medgnosis Web — Keyboard shortcuts hook
// =============================================================================

import { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useUiStore } from '../stores/ui.js';

export function useKeyboardShortcuts() {
  const navigate = useNavigate();
  const { toggleSearch } = useUiStore();

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      // Ignore when typing in inputs
      const target = e.target as HTMLElement;
      if (
        target.tagName === 'INPUT' ||
        target.tagName === 'TEXTAREA' ||
        target.isContentEditable
      ) {
        // Still allow Escape
        if (e.key !== 'Escape') return;
      }

      // Ctrl/Cmd + K — Global search
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault();
        toggleSearch();
        return;
      }

      // Navigate with keyboard
      if (e.altKey) {
        switch (e.key) {
          case '1':
            e.preventDefault();
            navigate('/dashboard');
            break;
          case '2':
            e.preventDefault();
            navigate('/patients');
            break;
          case '3':
            e.preventDefault();
            navigate('/measures');
            break;
          case '4':
            e.preventDefault();
            navigate('/care-lists');
            break;
          case '5':
            e.preventDefault();
            navigate('/alerts');
            break;
        }
      }
    };

    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [navigate, toggleSearch]);
}
