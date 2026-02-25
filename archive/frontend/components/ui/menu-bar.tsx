'use client';

import { ChevronRightIcon } from '@heroicons/react/24/outline';
import * as MenubarPrimitive from '@radix-ui/react-menubar';
import { forwardRef } from 'react';

import { cn } from '@/lib/utils';

export interface MenuBarProps {
  children: React.ReactNode;
  className?: string;
}

export const MenuBar = forwardRef<HTMLDivElement, MenuBarProps>(
  ({ children, className }, ref) => {
    return (
      <MenubarPrimitive.Root
        ref={ref}
        className={cn(
          'flex h-10 items-center space-x-1 rounded-md border border-dark-border bg-dark-secondary p-1',
          className
        )}
      >
        {children}
      </MenubarPrimitive.Root>
    );
  }
);
MenuBar.displayName = 'MenuBar';

export interface MenuBarTriggerProps {
  children: React.ReactNode;
  className?: string;
  disabled?: boolean;
}

export const MenuBarTrigger = forwardRef<HTMLButtonElement, MenuBarTriggerProps>(
  ({ children, className, disabled }, ref) => {
    return (
      <MenubarPrimitive.Trigger
        ref={ref}
        disabled={disabled}
        className={cn(
          'flex cursor-default select-none items-center rounded-sm px-3 py-1.5 text-sm font-medium outline-none',
          'focus:bg-dark-border focus:text-dark-text-primary',
          'data-[state=open]:bg-dark-border data-[state=open]:text-dark-text-primary',
          disabled && 'cursor-not-allowed opacity-50',
          className
        )}
      >
        {children}
      </MenubarPrimitive.Trigger>
    );
  }
);
MenuBarTrigger.displayName = 'MenuBarTrigger';

export interface MenuBarContentProps {
  children: React.ReactNode;
  className?: string;
  align?: 'start' | 'center' | 'end';
  alignOffset?: number;
  sideOffset?: number;
}

export const MenuBarContent = forwardRef<HTMLDivElement, MenuBarContentProps>(
  ({ children, className, align = 'start', alignOffset = -4, sideOffset = 8 }, ref) => {
    return (
      <MenubarPrimitive.Portal>
        <MenubarPrimitive.Content
          ref={ref}
          align={align}
          alignOffset={alignOffset}
          sideOffset={sideOffset}
          className={cn(
            'z-50 min-w-[12rem] overflow-hidden rounded-md border border-dark-border bg-dark-secondary p-1 shadow-md',
            'data-[state=open]:animate-in data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95',
            'data-[side=bottom]:slide-in-from-top-2 data-[side=left]:slide-in-from-right-2 data-[side=right]:slide-in-from-left-2 data-[side=top]:slide-in-from-bottom-2',
            className
          )}
        >
          {children}
        </MenubarPrimitive.Content>
      </MenubarPrimitive.Portal>
    );
  }
);
MenuBarContent.displayName = 'MenuBarContent';

export interface MenuBarItemProps {
  children: React.ReactNode;
  className?: string;
  inset?: boolean;
  disabled?: boolean;
  onSelect?: () => void;
}

export const MenuBarItem = forwardRef<HTMLDivElement, MenuBarItemProps>(
  ({ children, className, inset, disabled, onSelect }, ref) => {
    return (
      <MenubarPrimitive.Item
        ref={ref}
        className={cn(
          'relative flex cursor-default select-none items-center rounded-sm px-2 py-1.5 text-sm outline-none',
          'focus:bg-dark-border focus:text-dark-text-primary',
          'data-[disabled]:cursor-not-allowed data-[disabled]:opacity-50',
          inset && 'pl-8',
          className
        )}
        disabled={disabled}
        onSelect={onSelect}
      >
        {children}
      </MenubarPrimitive.Item>
    );
  }
);
MenuBarItem.displayName = 'MenuBarItem';

export interface MenuBarCheckboxItemProps extends MenuBarItemProps {
  checked?: boolean;
  onCheckedChange?: (checked: boolean) => void;
}

export const MenuBarCheckboxItem = forwardRef<HTMLDivElement, MenuBarCheckboxItemProps>(
  ({ children, className, checked, onCheckedChange, disabled, ...props }, ref) => {
    return (
      <MenubarPrimitive.CheckboxItem
        ref={ref}
        className={cn(
          'relative flex cursor-default select-none items-center rounded-sm py-1.5 pl-8 pr-2 text-sm outline-none',
          'focus:bg-dark-border focus:text-dark-text-primary',
          'data-[disabled]:cursor-not-allowed data-[disabled]:opacity-50',
          className
        )}
        checked={checked}
        onCheckedChange={onCheckedChange}
        disabled={disabled}
        {...props}
      >
        <span className="absolute left-2 flex h-4 w-4 items-center justify-center">
          <MenubarPrimitive.ItemIndicator>
            <svg
              className="h-4 w-4"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M5 13l4 4L19 7"
              />
            </svg>
          </MenubarPrimitive.ItemIndicator>
        </span>
        {children}
      </MenubarPrimitive.CheckboxItem>
    );
  }
);
MenuBarCheckboxItem.displayName = 'MenuBarCheckboxItem';

export interface MenuBarRadioGroupProps {
  value?: string;
  onValueChange?: (value: string) => void;
  children: React.ReactNode;
  className?: string;
}

