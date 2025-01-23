'use client';

import { forwardRef } from 'react';
import * as SeparatorPrimitive from '@radix-ui/react-separator';
import { cn } from '@/lib/utils';

export interface SeparatorProps {
  orientation?: 'horizontal' | 'vertical';
  decorative?: boolean;
  className?: string;
}

export const Separator = forwardRef<HTMLDivElement, SeparatorProps>(
  ({ orientation = 'horizontal', decorative = true, className }, ref) => {
    return (
      <SeparatorPrimitive.Root
        ref={ref}
        decorative={decorative}
        orientation={orientation}
        className={cn(
          'shrink-0 bg-dark-border',
          orientation === 'horizontal' ? 'h-px w-full' : 'h-full w-px',
          className
        )}
      />
    );
  }
);
Separator.displayName = 'Separator';

export interface SeparatorWithTextProps extends SeparatorProps {
  children: React.ReactNode;
  align?: 'start' | 'center' | 'end';
}

export function SeparatorWithText({
  children,
  orientation = 'horizontal',
  decorative = true,
  align = 'center',
  className,
}: SeparatorWithTextProps) {
  if (orientation === 'vertical') {
    return <Separator orientation="vertical" decorative={decorative} className={className} />;
  }

  const alignmentClasses = {
    start: 'justify-start',
    center: 'justify-center',
    end: 'justify-end',
  };

  return (
    <div className={cn('flex items-center', alignmentClasses[align])}>
      <span className="shrink-0 text-sm text-dark-text-secondary">
        {children}
      </span>
      <Separator
        orientation="horizontal"
        decorative={decorative}
        className={cn('mx-4 flex-1', className)}
      />
    </div>
  );
}

export interface SeparatorWithLabelProps extends SeparatorProps {
  label: string;
  labelPosition?: 'start' | 'center' | 'end';
}

export function SeparatorWithLabel({
  label,
  orientation = 'horizontal',
  decorative = true,
  labelPosition = 'center',
  className,
}: SeparatorWithLabelProps) {
  if (orientation === 'vertical') {
    return <Separator orientation="vertical" decorative={decorative} className={className} />;
  }

  const containerClasses = {
    start: 'flex-row',
    center: 'flex-row space-x-4',
    end: 'flex-row-reverse',
  };

  return (
    <div className="flex items-center">
      <div className={cn('flex w-full items-center', containerClasses[labelPosition])}>
        {labelPosition === 'start' && (
          <span className="mr-4 shrink-0 text-sm text-dark-text-secondary">
            {label}
          </span>
        )}
        <Separator
          orientation="horizontal"
          decorative={decorative}
          className={cn('flex-1', className)}
        />
        {labelPosition === 'center' && (
          <span className="shrink-0 text-sm text-dark-text-secondary">
            {label}
          </span>
        )}
        {labelPosition === 'end' && (
          <span className="ml-4 shrink-0 text-sm text-dark-text-secondary">
            {label}
          </span>
        )}
      </div>
    </div>
  );
}
