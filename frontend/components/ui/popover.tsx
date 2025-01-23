'use client';

import { Fragment, type ReactNode } from 'react';
import { Popover as HeadlessPopover, Transition } from '@headlessui/react';
import { cn } from '@/lib/utils';

export interface PopoverProps {
  trigger: ReactNode;
  children: ReactNode;
  className?: string;
  align?: 'start' | 'center' | 'end';
  side?: 'top' | 'right' | 'bottom' | 'left';
  sideOffset?: number;
}

export function Popover({
  trigger,
  children,
  className,
  align = 'center',
  side = 'bottom',
  sideOffset = 4,
}: PopoverProps) {
  const alignmentClasses = {
    start: 'origin-top-left left-0',
    center: 'origin-top left-1/2 -translate-x-1/2',
    end: 'origin-top-right right-0',
  };

  const sideClasses = {
    top: 'bottom-full mb-2',
    right: 'left-full ml-2',
    bottom: 'top-full mt-2',
    left: 'right-full mr-2',
  };

  return (
    <HeadlessPopover className="relative">
      {({ open }) => (
        <>
          <HeadlessPopover.Button as={Fragment}>{trigger}</HeadlessPopover.Button>
          <Transition
            show={open}
            as={Fragment}
            enter="transition ease-out duration-200"
            enterFrom="opacity-0 translate-y-1"
            enterTo="opacity-100 translate-y-0"
            leave="transition ease-in duration-150"
            leaveFrom="opacity-100 translate-y-0"
            leaveTo="opacity-0 translate-y-1"
          >
            <HeadlessPopover.Panel
              className={cn(
                'absolute z-50 w-screen max-w-sm rounded-lg bg-dark-secondary p-4 shadow-lg ring-1 ring-dark-border focus:outline-none',
                sideClasses[side],
                alignmentClasses[align],
                className
              )}
              style={{
                [side]: `${sideOffset}px`,
              }}
            >
              {children}
            </HeadlessPopover.Panel>
          </Transition>
        </>
      )}
    </HeadlessPopover>
  );
}

export interface PopoverCloseProps {
  children: ReactNode;
  className?: string;
}

export function PopoverClose({ children, className }: PopoverCloseProps) {
  return (
    <HeadlessPopover.Button as={Fragment}>
      <button className={className}>{children}</button>
    </HeadlessPopover.Button>
  );
}

export interface PopoverArrowProps {
  className?: string;
}

export function PopoverArrow({ className }: PopoverArrowProps) {
  return (
    <div
      className={cn(
        'absolute h-2 w-2 rotate-45 transform bg-dark-secondary',
        className
      )}
    />
  );
}

export interface PopoverHeaderProps {
  children: ReactNode;
  className?: string;
}

export function PopoverHeader({ children, className }: PopoverHeaderProps) {
  return (
    <div className={cn('mb-2 font-medium text-dark-text-primary', className)}>
      {children}
    </div>
  );
}

export interface PopoverFooterProps {
  children: ReactNode;
  className?: string;
}

export function PopoverFooter({ children, className }: PopoverFooterProps) {
  return (
    <div
      className={cn(
        'mt-4 flex items-center justify-end space-x-2',
        className
      )}
    >
      {children}
    </div>
  );
}
