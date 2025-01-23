'use client';

import { useState, useRef, useEffect, type ReactNode } from 'react';
import { ChevronDownIcon } from '@heroicons/react/24/outline';
import { cn } from '@/lib/utils';

export interface CollapsibleProps {
  title: ReactNode;
  children: ReactNode;
  defaultOpen?: boolean;
  onChange?: (isOpen: boolean) => void;
  className?: string;
  headerClassName?: string;
  contentClassName?: string;
  chevronClassName?: string;
  disabled?: boolean;
  showChevron?: boolean;
  chevronPosition?: 'left' | 'right';
}

export function Collapsible({
  title,
  children,
  defaultOpen = false,
  onChange,
  className,
  headerClassName,
  contentClassName,
  chevronClassName,
  disabled = false,
  showChevron = true,
  chevronPosition = 'right',
}: CollapsibleProps) {
  const [isOpen, setIsOpen] = useState(defaultOpen);
  const contentRef = useRef<HTMLDivElement>(null);
  const [contentHeight, setContentHeight] = useState<number | undefined>(
    defaultOpen ? undefined : 0
  );

  useEffect(() => {
    if (contentRef.current) {
      const resizeObserver = new ResizeObserver(entries => {
        for (const entry of entries) {
          if (entry.target === contentRef.current) {
            const height = entry.contentRect.height;
            setContentHeight(isOpen ? height : 0);
          }
        }
      });

      resizeObserver.observe(contentRef.current);
      return () => resizeObserver.disconnect();
    }
  }, [isOpen]);

  const handleToggle = () => {
    if (!disabled) {
      const newIsOpen = !isOpen;
      setIsOpen(newIsOpen);
      onChange?.(newIsOpen);

      if (contentRef.current) {
        setContentHeight(newIsOpen ? contentRef.current.scrollHeight : 0);
      }
    }
  };

  const chevron = showChevron && (
    <ChevronDownIcon
      className={cn(
        'h-5 w-5 transform transition-transform duration-200',
        isOpen && 'rotate-180',
        disabled && 'opacity-50',
        chevronClassName
      )}
    />
  );

  return (
    <div className={cn('overflow-hidden', className)}>
      <button
        type="button"
        onClick={handleToggle}
        disabled={disabled}
        className={cn(
          'flex w-full items-center justify-between py-2 text-left',
          disabled && 'cursor-not-allowed opacity-75',
          headerClassName
        )}
      >
        <div className={cn('flex items-center gap-2', chevronPosition === 'left' && 'flex-row-reverse justify-end')}>
          {chevronPosition === 'left' && chevron}
          <div className="flex-1">{title}</div>
          {chevronPosition === 'right' && chevron}
        </div>
      </button>

      <div
        style={{
          height: contentHeight !== undefined ? `${contentHeight}px` : 'auto',
          opacity: contentHeight === 0 ? 0 : 1,
        }}
        className={cn(
          'overflow-hidden transition-all duration-200 ease-in-out',
          contentClassName
        )}
      >
        <div ref={contentRef}>{children}</div>
      </div>
    </div>
  );
}

export interface CollapsibleGroupProps {
  items: {
    id: string;
    title: ReactNode;
    content: ReactNode;
    disabled?: boolean;
  }[];
  defaultOpenId?: string;
  onChange?: (openId: string | null) => void;
  className?: string;
  itemClassName?: string;
  headerClassName?: string;
  contentClassName?: string;
  chevronClassName?: string;
  showChevron?: boolean;
  chevronPosition?: 'left' | 'right';
}

export function CollapsibleGroup({
  items,
  defaultOpenId,
  onChange,
  className,
  itemClassName,
  headerClassName,
  contentClassName,
  chevronClassName,
  showChevron = true,
  chevronPosition = 'right',
}: CollapsibleGroupProps) {
  const [openId, setOpenId] = useState<string | null>(defaultOpenId || null);

  const handleChange = (id: string, isOpen: boolean) => {
    const newOpenId = isOpen ? id : null;
    setOpenId(newOpenId);
    onChange?.(newOpenId);
  };

  return (
    <div className={cn('divide-y divide-dark-border', className)}>
      {items.map(item => (
        <Collapsible
          key={item.id}
          title={item.title}
          defaultOpen={item.id === defaultOpenId}
          onChange={isOpen => handleChange(item.id, isOpen)}
          disabled={item.disabled}
          className={itemClassName}
          headerClassName={headerClassName}
          contentClassName={contentClassName}
          chevronClassName={chevronClassName}
          showChevron={showChevron}
          chevronPosition={chevronPosition}
        >
          {item.content}
        </Collapsible>
      ))}
    </div>
  );
}
