'use client';

import { ChevronDownIcon } from '@heroicons/react/24/outline';
import * as NavigationMenuPrimitive from '@radix-ui/react-navigation-menu';
import { forwardRef } from 'react';

import { cn } from '@/lib/utils';

export interface NavigationMenuProps {
  children: React.ReactNode;
  className?: string;
  viewportClassName?: string;
}

export const NavigationMenu = forwardRef<HTMLDivElement, NavigationMenuProps>(
  ({ children, className, viewportClassName }, ref) => {
    return (
      <NavigationMenuPrimitive.Root
        ref={ref}
        className={cn(
          'relative z-10 flex max-w-max flex-1 items-center justify-center',
          className
        )}
      >
        {children}
        <NavigationMenuViewport className={viewportClassName} />
      </NavigationMenuPrimitive.Root>
    );
  }
);
NavigationMenu.displayName = 'NavigationMenu';

export interface NavigationMenuListProps {
  children: React.ReactNode;
  className?: string;
}

export const NavigationMenuList = forwardRef<HTMLUListElement, NavigationMenuListProps>(
  ({ children, className }, ref) => {
    return (
      <NavigationMenuPrimitive.List
        ref={ref}
        className={cn(
          'group flex flex-1 list-none items-center justify-center space-x-1',
          className
        )}
      >
        {children}
      </NavigationMenuPrimitive.List>
    );
  }
);
NavigationMenuList.displayName = 'NavigationMenuList';

export interface NavigationMenuTriggerProps {
  children: React.ReactNode;
  className?: string;
}

export const NavigationMenuTrigger = forwardRef<HTMLButtonElement, NavigationMenuTriggerProps>(
  ({ children, className }, ref) => {
    return (
      <NavigationMenuPrimitive.Trigger
        ref={ref}
        className={cn(
          'group inline-flex h-10 w-max items-center justify-center rounded-md bg-dark-secondary px-4 py-2 text-sm font-medium transition-colors',
          'hover:bg-dark-border hover:text-dark-text-primary',
          'focus:bg-dark-border focus:text-dark-text-primary focus:outline-none',
          'disabled:pointer-events-none disabled:opacity-50',
          'data-[active]:bg-dark-border data-[state=open]:bg-dark-border',
          className
        )}
      >
        {children}
        <ChevronDownIcon
          className={cn(
            'relative top-[1px] ml-1 h-3 w-3 transition duration-200',
            'group-data-[state=open]:rotate-180'
          )}
          aria-hidden="true"
        />
      </NavigationMenuPrimitive.Trigger>
    );
  }
);
NavigationMenuTrigger.displayName = 'NavigationMenuTrigger';

export interface NavigationMenuContentProps {
  children: React.ReactNode;
  className?: string;
}

export const NavigationMenuContent = forwardRef<HTMLDivElement, NavigationMenuContentProps>(
  ({ children, className }, ref) => {
    return (
      <NavigationMenuPrimitive.Content
        ref={ref}
        className={cn(
          'left-0 top-0 w-full data-[motion^=from-]:animate-in data-[motion^=to-]:animate-out data-[motion^=from-]:fade-in data-[motion^=to-]:fade-out data-[motion=from-end]:slide-in-from-right-52 data-[motion=from-start]:slide-in-from-left-52 data-[motion=to-end]:slide-out-to-right-52 data-[motion=to-start]:slide-out-to-left-52 md:absolute md:w-auto',
          className
        )}
      >
        {children}
      </NavigationMenuPrimitive.Content>
    );
  }
);
NavigationMenuContent.displayName = 'NavigationMenuContent';

export interface NavigationMenuItemProps {
  children: React.ReactNode;
  className?: string;
}

export const NavigationMenuItem = forwardRef<HTMLLIElement, NavigationMenuItemProps>(
  ({ children, className }, ref) => {
    return (
      <NavigationMenuPrimitive.Item
        ref={ref}
        className={className}
      >
        {children}
      </NavigationMenuPrimitive.Item>
    );
  }
);
NavigationMenuItem.displayName = 'NavigationMenuItem';

export interface NavigationMenuLinkProps {
  children: React.ReactNode;
  href: string;
  className?: string;
  active?: boolean;
}

export const NavigationMenuLink = forwardRef<HTMLAnchorElement, NavigationMenuLinkProps>(
  ({ children, href, className, active }, ref) => {
    return (
      <NavigationMenuPrimitive.Link
        ref={ref}
        href={href}
        className={cn(
          'block select-none space-y-1 rounded-md p-3 leading-none no-underline outline-none transition-colors',
          'hover:bg-dark-border hover:text-dark-text-primary',
          'focus:bg-dark-border focus:text-dark-text-primary',
          active && 'bg-dark-border text-dark-text-primary',
          className
        )}
      >
        {children}
      </NavigationMenuPrimitive.Link>
    );
  }
);
NavigationMenuLink.displayName = 'NavigationMenuLink';

export interface NavigationMenuViewportProps {
  className?: string;
}

export const NavigationMenuViewport = forwardRef<HTMLDivElement, NavigationMenuViewportProps>(
  ({ className }, ref) => {
    return (
      <div className={cn('absolute left-0 top-full flex justify-center')}>
        <NavigationMenuPrimitive.Viewport
          ref={ref}
          className={cn(
            'origin-top-center relative mt-1.5 h-[var(--radix-navigation-menu-viewport-height)] w-full overflow-hidden rounded-md border border-dark-border bg-dark-secondary text-dark-text-primary shadow-lg data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-90 md:w-[var(--radix-navigation-menu-viewport-width)]',
            className
          )}
        />
      </div>
    );
  }
);
NavigationMenuViewport.displayName = 'NavigationMenuViewport';

export interface NavigationMenuIndicatorProps {
  className?: string;
}

export const NavigationMenuIndicator = forwardRef<HTMLDivElement, NavigationMenuIndicatorProps>(
  ({ className }, ref) => {
    return (
      <NavigationMenuPrimitive.Indicator
        ref={ref}
        className={cn(
          'top-full z-[1] flex h-1.5 items-end justify-center overflow-hidden data-[state=visible]:animate-in data-[state=hidden]:animate-out data-[state=hidden]:fade-out data-[state=visible]:fade-in',
          className
        )}
      >
        <div className="relative top-[60%] h-2 w-2 rotate-45 rounded-tl-sm bg-dark-border shadow-md" />
      </NavigationMenuPrimitive.Indicator>
    );
  }
);
NavigationMenuIndicator.displayName = 'NavigationMenuIndicator';
