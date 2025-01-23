'use client';

import { Fragment, type ReactNode } from 'react';
import { Dialog, Transition } from '@headlessui/react';
import { XMarkIcon } from '@heroicons/react/24/outline';
import { cn } from '@/lib/utils';

export interface DrawerProps {
  open: boolean;
  onClose: () => void;
  title?: React.ReactNode;
  description?: React.ReactNode;
  children: ReactNode;
  footer?: ReactNode;
  showClose?: boolean;
  className?: string;
  position?: 'left' | 'right';
  size?: 'sm' | 'md' | 'lg' | 'xl' | 'full';
}

const sizes = {
  sm: 'max-w-sm',
  md: 'max-w-md',
  lg: 'max-w-lg',
  xl: 'max-w-xl',
  full: 'max-w-[90vw]',
};

export function Drawer({
  open,
  onClose,
  title,
  description,
  children,
  footer,
  showClose = true,
  className,
  position = 'right',
  size = 'md',
}: DrawerProps) {
  return (
    <Transition.Root show={open} as={Fragment}>
      <Dialog
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

        <div className="fixed inset-0 overflow-hidden">
          <div className="absolute inset-0 overflow-hidden">
            <div
              className={cn(
                'pointer-events-none fixed inset-y-0 flex max-w-full',
                position === 'left' ? 'left-0' : 'right-0'
              )}
            >
              <Transition.Child
                as={Fragment}
                enter="transform transition ease-in-out duration-300"
                enterFrom={
                  position === 'left'
                    ? '-translate-x-full'
                    : 'translate-x-full'
                }
                enterTo="translate-x-0"
                leave="transform transition ease-in-out duration-300"
                leaveFrom="translate-x-0"
                leaveTo={
                  position === 'left'
                    ? '-translate-x-full'
                    : 'translate-x-full'
                }
              >
                <Dialog.Panel
                  className={cn(
                    'pointer-events-auto w-screen',
                    sizes[size],
                    className
                  )}
                >
                  <div className="flex h-full flex-col bg-dark-secondary shadow-xl">
                    {/* Header */}
                    {(title || description) && (
                      <div className="border-b border-dark-border px-4 py-6 sm:px-6">
                        {showClose && (
                          <div className="absolute right-4 top-4">
                            <button
                              type="button"
                              className="rounded-md text-dark-text-secondary hover:text-dark-text-primary focus:outline-none focus:ring-2 focus:ring-accent-primary"
                              onClick={onClose}
                            >
                              <span className="sr-only">Close panel</span>
                              <XMarkIcon className="h-6 w-6" />
                            </button>
                          </div>
                        )}
                        <Dialog.Title className="text-lg font-medium text-dark-text-primary">
                          {title}
                        </Dialog.Title>
                        {description && (
                          <Dialog.Description className="mt-1 text-sm text-dark-text-secondary">
                            {description}
                          </Dialog.Description>
                        )}
                      </div>
                    )}

                    {/* Content */}
                    <div className="relative flex-1 overflow-y-auto px-4 py-6 sm:px-6">
                      {children}
                    </div>

                    {/* Footer */}
                    {footer && (
                      <div className="flex flex-shrink-0 justify-end border-t border-dark-border px-4 py-4 sm:px-6">
                        {footer}
                      </div>
                    )}
                  </div>
                </Dialog.Panel>
              </Transition.Child>
            </div>
          </div>
        </div>
      </Dialog>
    </Transition.Root>
  );
}

export interface DrawerFooterProps {
  className?: string;
  children: ReactNode;
}

export function DrawerFooter({
  className,
  children,
}: DrawerFooterProps) {
  return (
    <div
      className={cn(
        'flex flex-col-reverse gap-2 sm:flex-row sm:justify-end sm:space-x-2',
        className
      )}
    >
      {children}
    </div>
  );
}
