'use client';

import { Dialog as HeadlessDialog, Transition } from '@headlessui/react';
import { XMarkIcon } from '@heroicons/react/24/outline';
import { Fragment, type ReactNode } from 'react';

import { cn } from '@/lib/utils';

export interface DialogProps {
  open: boolean;
  onClose: () => void;
  title?: React.ReactNode;
  description?: React.ReactNode;
  children: ReactNode;
  className?: string;
  showClose?: boolean;
  size?: 'sm' | 'md' | 'lg' | 'xl' | 'full';
}

const sizes = {
  sm: 'max-w-sm',
  md: 'max-w-md',
  lg: 'max-w-lg',
  xl: 'max-w-xl',
  full: 'max-w-[90vw]',
};

export function Dialog({
  open,
  onClose,
  title,
  description,
  children,
  className,
  showClose = true,
  size = 'md',
}: DialogProps) {
  return (
    <Transition appear show={open} as={Fragment}>
      <HeadlessDialog
        as="div"
        className="relative z-50"
        onClose={onClose}
      >
        <Transition.Child
          as={Fragment}
          enter="ease-out duration-300"
          enterFrom="opacity-0"
          enterTo="opacity-100"
          leave="ease-in duration-200"
          leaveFrom="opacity-100"
          leaveTo="opacity-0"
        >
          <div className="fixed inset-0 bg-black/50" />
        </Transition.Child>

        <div className="fixed inset-0 overflow-y-auto">
          <div className="flex min-h-full items-center justify-center p-4 text-center">
            <Transition.Child
              as={Fragment}
              enter="ease-out duration-300"
              enterFrom="opacity-0 scale-95"
              enterTo="opacity-100 scale-100"
              leave="ease-in duration-200"
              leaveFrom="opacity-100 scale-100"
              leaveTo="opacity-0 scale-95"
            >
              <HeadlessDialog.Panel
                className={cn(
                  'w-full transform overflow-hidden rounded-lg bg-dark-secondary p-6 text-left align-middle shadow-xl transition-all',
                  sizes[size],
                  className
                )}
              >
                {showClose && (
                  <button
                    onClick={onClose}
                    className="absolute right-4 top-4 rounded-sm opacity-70 ring-offset-background transition-opacity hover:opacity-100 focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2"
                  >
                    <XMarkIcon className="h-4 w-4 text-dark-text-secondary" />
                    <span className="sr-only">Close</span>
                  </button>
                )}

                {(title || description) && (
                  <div className={cn('mb-6', showClose && 'pr-6')}>
                    {title && (
                      <HeadlessDialog.Title
                        as="h3"
                        className="text-lg font-medium leading-6 text-dark-text-primary"
                      >
                        {title}
                      </HeadlessDialog.Title>
                    )}
                    {description && (
                      <HeadlessDialog.Description className="mt-2 text-sm text-dark-text-secondary">
                        {description}
                      </HeadlessDialog.Description>
                    )}
                  </div>
                )}

                <div>{children}</div>
              </HeadlessDialog.Panel>
            </Transition.Child>
          </div>
        </div>
      </HeadlessDialog>
    </Transition>
  );
}

export interface DialogFooterProps {
  className?: string;
  children: ReactNode;
}

export function DialogFooter({ className, children }: DialogFooterProps) {
  return (
    <div
      className={cn(
        'mt-6 flex flex-col-reverse sm:flex-row sm:justify-end sm:space-x-2',
        className
      )}
    >
      {children}
    </div>
  );
}
