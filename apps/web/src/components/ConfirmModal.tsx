// =============================================================================
// Medgnosis Web — Confirm Modal
// Generic confirmation dialog with danger/primary variant.
// Built on the shadcn AlertDialog primitive (Radix): focus trap, ESC, scrim.
// Public API (open/title/body/confirm*/onConfirm/onCancel) is unchanged.
// =============================================================================

import { useRef } from 'react';
import { AlertTriangle } from 'lucide-react';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';

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
  // Distinguish a confirm-driven close from a dismiss (ESC / overlay / Cancel),
  // so onCancel fires only on genuine dismissal — never alongside onConfirm.
  const confirming = useRef(false);

  return (
    <AlertDialog
      open={open}
      onOpenChange={(next) => {
        if (!next) {
          if (!confirming.current) onCancel();
          confirming.current = false;
        }
      }}
    >
      <AlertDialogContent className="max-w-sm">
        <AlertDialogHeader>
          <div className="flex items-start gap-3">
            {confirmVariant === 'danger' && (
              <div className="mt-0.5 flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-full bg-crimson/10">
                <AlertTriangle size={16} strokeWidth={1.5} className="text-crimson" aria-hidden="true" />
              </div>
            )}
            <div className="min-w-0 flex-1">
              <AlertDialogTitle className="text-sm leading-snug">{title}</AlertDialogTitle>
              {body && (
                <AlertDialogDescription className="mt-1.5 text-xs leading-relaxed">
                  {body}
                </AlertDialogDescription>
              )}
            </div>
          </div>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Cancel</AlertDialogCancel>
          <AlertDialogAction
            onClick={() => {
              confirming.current = true;
              onConfirm();
            }}
            className={confirmVariant === 'danger' ? 'bg-crimson text-white hover:bg-crimson/90' : undefined}
          >
            {confirmLabel}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
