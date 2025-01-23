'use client';

import { Fragment, type ReactNode } from 'react';
import { Menu, Transition } from '@headlessui/react';
import { cn } from '@/lib/utils';

export interface DropdownMenuProps {
  trigger: ReactNode;
  children: ReactNode;
  align?: 'left' | 'right';
  className?: string;
}

export function DropdownMenu({
  trigger,
  children,
  align = 'right',
  className,
}: DropdownMenuProps) {
  return (
    <Menu as="div" className="relative inline-block text-left">
      <Menu.Button as={Fragment}>{trigger}</Menu.Button>
      <Transition
        as={Fragment}
        enter="transition ease-out duration-100"
        enterFrom="transform opacity-0 scale-95"
        enterTo="transform opacity-100 scale-100"
        leave="transition ease-in duration-75"
        leaveFrom="transform opacity-100 scale-100"
        leaveTo="transform opacity-0 scale-95"
      >
        <Menu.Items
          className={cn(
            'absolute z-50 mt-2 w-56 rounded-md bg-dark-secondary shadow-lg ring-1 ring-black ring-opacity-5 focus:outline-none',
            align === 'left' ? 'origin-top-left left-0' : 'origin-top-right right-0',
            className
          )}
        >
          <div className="py-1">{children}</div>
        </Menu.Items>
      </Transition>
    </Menu>
  );
}

interface DropdownMenuItemProps {
  children: ReactNode;
  onClick?: () => void;
  disabled?: boolean;
  className?: string;
  destructive?: boolean;
}

export function DropdownMenuItem({
  children,
  onClick,
  disabled,
  className,
  destructive = false,
}: DropdownMenuItemProps) {
  return (
    <Menu.Item>
      {({ active }) => (
        <button
          onClick={onClick}
          className={cn(
            'flex w-full items-center px-4 py-2 text-sm',
            active ? 'bg-dark-border' : '',
            disabled ? 'cursor-not-allowed opacity-50' : '',
            destructive ? 'text-accent-error' : 'text-dark-text-primary',
            className
          )}
          disabled={disabled}
        >
          {children}
        </button>
      )}
    </Menu.Item>
  );
}

export function DropdownMenuSeparator() {
  return <div className="my-1 h-px bg-dark-border" />;
}

interface DropdownMenuLabelProps {
  children: ReactNode;
  className?: string;
}

export function DropdownMenuLabel({ children, className }: DropdownMenuLabelProps) {
  return (
    <span
      className={cn(
        'block px-4 py-2 text-xs font-medium text-dark-text-secondary',
        className
      )}
    >
      {children}
    </span>
  );
}

interface DropdownMenuGroupProps {
  children: ReactNode;
  className?: string;
}

export function DropdownMenuGroup({ children, className }: DropdownMenuGroupProps) {
  return <div className={cn('py-1', className)}>{children}</div>;
}