export const MenuBarRadioGroup = forwardRef<HTMLDivElement, MenuBarRadioGroupProps>(
  ({ value, onValueChange, children, className }, ref) => {
    return (
      <MenubarPrimitive.RadioGroup
        ref={ref}
        value={value}
        onValueChange={onValueChange}
        className={className}
      >
        {children}
      </MenubarPrimitive.RadioGroup>
    );
  }
);
MenuBarRadioGroup.displayName = 'MenuBarRadioGroup';

export interface MenuBarRadioItemProps extends MenuBarItemProps {
  value: string;
}

export const MenuBarRadioItem = forwardRef<HTMLDivElement, MenuBarRadioItemProps>(
  ({ children, className, value, disabled, ...props }, ref) => {
    return (
      <MenubarPrimitive.RadioItem
        ref={ref}
        value={value}
        className={cn(
          'relative flex cursor-default select-none items-center rounded-sm py-1.5 pl-8 pr-2 text-sm outline-none',
          'focus:bg-dark-border focus:text-dark-text-primary',
          'data-[disabled]:cursor-not-allowed data-[disabled]:opacity-50',
          className
        )}
        disabled={disabled}
        {...props}
      >
        <span className="absolute left-2 flex h-4 w-4 items-center justify-center">
          <MenubarPrimitive.ItemIndicator>
            <svg
              className="h-2 w-2 fill-current"
              viewBox="0 0 2 2"
            >
              <circle cx="1" cy="1" r="1" />
            </svg>
          </MenubarPrimitive.ItemIndicator>
        </span>
        {children}
      </MenubarPrimitive.RadioItem>
    );
  }
);
MenuBarRadioItem.displayName = 'MenuBarRadioItem';

export interface MenuBarSubProps {
  children: React.ReactNode;
}

export const MenuBarSub = ({ children }: MenuBarSubProps) => {
  return (
    <MenubarPrimitive.Sub>
      {children}
    </MenubarPrimitive.Sub>
  );
};
MenuBarSub.displayName = 'MenuBarSub';

export interface MenuBarSubTriggerProps {
  children: React.ReactNode;
  className?: string;
  inset?: boolean;
  disabled?: boolean;
}

export const MenuBarSubTrigger = forwardRef<HTMLDivElement, MenuBarSubTriggerProps>(
  ({ children, className, inset, disabled }, ref) => {
    return (
      <MenubarPrimitive.SubTrigger
        ref={ref}
        className={cn(
          'flex cursor-default select-none items-center rounded-sm px-2 py-1.5 text-sm outline-none',
          'focus:bg-dark-border focus:text-dark-text-primary',
          'data-[state=open]:bg-dark-border data-[state=open]:text-dark-text-primary',
          'data-[disabled]:cursor-not-allowed data-[disabled]:opacity-50',
          inset && 'pl-8',
          className
        )}
        disabled={disabled}
      >
        {children}
        <ChevronRightIcon className="ml-auto h-4 w-4" />
      </MenubarPrimitive.SubTrigger>
    );
  }
);
MenuBarSubTrigger.displayName = 'MenuBarSubTrigger';

export interface MenuBarSubContentProps {
  children: React.ReactNode;
  className?: string;
  alignOffset?: number;
  sideOffset?: number;
}

export const MenuBarSubContent = forwardRef<HTMLDivElement, MenuBarSubContentProps>(
  ({ children, className, alignOffset = -4, sideOffset = 8 }, ref) => {
    return (
      <MenubarPrimitive.Portal>
        <MenubarPrimitive.SubContent
          ref={ref}
          alignOffset={alignOffset}
          sideOffset={sideOffset}
          className={cn(
            'z-50 min-w-[8rem] overflow-hidden rounded-md border border-dark-border bg-dark-secondary p-1 shadow-md',
            'data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95',
            'data-[side=bottom]:slide-in-from-top-2 data-[side=left]:slide-in-from-right-2 data-[side=right]:slide-in-from-left-2 data-[side=top]:slide-in-from-bottom-2',
            className
          )}
        >
          {children}
        </MenubarPrimitive.SubContent>
      </MenubarPrimitive.Portal>
    );
  }
);
MenuBarSubContent.displayName = 'MenuBarSubContent';

export interface MenuBarSeparatorProps {
  className?: string;
}

export const MenuBarSeparator = forwardRef<HTMLDivElement, MenuBarSeparatorProps>(
  ({ className }, ref) => {
    return (
      <MenubarPrimitive.Separator
        ref={ref}
        className={cn('-mx-1 my-1 h-px bg-dark-border', className)}
      />
    );
  }
);
MenuBarSeparator.displayName = 'MenuBarSeparator';

export interface MenuBarLabelProps {
  children: React.ReactNode;
  className?: string;
  inset?: boolean;
}

export const MenuBarLabel = forwardRef<HTMLDivElement, MenuBarLabelProps>(
  ({ children, className, inset }, ref) => {
    return (
      <MenubarPrimitive.Label
        ref={ref}
        className={cn(
          'px-2 py-1.5 text-sm font-semibold text-dark-text-primary',
          inset && 'pl-8',
          className
        )}
      >
        {children}
      </MenubarPrimitive.Label>
    );
  }
);
MenuBarLabel.displayName = 'MenuBarLabel';

export interface MenuBarShortcutProps {
  children: React.ReactNode;
  className?: string;
}

export function MenuBarShortcut({
  children,
  className,
}: MenuBarShortcutProps) {
  return (
    <span
      className={cn(
        'ml-auto text-xs tracking-widest text-dark-text-secondary',
        className
      )}
    >
      {children}
    </span>
  );
}
MenuBarShortcut.displayName = 'MenuBarShortcut';
