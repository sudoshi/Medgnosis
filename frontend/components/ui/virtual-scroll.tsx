'use client';

import {
  forwardRef,
  useRef,
  useEffect,
  useState,
  useCallback,
  useMemo,
  UIEvent,
} from 'react';
import { cn } from '@/lib/utils';

export interface VirtualScrollProps<T> {
  items: T[];
  height: number;
  itemHeight: number;
  renderItem: (item: T, index: number, isVisible: boolean) => React.ReactNode;
  className?: string;
  overscan?: number;
  onScroll?: (scrollTop: number) => void;
  onItemsRendered?: (startIndex: number, endIndex: number) => void;
}

export function VirtualScroll<T>({
  items,
  height,
  itemHeight,
  renderItem,
  className,
  overscan = 3,
  onScroll,
  onItemsRendered,
}: VirtualScrollProps<T>) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [scrollTop, setScrollTop] = useState(0);

  const totalHeight = items.length * itemHeight;
  const viewportItems = Math.ceil(height / itemHeight);

  const startIndex = Math.max(0, Math.floor(scrollTop / itemHeight) - overscan);
  const endIndex = Math.min(
    items.length - 1,
    Math.floor((scrollTop + height) / itemHeight) + overscan
  );

  const visibleItems = useMemo(
    () =>
      items
        .slice(startIndex, endIndex + 1)
        .map((item, index) => ({
          item,
          index: startIndex + index,
          offsetTop: (startIndex + index) * itemHeight,
        })),
    [items, startIndex, endIndex, itemHeight]
  );

  const handleScroll = useCallback(
    (event: UIEvent<HTMLDivElement>) => {
      const newScrollTop = event.currentTarget.scrollTop;
      setScrollTop(newScrollTop);
      onScroll?.(newScrollTop);
    },
    [onScroll]
  );

  useEffect(() => {
    onItemsRendered?.(startIndex, endIndex);
  }, [startIndex, endIndex, onItemsRendered]);

  return (
    <div
      ref={containerRef}
      className={cn('overflow-auto', className)}
      style={{ height }}
      onScroll={handleScroll}
    >
      <div
        style={{
          height: totalHeight,
          position: 'relative',
        }}
      >
        {visibleItems.map(({ item, index, offsetTop }) => (
          <div
            key={index}
            style={{
              position: 'absolute',
              top: offsetTop,
              height: itemHeight,
              width: '100%',
            }}
          >
            {renderItem(item, index, true)}
          </div>
        ))}
      </div>
    </div>
  );
}

export interface VirtualScrollItemProps {
  children: React.ReactNode;
  className?: string;
}

export const VirtualScrollItem = forwardRef<HTMLDivElement, VirtualScrollItemProps>(
  ({ children, className }, ref) => {
    return (
      <div
        ref={ref}
        className={cn('w-full', className)}
      >
        {children}
      </div>
    );
  }
);
VirtualScrollItem.displayName = 'VirtualScrollItem';

export interface UseVirtualScrollOptions {
  itemCount: number;
  itemHeight: number;
  overscan?: number;
  scrollingDelay?: number;
}

export function useVirtualScroll({
  itemCount,
  itemHeight,
  overscan = 3,
  scrollingDelay = 150,
}: UseVirtualScrollOptions) {
  const [scrollTop, setScrollTop] = useState(0);
  const [viewportHeight, setViewportHeight] = useState(0);
  const [isScrolling, setIsScrolling] = useState(false);
  const scrollingTimeoutRef = useRef<NodeJS.Timeout>();

  const totalHeight = itemCount * itemHeight;
  const viewportItems = Math.ceil(viewportHeight / itemHeight);

  const startIndex = Math.max(0, Math.floor(scrollTop / itemHeight) - overscan);
  const endIndex = Math.min(
    itemCount - 1,
    Math.floor((scrollTop + viewportHeight) / itemHeight) + overscan
  );

  const onScroll = useCallback((event: UIEvent<HTMLDivElement>) => {
    setScrollTop(event.currentTarget.scrollTop);
    setIsScrolling(true);

    if (scrollingTimeoutRef.current) {
      clearTimeout(scrollingTimeoutRef.current);
    }

    scrollingTimeoutRef.current = setTimeout(() => {
      setIsScrolling(false);
    }, scrollingDelay);
  }, [scrollingDelay]);

  useEffect(() => {
    return () => {
      if (scrollingTimeoutRef.current) {
        clearTimeout(scrollingTimeoutRef.current);
      }
    };
  }, []);

  const measureElement = useCallback((element: HTMLElement | null) => {
    if (element) {
      const { height } = element.getBoundingClientRect();
      setViewportHeight(height);
    }
  }, []);

  return {
    startIndex,
    endIndex,
    isScrolling,
    onScroll,
    measureElement,
    totalHeight,
    scrollTop,
    viewportHeight,
  };
}
