// =============================================================================
// Medgnosis Web — Toast notification system
// Stacked toasts, bottom-right, auto-dismiss after 4s
// =============================================================================

import { useEffect, useRef } from 'react';
import { CheckCircle2, XCircle, AlertTriangle, Info, X } from 'lucide-react';
import { useUiStore, type Toast } from '../stores/ui.js';

// ─── Single toast item ────────────────────────────────────────────────────────

function ToastItem({ toast }: { toast: Toast }) {
  const removeToast = useUiStore((s) => s.removeToast);
  const timerRef = useRef<ReturnType<typeof setTimeout>>(undefined);

  useEffect(() => {
    timerRef.current = setTimeout(() => removeToast(toast.id), 4000);
    return () => clearTimeout(timerRef.current);
  }, [toast.id, removeToast]);

  const icons: Record<Toast['type'], React.ReactNode> = {
    success: <CheckCircle2 size={16} strokeWidth={1.5} className="text-emerald flex-shrink-0" />,
    error:   <XCircle      size={16} strokeWidth={1.5} className="text-crimson  flex-shrink-0" />,
    warning: <AlertTriangle size={16} strokeWidth={1.5} className="text-amber   flex-shrink-0" />,
    info:    <Info          size={16} strokeWidth={1.5} className="text-info    flex-shrink-0" />,
  };

  const borders: Record<Toast['type'], string> = {
    success: 'border-emerald/30',
    error:   'border-crimson/30',
    warning: 'border-amber/30',
    info:    'border-edge/35',
  };

  return (
    <div
      className={[
        'flex items-start gap-3 px-4 py-3 rounded-card border bg-s0',
        'shadow-lg',
        'animate-fade-up',
        borders[toast.type],
      ].join(' ')}
      role="status"
      aria-live="polite"
    >
      <span className="mt-0.5">{icons[toast.type]}</span>
      <p className="flex-1 text-sm text-bright leading-snug">{toast.message}</p>
      <button
        onClick={() => removeToast(toast.id)}
        className="flex-shrink-0 p-0.5 rounded-card text-ghost hover:text-dim transition-colors"
        aria-label="Dismiss notification"
      >
        <X size={13} strokeWidth={1.5} />
      </button>
    </div>
  );
}

// ─── Container — mounts in AppShell ──────────────────────────────────────────

export function ToastContainer() {
  const toasts = useUiStore((s) => s.toasts);
  if (toasts.length === 0) return null;

  return (
    <div
      className="fixed bottom-5 right-5 z-[200] flex flex-col-reverse gap-2 w-[340px] max-w-[calc(100vw-2.5rem)]"
      aria-live="polite"
      aria-label="Notifications"
    >
      {toasts.map((t) => (
        <ToastItem key={t.id} toast={t} />
      ))}
    </div>
  );
}
