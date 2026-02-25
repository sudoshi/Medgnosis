'use client';

import * as RadioGroupPrimitive from '@radix-ui/react-radio-group';
import { forwardRef } from 'react';

import { cn } from '@/lib/utils';

export interface RadioGroupProps {
  value?: string;
  defaultValue?: string;
  onValueChange?: (value: string) => void;
  disabled?: boolean;
  required?: boolean;
  name?: string;
  orientation?: 'horizontal' | 'vertical';
  label?: React.ReactNode;
  description?: string;
  error?: boolean;
  helperText?: string;
  className?: string;
  children: React.ReactNode;
}

export const RadioGroup = forwardRef<HTMLDivElement, RadioGroupProps>(
  ({
    value,
    defaultValue,
    onValueChange,
    disabled = false,
    required = false,
    name,
    orientation = 'vertical',
    label,
    description,
    error = false,
    helperText,
    className,
    children,
    ...props
  }, ref) => {
    return (
      <div className={cn('space-y-2', className)} ref={ref}>
        {label && (
          <div className="flex items-center justify-between">
            <label
              className={cn(
                'text-sm font-medium text-dark-text-primary',
                disabled && 'cursor-not-allowed opacity-50'
              )}
            >
              {label}
              {required && (
                <span className="ml-1 text-accent-error">*</span>
              )}
            </label>
          </div>
        )}
        {description && (
          <p className="text-sm text-dark-text-secondary">
            {description}
          </p>
        )}
        <RadioGroupPrimitive.Root
          value={value}
          defaultValue={defaultValue}
          onValueChange={onValueChange}
          disabled={disabled}
          required={required}
          name={name}
          orientation={orientation}
          className={cn(
            'space-y-2',
            orientation === 'horizontal' && 'flex space-x-6 space-y-0'
          )}
          {...props}
        >
          {children}
        </RadioGroupPrimitive.Root>
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
RadioGroup.displayName = 'RadioGroup';

export interface RadioGroupItemProps {
  value: string;
  disabled?: boolean;
  required?: boolean;
  label?: React.ReactNode;
  description?: string;
  className?: string;
}

export const RadioGroupItem = forwardRef<HTMLButtonElement, RadioGroupItemProps>(
  ({
    value,
    disabled = false,
    required = false,
    label,
    description,
    className,
    ...props
  }, ref) => {
    return (
      <div className={cn('flex items-start space-x-3', className)}>
        <RadioGroupPrimitive.Item
          ref={ref}
          value={value}
          disabled={disabled}
          required={required}
          className={cn(
            'h-4 w-4 rounded-full border border-dark-border text-accent-primary',
            'focus:outline-none focus:ring-2 focus:ring-accent-primary focus:ring-offset-2',
            'disabled:cursor-not-allowed disabled:opacity-50',
            'data-[state=checked]:bg-accent-primary data-[state=checked]:border-accent-primary'
          )}
          {...props}
        >
          <RadioGroupPrimitive.Indicator className="relative flex h-full w-full items-center justify-center after:block after:h-2 after:w-2 after:rounded-full after:bg-white" />
        </RadioGroupPrimitive.Item>
        {(label || description) && (
          <div className="space-y-1">
            {label && (
              <label
                className={cn(
                  'block text-sm font-medium text-dark-text-primary',
                  disabled && 'cursor-not-allowed opacity-50'
                )}
              >
                {label}
              </label>
            )}
            {description && (
              <p className="text-sm text-dark-text-secondary">
                {description}
              </p>
            )}
          </div>
        )}
      </div>
    );
  }
);
RadioGroupItem.displayName = 'RadioGroupItem';

export interface RadioGroupCardProps extends RadioGroupItemProps {
  icon?: React.ComponentType<{ className?: string }>;
}

export function RadioGroupCard({
  icon: Icon,
  label,
  description,
  className,
  ...props
}: RadioGroupCardProps) {
  return (
    <RadioGroupItem
      label={
        <div className="flex flex-col">
          {Icon && <Icon className="mb-3 h-6 w-6 text-dark-text-secondary" />}
          <span>{label}</span>
        </div>
      }
      description={description}
      className={cn(
        'w-full cursor-pointer rounded-lg border border-dark-border p-4',
        'hover:bg-dark-secondary/50',
        'data-[state=checked]:border-accent-primary data-[state=checked]:ring-1 data-[state=checked]:ring-accent-primary',
        className
      )}
      {...props}
    />
  );
}
