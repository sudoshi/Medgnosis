'use client';

import { XMarkIcon } from '@heroicons/react/24/outline';
import { useEffect, useState, createContext, useContext, type ReactNode } from 'react';
import { createPortal } from 'react-dom';

import { cn } from '@/lib/utils';

export type ToastVariant = 'default' | 'info' | 'success' | 'warning' | 'error';
export type ToastPosition = 'top-right' | 'top-left' | 'bottom-right' | 'bottom-left';

export interface ToastProps {
  id: string;
  title?: string;
  message: string;
  variant?: ToastVariant;
  duration?: number;
  position?: ToastPosition;
  onClose: (id: string) => void;
}

const variants = {
  default: 'bg-dark-secondary border-dark-border',
  info: 'bg-accent-primary/10 border-accent-primary/20',
  success: 'bg-accent-success/10 border-accent-success/20',
  warning: 'bg-accent-warning/10 border-accent-warning/20',
  error: 'bg-accent-error/10 border-accent-error/20',
};

const textColors = {
  default: 'text-dark-text-primary',
  info: 'text-accent-primary',
  success: 'text-accent-success',
  warning: 'text-accent-warning',
  error: 'text-accent-error',
};

export function Toast({
  id,
  title,
  message,
  variant = 'default',
  duration = 5000,
  position = 'top-right',
  onClose,
}: ToastProps) {
  const [isVisible, setIsVisible] = useState(true);
  const [isMounted, setIsMounted] = useState(false);

  useEffect(() => {
    setIsMounted(true);
    return () => setIsMounted(false);
  }, []);

  useEffect(() => {
    if (duration > 0) {
      const timer = setTimeout(() => {
        setIsVisible(false);
        setTimeout(() => onClose(id), 300);
      }, duration);

      return () => clearTimeout(timer);
    }
    return undefined;
  }, [duration, id, onClose]);

  const positions = {
    'top-right': 'top-4 right-4',
    'top-left': 'top-4 left-4',
    'bottom-right': 'bottom-4 right-4',
    'bottom-left': 'bottom-4 left-4',
  };

  if (!isMounted) return null;

  return createPortal(
    <div
      className={cn(
        'fixed z-50 w-full max-w-sm transition-all duration-300',
        positions[position],
        isVisible ? 'translate-y-0 opacity-100' : 'translate-y-2 opacity-0'
      )}
    >
      <div
        className={cn(
          'rounded-lg border p-4 shadow-lg',
          variants[variant]
        )}
      >
        <div className="flex w-full items-start gap-4">
          <div className="flex-1">
            {title && (
              <h5 className={cn('mb-1 font-medium', textColors[variant])}>
                {title}
              </h5>
            )}
            <p className={cn('text-sm', textColors[variant])}>{message}</p>
          </div>
          <button
            onClick={() => {
              setIsVisible(false);
              setTimeout(() => onClose(id), 300);
            }}
            className={cn(
              'rounded-sm opacity-70 ring-offset-background transition-opacity hover:opacity-100',
              'focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2',
              textColors[variant]
            )}
          >
            <XMarkIcon className="h-4 w-4" />
            <span className="sr-only">Close</span>
          </button>
        </div>
      </div>
    </div>,
    document.body
  );
}

export interface ToastProviderProps {
  children: ReactNode;
}

export interface ToastContextValue {
  show: (props: Omit<ToastProps, 'id' | 'onClose'>) => void;
  success: (message: string, title?: string) => void;
  error: (message: string, title?: string) => void;
  warning: (message: string, title?: string) => void;
  info: (message: string, title?: string) => void;
}

export const ToastContext = createContext<ToastContextValue | null>(null);

export function ToastProvider({ children }: ToastProviderProps) {
  const [toasts, setToasts] = useState<ToastProps[]>([]);

  const removeToast = (id: string) => {
    setToasts((prev) => prev.filter((toast) => toast.id !== id));
  };

  const addToast = (props: Omit<ToastProps, 'id' | 'onClose'>) => {
    const id = Math.random().toString(36).substring(2, 9);
    setToasts((prev) => [...prev, { ...props, id, onClose: removeToast }]);
  };

  const contextValue: ToastContextValue = {
    show: addToast,
    success: (message, title) => addToast({ message, title, variant: 'success' }),
    error: (message, title) => addToast({ message, title, variant: 'error' }),
    warning: (message, title) => addToast({ message, title, variant: 'warning' }),
    info: (message, title) => addToast({ message, title, variant: 'info' }),
  };

  return (
    <ToastContext.Provider value={contextValue}>
      {children}
      {toasts.map((toast) => (
        <Toast key={toast.id} {...toast} />
      ))}
    </ToastContext.Provider>
  );
}

export function useToast() {
  const context = useContext(ToastContext);
  if (!context) {
    throw new Error('useToast must be used within a ToastProvider');
  }
  return context;
}
