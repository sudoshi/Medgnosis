'use client';

import { Popover, Transition } from '@headlessui/react';
import { Fragment, type ReactNode } from 'react';

import { cn } from '@/lib/utils';

export interface HoverCardProps {
  trigger: ReactNode;
  children: ReactNode;
  className?: string;
  align?: 'start' | 'center' | 'end';
  side?: 'top' | 'right' | 'bottom' | 'left';
  sideOffset?: number;
  openDelay?: number;
  closeDelay?: number;
}

export function HoverCard({
  trigger,
  children,
  className,
  align = 'center',
  side = 'bottom',
  sideOffset = 4,
  openDelay = 200,
  closeDelay = 150,
}: HoverCardProps) {
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

  let openTimeout: NodeJS.Timeout;
  let closeTimeout: NodeJS.Timeout;

  const handleMouseEnter = (open: boolean, openPopover: () => void) => {
    if (!open) {
      clearTimeout(closeTimeout);
      openTimeout = setTimeout(() => {
        openPopover();
      }, openDelay);
    }
  };

  const handleMouseLeave = (open: boolean, closePopover: () => void) => {
    if (open) {
      clearTimeout(openTimeout);
      closeTimeout = setTimeout(() => {
        closePopover();
      }, closeDelay);
    }
  };

  return (
    <Popover className="relative">
      {({ open, close }) => (
        <>
          <div
            onMouseEnter={() => handleMouseEnter(open, () => close())}
            onMouseLeave={() => handleMouseLeave(open, () => close())}
          >
            <Popover.Button as={Fragment}>{trigger}</Popover.Button>
            <Transition
              as={Fragment}
              enter="transition ease-out duration-200"
              enterFrom="opacity-0 translate-y-1"
              enterTo="opacity-100 translate-y-0"
              leave="transition ease-in duration-150"
              leaveFrom="opacity-100 translate-y-0"
              leaveTo="opacity-0 translate-y-1"
            >
              <Popover.Panel
                className={cn(
                  'absolute z-50 w-screen max-w-sm rounded-lg bg-dark-secondary p-4 shadow-lg ring-1 ring-dark-border focus:outline-none',
                  sideClasses[side],
                  alignmentClasses[align],
                  className
                )}
                style={{
                  [side]: `${sideOffset}px`,
                }}
                onMouseEnter={() => handleMouseEnter(open, () => close())}
                onMouseLeave={() => handleMouseLeave(open, () => close())}
              >
                {children}
              </Popover.Panel>
            </Transition>
          </div>
        </>
      )}
    </Popover>
  );
}

export interface HoverCardHeaderProps {
  children: ReactNode;
  className?: string;
}

export function HoverCardHeader({
  children,
  className,
}: HoverCardHeaderProps) {
  return (
    <div className={cn('mb-2 font-medium text-dark-text-primary', className)}>
      {children}
    </div>
  );
}

export interface HoverCardFooterProps {
  children: ReactNode;
  className?: string;
}

export function HoverCardFooter({
  children,
  className,
}: HoverCardFooterProps) {
  return (
    <div
      className={cn(
        'mt-4 flex items-center justify-end border-t border-dark-border pt-4',
        className
      )}
    >
      {children}
    </div>
  );
}
