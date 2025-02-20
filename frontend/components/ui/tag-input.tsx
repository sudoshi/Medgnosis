'use client';

import { forwardRef, useState, useCallback } from 'react';
import type { KeyboardEvent } from 'react';
import { XMarkIcon } from '@heroicons/react/24/outline';
import { cn } from '@/lib/utils';

export interface TagInputProps extends Omit<React.InputHTMLAttributes<HTMLInputElement>, 'value' | 'onChange'> {
  value: string[];
  onChange: (value: string[]) => void;
  className?: string;
  tagClassName?: string;
  placeholder?: string;
  maxTags?: number;
  validateTag?: (tag: string) => boolean;
  formatTag?: (tag: string) => string;
  onTagAdd?: (tag: string) => void;
  onTagRemove?: (tag: string) => void;
}

export const TagInput = forwardRef<HTMLInputElement, TagInputProps>(
  ({
    value,
    onChange,
    className,
    tagClassName,
    placeholder = 'Add tags...',
    maxTags,
    validateTag = (tag) => tag.length > 0,
    formatTag = (tag) => tag.trim(),
    onTagAdd,
    onTagRemove,
    disabled,
    ...props
  }, ref) => {
    const [inputValue, setInputValue] = useState('');

    const addTag = useCallback((tag: string) => {
      const formattedTag = formatTag(tag);
      if (
        validateTag(formattedTag) &&
        !value.includes(formattedTag) &&
        (!maxTags || value.length < maxTags)
      ) {
        const newTags = [...value, formattedTag];
        onChange(newTags);
        onTagAdd?.(formattedTag);
        return true;
      }
      return false;
    }, [formatTag, maxTags, onChange, onTagAdd, validateTag, value]);

    const removeTag = useCallback((tagToRemove: string) => {
      const newTags = value.filter(tag => tag !== tagToRemove);
      onChange(newTags);
      onTagRemove?.(tagToRemove);
    }, [onChange, onTagRemove, value]);

    const handleKeyDown = useCallback((e: KeyboardEvent<HTMLInputElement>) => {
      if (e.key === 'Enter' || e.key === ',') {
        e.preventDefault();
        const success = addTag(inputValue);
        if (success) {
          setInputValue('');
        }
      } else if (e.key === 'Backspace' && !inputValue && value.length > 0) {
        removeTag(value[value.length - 1]);
      }
    }, [addTag, inputValue, removeTag, value]);

    const handleBlur = useCallback(() => {
      if (inputValue) {
        const success = addTag(inputValue);
        if (success) {
          setInputValue('');
        }
      }
    }, [addTag, inputValue]);

    return (
      <div
        className={cn(
          'flex min-h-[2.5rem] w-full flex-wrap items-center gap-1.5 rounded-md border border-dark-border bg-dark-secondary px-3 py-1.5 focus-within:ring-2 focus-within:ring-accent-primary focus-within:ring-offset-2',
          disabled && 'cursor-not-allowed opacity-50',
          className
        )}
      >
        {value.map((tag, index) => (
          <span
            key={index}
            className={cn(
              'inline-flex items-center rounded-md bg-dark-border px-2 py-1 text-sm',
              'hover:bg-dark-border/80',
              tagClassName
            )}
          >
            {tag}
            {!disabled && (
              <button
                type="button"
                className="ml-1 rounded-sm opacity-60 hover:opacity-100 focus:outline-none focus:ring-2 focus:ring-accent-primary focus:ring-offset-2"
                onClick={() => removeTag(tag)}
              >
                <XMarkIcon className="h-3 w-3" />
                <span className="sr-only">Remove {tag}</span>
              </button>
            )}
          </span>
        ))}
        <input
          ref={ref}
          type="text"
          value={inputValue}
          onChange={(e) => setInputValue(e.target.value)}
          onKeyDown={handleKeyDown}
          onBlur={handleBlur}
          disabled={disabled || (maxTags !== undefined && value.length >= maxTags)}
          className={cn(
            'flex-1 bg-transparent text-sm outline-none placeholder:text-dark-text-secondary disabled:cursor-not-allowed',
            'min-w-[50px]'
          )}
          placeholder={
            maxTags && value.length >= maxTags
              ? `Maximum ${maxTags} tags`
              : placeholder
          }
          {...props}
        />
      </div>
    );
  }
);
TagInput.displayName = 'TagInput';
