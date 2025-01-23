'use client';

import { forwardRef } from 'react';
import * as ToolbarPrimitive from '@radix-ui/react-toolbar';
import { cn } from '@/lib/utils';

export interface ToolbarProps {
  children: React.ReactNode;
  className?: string;
}

export const Toolbar = forwardRef<HTMLDivElement, ToolbarProps>(
  ({ children, className }, ref) => {
    return (
      <ToolbarPrimitive.Root
        ref={ref}
        className={cn(
          'flex h-10 items-center space-x-1 rounded-md border border-dark-border bg-dark-secondary p-1',
          className
        )}
      >
        {children}
      </ToolbarPrimitive.Root>
    );
  }
);
Toolbar.displayName = 'Toolbar';

export interface ToolbarButtonProps extends React.ComponentPropsWithoutRef<typeof ToolbarPrimitive.Button> {
  children: React.ReactNode;
  className?: string;
}

export const ToolbarButton = forwardRef<HTMLButtonElement, ToolbarButtonProps>(
  ({ children, className, ...props }, ref) => {
    return (
      <ToolbarPrimitive.Button
        ref={ref}
        {...props}
        className={cn(
          'inline-flex min-w-[2.5rem] items-center justify-center rounded-md px-3 py-1.5 text-sm font-medium',
          'focus:outline-none focus:ring-2 focus:ring-accent-primary focus:ring-offset-2',
          'disabled:pointer-events-none disabled:opacity-50',
          'data-[state=on]:bg-dark-border data-[state=on]:text-dark-text-primary',
          'hover:bg-dark-border hover:text-dark-text-primary',
          className
        )}
      >
        {children}
      </ToolbarPrimitive.Button>
    );
  }
);
ToolbarButton.displayName = 'ToolbarButton';

export interface ToolbarLinkProps extends React.ComponentPropsWithoutRef<typeof ToolbarPrimitive.Link> {
  children: React.ReactNode;
  href: string;
  className?: string;
}

export const ToolbarLink = forwardRef<HTMLAnchorElement, ToolbarLinkProps>(
  ({ children, href, className, ...props }, ref) => {
    return (
      <ToolbarPrimitive.Link
        ref={ref}
        {...props}
        href={href}
        className={cn(
          'inline-flex min-w-[2.5rem] items-center justify-center rounded-md px-3 py-1.5 text-sm font-medium',
          'focus:outline-none focus:ring-2 focus:ring-accent-primary focus:ring-offset-2',
          'disabled:pointer-events-none disabled:opacity-50',
          'hover:bg-dark-border hover:text-dark-text-primary',
          className
        )}
      >
        {children}
      </ToolbarPrimitive.Link>
    );
  }
);
ToolbarLink.displayName = 'ToolbarLink';

export interface ToolbarSeparatorProps {
  className?: string;
  orientation?: 'horizontal' | 'vertical';
}

export const ToolbarSeparator = forwardRef<HTMLDivElement, ToolbarSeparatorProps>(
  ({ className, orientation = 'vertical' }, ref) => {
    return (
      <ToolbarPrimitive.Separator
        ref={ref}
        className={cn(
          'bg-dark-border',
          orientation === 'horizontal' ? 'h-px w-full' : 'h-full w-px',
          className
        )}
      />
    );
  }
);
ToolbarSeparator.displayName = 'ToolbarSeparator';

export interface ToolbarToggleGroupSingleProps {
  children: React.ReactNode;
  type: 'single';
  value?: string;
  defaultValue?: string;
  onValueChange?: (value: string) => void;
  className?: string;
}

export interface ToolbarToggleGroupMultipleProps {
  children: React.ReactNode;
  type: 'multiple';
  value?: string[];
  defaultValue?: string[];
  onValueChange?: (value: string[]) => void;
  className?: string;
}

export type ToolbarToggleGroupProps = ToolbarToggleGroupSingleProps | ToolbarToggleGroupMultipleProps;

export const ToolbarToggleGroup = forwardRef<HTMLDivElement, ToolbarToggleGroupProps>((props, ref) => {
  const { children, className, type, value, defaultValue, onValueChange } = props;
    return type === 'single' ? (
      <ToolbarPrimitive.ToggleGroup
        ref={ref}
        type="single"
        value={value as string}
        defaultValue={defaultValue as string}
        onValueChange={onValueChange as (value: string) => void}
        className={cn('flex items-center space-x-1', className)}
      >
        {children}
      </ToolbarPrimitive.ToggleGroup>
    ) : (
      <ToolbarPrimitive.ToggleGroup
        ref={ref}
        type="multiple"
        value={value as string[]}
        defaultValue={defaultValue as string[]}
        onValueChange={onValueChange as (value: string[]) => void}
        className={cn('flex items-center space-x-1', className)}
      >
        {children}
      </ToolbarPrimitive.ToggleGroup>
    );
  }
);
ToolbarToggleGroup.displayName = 'ToolbarToggleGroup';

export interface ToolbarToggleItemProps extends React.ComponentPropsWithoutRef<typeof ToolbarPrimitive.ToggleItem> {
  children: React.ReactNode;
  className?: string;
}

export const ToolbarToggleItem = forwardRef<HTMLButtonElement, ToolbarToggleItemProps>(
  ({ children, className, ...props }, ref) => {
    return (
      <ToolbarPrimitive.ToggleItem
        ref={ref}
        {...props}
        className={cn(
          'inline-flex min-w-[2.5rem] items-center justify-center rounded-md px-3 py-1.5 text-sm font-medium',
          'focus:outline-none focus:ring-2 focus:ring-accent-primary focus:ring-offset-2',
          'disabled:pointer-events-none disabled:opacity-50',
          'data-[state=on]:bg-dark-border data-[state=on]:text-dark-text-primary',
          'hover:bg-dark-border hover:text-dark-text-primary',
          className
        )}
      >
        {children}
      </ToolbarPrimitive.ToggleItem>
    );
  }
);
ToolbarToggleItem.displayName = 'ToolbarToggleItem';
