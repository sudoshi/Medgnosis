'use client';

import { forwardRef, useState, useCallback, useEffect } from 'react';

import { cn } from '@/lib/utils';

export interface ResizablePanelProps {
  children: React.ReactNode;
  className?: string;
  defaultSize?: number;
  minSize?: number;
  maxSize?: number;
  direction?: 'horizontal' | 'vertical';
  onResize?: (size: number) => void;
}

export const ResizablePanel = forwardRef<HTMLDivElement, ResizablePanelProps>(
  ({
    children,
    className,
    defaultSize = 250,
    minSize = 100,
    maxSize = 500,
    direction = 'horizontal',
    onResize,
  }, ref) => {
    const [size, setSize] = useState(defaultSize);
    const [isResizing, setIsResizing] = useState(false);
    const [startPosition, setStartPosition] = useState(0);
    const [startSize, setStartSize] = useState(0);

    const handleMouseDown = useCallback((e: React.MouseEvent) => {
      e.preventDefault();
      setIsResizing(true);
      setStartPosition(direction === 'horizontal' ? e.clientX : e.clientY);
      setStartSize(size);
    }, [direction, size]);

    const handleMouseMove = useCallback((e: MouseEvent) => {
      if (!isResizing) return;

      const currentPosition = direction === 'horizontal' ? e.clientX : e.clientY;
      const difference = currentPosition - startPosition;
      const newSize = Math.max(minSize, Math.min(maxSize, startSize + difference));

      setSize(newSize);
      onResize?.(newSize);
    }, [direction, isResizing, maxSize, minSize, onResize, startPosition, startSize]);

    const handleMouseUp = useCallback(() => {
      setIsResizing(false);
    }, []);

    useEffect(() => {
      if (isResizing) {
        window.addEventListener('mousemove', handleMouseMove);
        window.addEventListener('mouseup', handleMouseUp);
        return () => {
          window.removeEventListener('mousemove', handleMouseMove);
          window.removeEventListener('mouseup', handleMouseUp);
        };
      }
      return undefined;
    }, [isResizing, handleMouseMove, handleMouseUp]);

    return (
      <div
        ref={ref}
        className={cn(
          'relative flex',
          direction === 'horizontal' ? 'flex-row' : 'flex-col',
          className
        )}
        style={{
          [direction === 'horizontal' ? 'width' : 'height']: size,
        }}
      >
        <div className="flex-1 overflow-auto">{children}</div>
        <div
          role="slider"
          tabIndex={0}
          aria-orientation={direction}
          aria-valuenow={size}
          aria-valuemin={minSize}
          aria-valuemax={maxSize}
          aria-label={`Resize ${direction === 'horizontal' ? 'width' : 'height'}`}
          onKeyDown={(e) => {
            const step = 10;
            if (direction === 'horizontal') {
              if (e.key === 'ArrowLeft') {
                e.preventDefault();
                const newSize = Math.max(minSize, size - step);
                setSize(newSize);
                onResize?.(newSize);
              } else if (e.key === 'ArrowRight') {
                e.preventDefault();
                const newSize = Math.min(maxSize, size + step);
                setSize(newSize);
                onResize?.(newSize);
              }
            } else {
              if (e.key === 'ArrowUp') {
                e.preventDefault();
                const newSize = Math.max(minSize, size - step);
                setSize(newSize);
                onResize?.(newSize);
              } else if (e.key === 'ArrowDown') {
                e.preventDefault();
                const newSize = Math.min(maxSize, size + step);
                setSize(newSize);
                onResize?.(newSize);
              }
            }
          }}
          className={cn(
            'absolute flex cursor-col-resize items-center justify-center bg-transparent transition-colors',
            'hover:bg-dark-border/50 active:bg-dark-border focus:bg-dark-border/50',
            'focus:outline-none focus:ring-2 focus:ring-accent-primary focus:ring-offset-2',
            direction === 'horizontal'
              ? 'right-0 h-full w-1 -translate-x-1/2'
              : 'bottom-0 h-1 w-full -translate-y-1/2',
            isResizing && 'bg-dark-border'
          )}
          onMouseDown={handleMouseDown}
        >
          <div
            className={cn(
              'rounded-full bg-dark-border',
              direction === 'horizontal' ? 'h-8 w-1' : 'h-1 w-8'
            )}
          />
        </div>
      </div>
    );
  }
);
ResizablePanel.displayName = 'ResizablePanel';

