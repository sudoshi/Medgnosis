'use client';

import { HTMLAttributes, LabelHTMLAttributes, forwardRef } from 'react';
import { cn } from '@/lib/utils';

export interface FormLabelProps extends LabelHTMLAttributes<HTMLLabelElement> {
  required?: boolean;
}

export const FormLabel = forwardRef<HTMLLabelElement, FormLabelProps>(
  ({ className, children, required, ...props }, ref) => {
    return (
      <label
        ref={ref}
        className={cn(
          'text-sm font-medium leading-none text-dark-text-primary peer-disabled:cursor-not-allowed peer-disabled:opacity-70',
          className
        )}
        {...props}
      >
        {children}
        {required && <span className="ml-1 text-accent-error">*</span>}
      </label>
    );
  }
);
FormLabel.displayName = 'FormLabel';

export interface FormDescriptionProps extends HTMLAttributes<HTMLParagraphElement> {}

export function FormDescription({
  className,
  children,
  ...props
}: FormDescriptionProps) {
  return (
    <p
      className={cn('text-sm text-dark-text-secondary', className)}
      {...props}
    >
      {children}
    </p>
  );
}

export interface FormMessageProps extends HTMLAttributes<HTMLParagraphElement> {
  variant?: 'default' | 'error' | 'success' | 'warning';
}

export function FormMessage({
  className,
  children,
  variant = 'default',
  ...props
}: FormMessageProps) {
  if (!children) return null;

  const variants = {
    default: 'text-dark-text-secondary',
    error: 'text-accent-error',
    success: 'text-accent-success',
    warning: 'text-accent-warning',
  };

  return (
    <p
      className={cn('text-sm font-medium', variants[variant], className)}
      {...props}
    >
      {children}
    </p>
  );
}

export interface FormFieldProps extends HTMLAttributes<HTMLDivElement> {
  label?: string;
  description?: string;
  message?: string;
  messageVariant?: FormMessageProps['variant'];
  required?: boolean;
}

export function FormField({
  className,
  children,
  label,
  description,
  message,
  messageVariant,
  required,
  ...props
}: FormFieldProps) {
  return (
    <div className={cn('space-y-2', className)} {...props}>
      {label && <FormLabel required={required}>{label}</FormLabel>}
      {children}
      {description && <FormDescription>{description}</FormDescription>}
      {message && (
        <FormMessage variant={messageVariant}>{message}</FormMessage>
      )}
    </div>
  );
}

export interface FormSectionProps extends HTMLAttributes<HTMLDivElement> {
  title?: string;
  description?: string;
}

export function FormSection({
  className,
  children,
  title,
  description,
  ...props
}: FormSectionProps) {
  return (
    <div
      className={cn('space-y-6 rounded-lg border border-dark-border p-6', className)}
      {...props}
    >
      {(title || description) && (
        <div className="space-y-1">
          {title && (
            <h3 className="text-lg font-medium text-dark-text-primary">
              {title}
            </h3>
          )}
          {description && (
            <p className="text-sm text-dark-text-secondary">{description}</p>
          )}
        </div>
      )}
      <div className="space-y-4">{children}</div>
    </div>
  );
}

export interface FormFooterProps extends HTMLAttributes<HTMLDivElement> {}

export function FormFooter({
  className,
  children,
  ...props
}: FormFooterProps) {
  return (
    <div
      className={cn(
        'flex flex-col-reverse sm:flex-row sm:justify-end sm:space-x-2',
        className
      )}
      {...props}
    >
      {children}
    </div>
  );
}
