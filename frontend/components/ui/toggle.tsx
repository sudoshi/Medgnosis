'use client';

import { forwardRef, InputHTMLAttributes } from 'react';
import { cn } from '@/lib/utils';

export interface ToggleProps extends InputHTMLAttributes<HTMLInputElement> {
  label?: string;
  description?: string;
  error?: boolean;
  helperText?: string;
}

const Toggle = forwardRef<HTMLInputElement, ToggleProps>(
  ({ className, label, description, error, helperText, ...props }, ref) => {
    return (
      <div className="flex flex-col space-y-1.5">
        <label className="relative inline-flex cursor-pointer items-start">
          <div className="flex items-center">
            <input
              type="checkbox"
              className="sr-only"
              ref={ref}
              {...props}
            />
            <div
              className={cn(
                'relative h-8 w-14 rounded-full transition-colors',
                props.checked ? 'bg-accent-primary' : 'bg-dark-border',
                error && 'border-accent-error',
                'after:absolute after:left-1 after:top-1',
                'after:h-6 after:w-6 after:rounded-full after:bg-white',
                'after:transition-transform after:content-[""]',
                props.checked && 'after:translate-x-6',
                props.disabled && 'opacity-50 cursor-not-allowed'
              )}
            />
          </div>
          {(label || description) && (
            <div className="ml-3 flex flex-col">
              {label && (
                <span className="text-sm font-medium text-dark-text-primary">
                  {label}
                </span>
              )}
              {description && (
                <span className="text-sm text-dark-text-secondary">
                  {description}
                </span>
              )}
            </div>
          )}
        </label>
        {helperText && (
          <p
            className={cn(
              'text-sm',
              error ? 'text-accent-error' : 'text-dark-text-secondary'
            )}
          >
            {helperText}
          </p>
        )}
      </div>
    );
  }
);

Toggle.displayName = 'Toggle';

export { Toggle };
