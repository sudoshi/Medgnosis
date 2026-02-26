// =============================================================================
// Medgnosis Web — Confirm Modal
// Generic confirmation dialog with danger/primary variant
// =============================================================================

import { useEffect, useRef } from 'react';
import { AlertTriangle, X } from 'lucide-react';

interface ConfirmModalProps {
  open: boolean;
  title: string;
  body?: string;
  confirmLabel?: string;
  confirmVariant?: 'danger' | 'primary';
  onConfirm: () => void;
  onCancel: () => void;
}

export function ConfirmModal({
  open,
  title,
  body,
  confirmLabel = 'Confirm',
  confirmVariant = 'primary',
  onConfirm,
  onCancel,
}: ConfirmModalProps) {
  const confirmRef = useRef<HTMLButtonElement>(null);

  // Focus confirm button when modal opens
  useEffect(() => {
    if (open) {
      const t = setTimeout(() => confirmRef.current?.focus(), 50);
      return () => clearTimeout(t);
    }
  }, [open]);

  // Esc to cancel
  useEffect(() => {
    if (!open) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onCancel();
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [open, onCancel]);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center px-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="confirm-title"
    >
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-void/75 backdrop-blur-sm"
        onClick={onCancel}
        aria-hidden="true"
      />

      {/* Panel */}
      <div className="relative w-full max-w-sm bg-s0 border border-edge/40 rounded-panel shadow-xl animate-fade-up">
        <div className="p-5">
          <div className="flex items-start gap-3">
            {confirmVariant === 'danger' && (
              <div className="flex-shrink-0 w-9 h-9 rounded-full bg-crimson/10 flex items-center justify-center mt-0.5">
                <AlertTriangle size={16} strokeWidth={1.5} className="text-crimson" aria-hidden="true" />
              </div>
            )}
            <div className="flex-1 min-w-0">
              <h2 id="confirm-title" className="text-sm font-semibold text-bright leading-snug">
                {title}
              </h2>
              {body && (
                <p className="text-xs text-dim mt-1.5 leading-relaxed">{body}</p>
              )}
            </div>
            <button
              onClick={onCancel}
              className="flex-shrink-0 p-1 rounded-card text-ghost hover:text-dim transition-colors"
              aria-label="Close dialog"
            >
              <X size={14} strokeWidth={1.5} />
            </button>
          </div>
        </div>

        <div className="flex items-center justify-end gap-2.5 px-5 py-3.5 border-t border-edge/20">
          <button onClick={onCancel} className="btn-ghost btn-sm">
            Cancel
          </button>
          <button
            ref={confirmRef}
            onClick={onConfirm}
            className={
              confirmVariant === 'danger'
                ? [
                    'flex items-center gap-1.5 px-4 py-2 rounded-btn text-sm font-ui',
                    'bg-crimson text-white hover:bg-crimson/80 transition-colors duration-100',
                    'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-crimson/50',
                  ].join(' ')
                : 'btn-primary'
            }
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
