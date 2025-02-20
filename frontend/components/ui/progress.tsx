'use client';

import { forwardRef } from 'react';
import type { HTMLAttributes } from 'react';
import { cn } from '@/lib/utils';

export interface ProgressProps extends HTMLAttributes<HTMLDivElement> {
  value?: number;
  max?: number;
  variant?: 'default' | 'success' | 'warning' | 'error';
  size?: 'sm' | 'md' | 'lg';
  showValue?: boolean;
  formatValue?: (value: number) => string;
  indeterminate?: boolean;
}

const Progress = forwardRef<HTMLDivElement, ProgressProps>(
  ({
    className,
    value = 0,
    max = 100,
    variant = 'default',
    size = 'md',
    showValue = false,
    formatValue = (v) => `${Math.round((v / max) * 100)}%`,
    indeterminate = false,
    ...props
  }, ref) => {
    const percentage = Math.min(Math.max((value / max) * 100, 0), 100);

    const variants = {
      default: 'bg-accent-primary',
      success: 'bg-accent-success',
      warning: 'bg-accent-warning',
      error: 'bg-accent-error',
    };

    const sizes = {
      sm: 'h-1',
      md: 'h-2',
      lg: 'h-3',
    };

    return (
      <div
        ref={ref}
        className={cn('relative w-full overflow-hidden', className)}
        {...props}
      >
        <div
          className={cn(
            'w-full rounded-full bg-dark-border',
            sizes[size]
          )}
        >
          <div
            className={cn(
              'h-full rounded-full transition-all duration-300 ease-in-out',
              variants[variant],
              indeterminate && 'animate-progress-indeterminate w-1/3',
              !indeterminate && `w-[${percentage}%]`
            )}
            style={
              !indeterminate
                ? {
                    width: `${percentage}%`,
                    transition: 'width 0.3s ease-in-out',
                  }
                : undefined
            }
          />
        </div>
        {showValue && !indeterminate && (
          <div className="absolute inset-0 flex items-center justify-center">
            <span className="text-xs font-medium text-dark-text-primary">
              {formatValue(value)}
            </span>
          </div>
        )}
      </div>
    );
  }
);

Progress.displayName = 'Progress';

export { Progress };
