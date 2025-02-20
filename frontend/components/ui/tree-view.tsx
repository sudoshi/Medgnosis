'use client';

import { forwardRef, useState, useCallback } from 'react';
import { ChevronRightIcon } from '@heroicons/react/24/outline';
import { cn } from '@/lib/utils';

export interface TreeItem {
  id: string;
  label: React.ReactNode;
  icon?: React.ComponentType<{ className?: string }>;
  children?: TreeItem[];
  disabled?: boolean;
  defaultExpanded?: boolean;
}

export interface TreeViewProps {
  items: TreeItem[];
  className?: string;
  onSelect?: (item: TreeItem) => void;
  selectedId?: string;
  expandedIds?: string[];
  onExpandedChange?: (ids: string[]) => void;
}

export const TreeView = forwardRef<HTMLDivElement, TreeViewProps>(
  ({
    items,
    className,
    onSelect,
    selectedId,
    expandedIds: controlledExpandedIds,
    onExpandedChange,
  }, ref) => {
    const [uncontrolledExpandedIds, setUncontrolledExpandedIds] = useState<string[]>([]);
    const expandedIds = controlledExpandedIds ?? uncontrolledExpandedIds;

    const toggleExpanded = useCallback((itemId: string) => {
      const newExpandedIds = expandedIds.includes(itemId)
        ? expandedIds.filter(id => id !== itemId)
        : [...expandedIds, itemId];

      if (controlledExpandedIds) {
        onExpandedChange?.(newExpandedIds);
      } else {
        setUncontrolledExpandedIds(newExpandedIds);
      }
    }, [expandedIds, controlledExpandedIds, onExpandedChange]);

    return (
      <div ref={ref} className={cn('space-y-0.5', className)}>
        {items.map(item => (
          <TreeViewItem
            key={item.id}
            item={item}
            level={0}
            onSelect={onSelect}
            selectedId={selectedId}
            expandedIds={expandedIds}
            onToggleExpanded={toggleExpanded}
          />
        ))}
      </div>
    );
  }
);
TreeView.displayName = 'TreeView';

interface TreeViewItemProps {
  item: TreeItem;
  level: number;
  onSelect?: (item: TreeItem) => void;
  selectedId?: string;
  expandedIds: string[];
  onToggleExpanded: (id: string) => void;
}

const TreeViewItem = forwardRef<HTMLDivElement, TreeViewItemProps>(
  ({
    item,
    level,
    onSelect,
    selectedId,
    expandedIds,
    onToggleExpanded,
  }, ref) => {
    const { id, label, icon: Icon, children, disabled } = item;
    const hasChildren = children && children.length > 0;
    const isExpanded = expandedIds.includes(id);
    const isSelected = id === selectedId;

    const handleClick = useCallback(() => {
      if (!disabled) {
        onSelect?.(item);
      }
    }, [disabled, item, onSelect]);

    const handleExpandClick = useCallback((e: React.MouseEvent) => {
      e.stopPropagation();
      if (!disabled && hasChildren) {
        onToggleExpanded(id);
      }
    }, [disabled, hasChildren, id, onToggleExpanded]);

    return (
      <div ref={ref}>
        <div
          role="button"
          className={cn(
            'group flex items-center rounded-lg px-2 py-1.5 text-sm',
            'hover:bg-dark-border hover:text-dark-text-primary',
            'focus:bg-dark-border focus:text-dark-text-primary focus:outline-none',
            isSelected && 'bg-dark-border text-dark-text-primary',
            disabled && 'cursor-not-allowed opacity-50',
            level > 0 && 'ml-6'
          )}
          onClick={handleClick}
          tabIndex={disabled ? -1 : 0}
        >
          {hasChildren && (
            <button
              type="button"
              className={cn(
                'mr-1 rounded p-0.5',
                'hover:bg-dark-border/50',
                'focus:bg-dark-border/50 focus:outline-none'
              )}
              onClick={handleExpandClick}
              tabIndex={-1}
              disabled={disabled}
            >
              <ChevronRightIcon
                className={cn(
                  'h-3 w-3 text-dark-text-secondary transition-transform',
                  isExpanded && 'rotate-90'
                )}
              />
            </button>
          )}
          {!hasChildren && (
            <div className="mr-4 w-3" />
          )}
          {Icon && (
            <Icon className="mr-2 h-4 w-4 text-dark-text-secondary" />
          )}
          <span className="flex-1 truncate">{label}</span>
        </div>
        {hasChildren && isExpanded && (
          <div className="mt-0.5">
            {children.map(child => (
              <TreeViewItem
                key={child.id}
                item={child}
                level={level + 1}
                onSelect={onSelect}
                selectedId={selectedId}
                expandedIds={expandedIds}
                onToggleExpanded={onToggleExpanded}
              />
            ))}
          </div>
        )}
      </div>
    );
  }
);
TreeViewItem.displayName = 'TreeViewItem';
