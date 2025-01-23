'use client';

import { forwardRef } from 'react';
import { cn } from '@/lib/utils';

export interface TimelineProps {
  children: React.ReactNode;
  className?: string;
  align?: 'start' | 'center' | 'end';
}

export const Timeline = forwardRef<HTMLDivElement, TimelineProps>(
  ({ children, className, align = 'start' }, ref) => {
    return (
      <div
        ref={ref}
        className={cn(
          'relative space-y-8',
          align === 'center' && 'before:left-1/2 before:-ml-px',
          align === 'start' && 'before:left-2',
          align === 'end' && 'before:right-2',
          'before:absolute before:top-0 before:h-full before:w-0.5 before:bg-dark-border',
          className
        )}
      >
        {children}
      </div>
    );
  }
);
Timeline.displayName = 'Timeline';

export interface TimelineItemProps {
  children: React.ReactNode;
  className?: string;
  icon?: React.ComponentType<{ className?: string }>;
  iconClassName?: string;
  align?: 'start' | 'center' | 'end';
  active?: boolean;
  disabled?: boolean;
}

export const TimelineItem = forwardRef<HTMLDivElement, TimelineItemProps>(
  ({
    children,
    className,
    icon: Icon,
    iconClassName,
    align = 'start',
    active = false,
    disabled = false,
  }, ref) => {
    return (
      <div
        ref={ref}
        className={cn(
          'relative',
          align === 'center' && 'left-1/2',
          align === 'start' && 'pl-8',
          align === 'end' && 'pr-8 text-right',
          disabled && 'opacity-50',
          className
        )}
      >
        <div
          className={cn(
            'absolute top-0 -mt-1 flex h-6 w-6 items-center justify-center rounded-full border border-dark-border bg-dark-secondary',
            align === 'center' && '-ml-3',
            align === 'start' && '-left-3',
            align === 'end' && '-right-3',
            active && 'border-accent-primary bg-accent-primary/10',
            iconClassName
          )}
        >
          {Icon && (
            <Icon
              className={cn(
                'h-3 w-3 text-dark-text-secondary',
                active && 'text-accent-primary'
              )}
            />
          )}
        </div>
        {children}
      </div>
    );
  }
);
TimelineItem.displayName = 'TimelineItem';

export interface TimelineContentProps {
  children: React.ReactNode;
  className?: string;
}

export const TimelineContent = forwardRef<HTMLDivElement, TimelineContentProps>(
  ({ children, className }, ref) => {
    return (
      <div
        ref={ref}
        className={cn(
          'rounded-lg border border-dark-border bg-dark-secondary p-4',
          className
        )}
      >
        {children}
      </div>
    );
  }
);
TimelineContent.displayName = 'TimelineContent';

export interface TimelineTitleProps {
  children: React.ReactNode;
  className?: string;
}

export const TimelineTitle = forwardRef<HTMLHeadingElement, TimelineTitleProps>(
  ({ children, className }, ref) => {
    return (
      <h3
        ref={ref}
        className={cn(
          'mb-1 text-lg font-semibold text-dark-text-primary',
          className
        )}
      >
        {children}
      </h3>
    );
  }
);
TimelineTitle.displayName = 'TimelineTitle';

export interface TimelineDescriptionProps {
  children: React.ReactNode;
  className?: string;
}

export const TimelineDescription = forwardRef<HTMLParagraphElement, TimelineDescriptionProps>(
  ({ children, className }, ref) => {
    return (
      <p
        ref={ref}
        className={cn('text-sm text-dark-text-secondary', className)}
      >
        {children}
      </p>
    );
  }
);
TimelineDescription.displayName = 'TimelineDescription';

export interface TimelineTimeProps {
  children: React.ReactNode;
  className?: string;
}

export const TimelineTime = forwardRef<HTMLTimeElement, TimelineTimeProps>(
  ({ children, className }, ref) => {
    return (
      <time
        ref={ref}
        className={cn('text-xs text-dark-text-secondary', className)}
      >
        {children}
      </time>
    );
  }
);
TimelineTime.displayName = 'TimelineTime';
