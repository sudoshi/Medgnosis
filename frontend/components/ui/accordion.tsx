'use client';

import { useState, useCallback } from 'react';
import { ChevronDownIcon } from '@heroicons/react/24/outline';
import { cn } from '@/lib/utils';

export interface AccordionItem {
  id: string;
  title: React.ReactNode;
  content: React.ReactNode;
  disabled?: boolean;
}

export interface AccordionProps {
  items: AccordionItem[];
  defaultExpanded?: string[];
  allowMultiple?: boolean;
  onChange?: (expandedIds: string[]) => void;
  className?: string;
  itemClassName?: string;
  headerClassName?: string;
  contentClassName?: string;
}

export function Accordion({
  items,
  defaultExpanded = [],
  allowMultiple = false,
  onChange,
  className,
  itemClassName,
  headerClassName,
  contentClassName,
}: AccordionProps) {
  const [expandedIds, setExpandedIds] = useState<string[]>(defaultExpanded);

  const handleItemClick = useCallback((itemId: string) => {
    setExpandedIds(prev => {
      let newExpanded: string[];

      if (allowMultiple) {
        newExpanded = prev.includes(itemId)
          ? prev.filter(id => id !== itemId)
          : [...prev, itemId];
      } else {
        newExpanded = prev.includes(itemId) ? [] : [itemId];
      }

      onChange?.(newExpanded);
      return newExpanded;
    });
  }, [allowMultiple, onChange]);

  return (
    <div
      className={cn(
        'divide-y divide-dark-border rounded-lg border border-dark-border bg-dark-secondary',
        className
      )}
    >
      {items.map((item) => {
        const isExpanded = expandedIds.includes(item.id);

        return (
          <div
            key={item.id}
            className={cn(
              'overflow-hidden transition-colors',
              item.disabled && 'opacity-50',
              itemClassName
            )}
          >
            <button
              type="button"
              onClick={() => !item.disabled && handleItemClick(item.id)}
              className={cn(
                'flex w-full items-center justify-between px-4 py-4 text-left',
                !item.disabled && 'hover:bg-dark-border/50',
                headerClassName
              )}
              disabled={item.disabled}
              aria-expanded={isExpanded}
            >
              <div className="flex-1">{item.title}</div>
              <ChevronDownIcon
                className={cn(
                  'h-5 w-5 text-dark-text-secondary transition-transform duration-200',
                  isExpanded && 'rotate-180'
                )}
              />
            </button>
            <div
              className={cn(
                'overflow-hidden transition-all duration-200 ease-in-out',
                isExpanded ? 'max-h-96' : 'max-h-0',
                contentClassName
              )}
            >
              <div className="px-4 pb-4">{item.content}</div>
            </div>
          </div>
        );
      })}
    </div>
  );
}

export interface AccordionGroupProps {
  title?: React.ReactNode;
  description?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
}

export function AccordionGroup({
  title,
  description,
  children,
  className,
}: AccordionGroupProps) {
  return (
    <div className={cn('space-y-4', className)}>
      {(title || description) && (
        <div className="space-y-1">
          {title && (
            <h4 className="text-lg font-medium text-dark-text-primary">
              {title}
            </h4>
          )}
          {description && (
            <p className="text-sm text-dark-text-secondary">
              {description}
            </p>
          )}
        </div>
      )}
      {children}
    </div>
  );
}
