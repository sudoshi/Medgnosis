'use client';

import { Dialog } from './dialog';
import { Button } from './button';
import { XMarkIcon } from '@heroicons/react/24/outline';
import { cn } from '@/lib/utils';

export interface ModalProps {
  open: boolean;
  onClose: () => void;
  title?: React.ReactNode;
  description?: React.ReactNode;
  children: React.ReactNode;
  footer?: React.ReactNode;
  showClose?: boolean;
  className?: string;
  size?: 'sm' | 'md' | 'lg' | 'xl' | 'full';
}

export function Modal({
  open,
  onClose,
  title,
  description,
  children,
  footer,
  showClose = true,
  className,
  size = 'md',
}: ModalProps) {
  return (
    <Dialog
      open={open}
      onClose={onClose}
      title={title}
      description={description}
      showClose={showClose}
      className={className}
      size={size}
    >
      <div className="space-y-6">
        {children}
        {footer && (
          <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end sm:space-x-2">
            {footer}
          </div>
        )}
      </div>
    </Dialog>
  );
}

export interface ConfirmModalProps extends Omit<ModalProps, 'children' | 'footer'> {
  message: React.ReactNode;
  confirmLabel?: string;
  cancelLabel?: string;
  onConfirm: () => void;
  variant?: 'default' | 'danger';
  loading?: boolean;
}

export function ConfirmModal({
  open,
  onClose,
  title,
  message,
  confirmLabel = 'Confirm',
  cancelLabel = 'Cancel',
  onConfirm,
  variant = 'default',
  loading = false,
  ...props
}: ConfirmModalProps) {
  return (
    <Modal
      open={open}
      onClose={onClose}
      title={title}
      footer={
        <>
          <Button
            variant="secondary"
            onClick={onClose}
            disabled={loading}
          >
            {cancelLabel}
          </Button>
          <Button
            variant={variant === 'danger' ? 'error' : 'default'}
            onClick={onConfirm}
            loading={loading}
          >
            {confirmLabel}
          </Button>
        </>
      }
      {...props}
    >
      <div className="text-dark-text-primary">{message}</div>
    </Modal>
  );
}

export interface AlertModalProps extends Omit<ModalProps, 'children' | 'footer'> {
  message: React.ReactNode;
  buttonLabel?: string;
  variant?: 'default' | 'success' | 'warning' | 'error';
}

export function AlertModal({
  open,
  onClose,
  title,
  message,
  buttonLabel = 'OK',
  variant = 'default',
  ...props
}: AlertModalProps) {
  return (
    <Modal
      open={open}
      onClose={onClose}
      title={title}
      footer={
        <Button
          variant={
            variant === 'default'
              ? 'default'
              : variant === 'success'
              ? 'success'
              : variant === 'warning'
              ? 'warning'
              : 'error'
          }
          onClick={onClose}
        >
          {buttonLabel}
        </Button>
      }
      {...props}
    >
      <div className="text-dark-text-primary">{message}</div>
    </Modal>
  );
}

export interface FormModalProps extends Omit<ModalProps, 'children'> {
  form: React.ReactNode;
  submitLabel?: string;
  cancelLabel?: string;
  onSubmit?: () => void;
  loading?: boolean;
}

export function FormModal({
  open,
  onClose,
  title,
  description,
  form,
  submitLabel = 'Submit',
  cancelLabel = 'Cancel',
  onSubmit,
  loading = false,
  ...props
}: FormModalProps) {
  return (
    <Modal
      open={open}
      onClose={onClose}
      title={title}
      description={description}
      footer={
        <>
          <Button
            variant="secondary"
            onClick={onClose}
            disabled={loading}
          >
            {cancelLabel}
          </Button>
          <Button
            onClick={onSubmit}
            loading={loading}
          >
            {submitLabel}
          </Button>
        </>
      }
      {...props}
    >
      {form}
    </Modal>
  );
}