export interface ResizableGroupProps {
  children: React.ReactNode;
  className?: string;
  direction?: 'horizontal' | 'vertical';
}

export const ResizableGroup = forwardRef<HTMLDivElement, ResizableGroupProps>(
  ({ children, className, direction = 'horizontal' }, ref) => {
    return (
      <div
        ref={ref}
        className={cn(
          'flex',
          direction === 'horizontal' ? 'flex-row' : 'flex-col',
          className
        )}
      >
        {children}
      </div>
    );
  }
);
ResizableGroup.displayName = 'ResizableGroup';

export interface ResizableHandleProps {
  className?: string;
  direction?: 'horizontal' | 'vertical';
  onResize?: (delta: number) => void;
}

export const ResizableHandle = forwardRef<HTMLDivElement, ResizableHandleProps>(
  ({ className, direction = 'horizontal', onResize }, ref) => {
    const [isResizing, setIsResizing] = useState(false);
    const [startPosition, setStartPosition] = useState(0);
    const [value, setValue] = useState(0);

    const handleMouseDown = useCallback((e: React.MouseEvent) => {
      e.preventDefault();
      setIsResizing(true);
      setStartPosition(direction === 'horizontal' ? e.clientX : e.clientY);
    }, [direction]);

    const handleMouseMove = useCallback((e: MouseEvent) => {
      if (!isResizing) return;

      const currentPosition = direction === 'horizontal' ? e.clientX : e.clientY;
      const delta = currentPosition - startPosition;
      onResize?.(delta);
      setStartPosition(currentPosition);
    }, [direction, isResizing, onResize, startPosition]);

    const handleMouseUp = useCallback(() => {
      setIsResizing(false);
    }, []);

    useEffect(() => {
      if (isResizing) {
        window.addEventListener('mousemove', handleMouseMove);
        window.addEventListener('mouseup', handleMouseUp);
        return () => {
          window.removeEventListener('mousemove', handleMouseMove);
          window.removeEventListener('mouseup', handleMouseUp);
        };
      }
      return undefined;
    }, [isResizing, handleMouseMove, handleMouseUp]);

    return (
      <div
        ref={ref}
        role="slider"
        tabIndex={0}
        aria-orientation={direction}
        aria-valuenow={value}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-label={`Resize ${direction === 'horizontal' ? 'width' : 'height'}`}
        onKeyDown={(e) => {
          const step = 10;
          if (e.key === 'ArrowLeft' || e.key === 'ArrowRight' || e.key === 'ArrowUp' || e.key === 'ArrowDown') {
            e.preventDefault();
            const delta = (e.key === 'ArrowRight' || e.key === 'ArrowDown') ? step : -step;
            const newValue = Math.max(0, Math.min(100, value + delta));
            setValue(newValue);
            onResize?.(delta);
          }
        }}
        className={cn(
          'flex cursor-col-resize items-center justify-center bg-transparent transition-colors',
          'hover:bg-dark-border/50 active:bg-dark-border focus:bg-dark-border/50',
          'focus:outline-none focus:ring-2 focus:ring-accent-primary focus:ring-offset-2',
          direction === 'horizontal' ? 'w-1' : 'h-1',
          isResizing && 'bg-dark-border',
          className
        )}
        onMouseDown={handleMouseDown}
      >
        <div
          className={cn(
            'rounded-full bg-dark-border',
            direction === 'horizontal' ? 'h-8 w-1' : 'h-1 w-8'
          )}
        />
      </div>
    );
  }
);
ResizableHandle.displayName = 'ResizableHandle';
