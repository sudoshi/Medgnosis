// =============================================================================
// Medgnosis Web — Global keyboard shortcuts hook
// =============================================================================

import { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';

interface ShortcutHandlers {
  onSearch?: () => void;
  onNewNote?: () => void;
}

export function useKeyboardShortcuts(handlers: ShortcutHandlers = {}) {
  const navigate = useNavigate();

  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      // Don't trigger in input fields (except Escape)
      const target = e.target as HTMLElement;
      if (
        target.tagName === 'INPUT' ||
        target.tagName === 'TEXTAREA' ||
        target.isContentEditable
      ) {
        // Still allow Cmd+K / Ctrl+K even in inputs
        if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
          e.preventDefault();
          handlers.onSearch?.();
        }
        return;
      }

      // Cmd+K or Ctrl+K → Search / Command Palette
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault();
        handlers.onSearch?.();
        return;
      }

      // Alt+number shortcuts for navigation (preserved from original)
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
        return;
      }

      // Single key shortcuts (no modifier)
      if (e.metaKey || e.ctrlKey || e.altKey) return;

      switch (e.key) {
        case '/':
          e.preventDefault();
          handlers.onSearch?.();
          break;
        case 'n':
        case 'N':
          handlers.onNewNote?.();
          break;
        case 'a':
        case 'A':
          navigate('/alerts');
          break;
        case 'p':
        case 'P':
          navigate('/patients');
          break;
        case 'd':
        case 'D':
          navigate('/dashboard');
          break;
        case '?':
          // Reserved for shortcuts help overlay
          break;
      }
    }

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [navigate, handlers]);
}
