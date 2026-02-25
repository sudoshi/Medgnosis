'use client';

import { useState } from 'react';
import type { ReactNode } from 'react';

import { cn } from '@/lib/utils';

export interface TooltipProps {
  content: ReactNode;
  children: ReactNode;
  position?: 'top' | 'right' | 'bottom' | 'left';
  delay?: number;
  className?: string;
}

export function Tooltip({
  content,
  children,
  position = 'top',
  delay = 0,
  className,
}: TooltipProps) {
  const [isVisible, setIsVisible] = useState(false);
  const [timeoutId, setTimeoutId] = useState<NodeJS.Timeout>();

  const showTooltip = () => {
    if (delay) {
      const id = setTimeout(() => setIsVisible(true), delay);
      setTimeoutId(id);
    } else {
      setIsVisible(true);
    }
  };

  const hideTooltip = () => {
    if (timeoutId) {
      clearTimeout(timeoutId);
    }
    setIsVisible(false);
  };

  const positions = {
    top: 'bottom-full left-1/2 -translate-x-1/2 mb-2',
    right: 'left-full top-1/2 -translate-y-1/2 ml-2',
    bottom: 'top-full left-1/2 -translate-x-1/2 mt-2',
    left: 'right-full top-1/2 -translate-y-1/2 mr-2',
  };

  const arrows = {
    top: 'bottom-[-4px] left-1/2 -translate-x-1/2 border-l-transparent border-r-transparent border-b-transparent',
    right: 'left-[-4px] top-1/2 -translate-y-1/2 border-t-transparent border-b-transparent border-l-transparent',
    bottom: 'top-[-4px] left-1/2 -translate-x-1/2 border-l-transparent border-r-transparent border-t-transparent',
    left: 'right-[-4px] top-1/2 -translate-y-1/2 border-t-transparent border-b-transparent border-r-transparent',
  };

  return (
    <div
      className="relative inline-block"
      onMouseEnter={showTooltip}
      onMouseLeave={hideTooltip}
    >
      {children}
      {isVisible && (
        <div
          className={cn(
            'absolute z-50 w-max max-w-xs animate-fade-in',
            positions[position],
            className
          )}
        >
          <div className="relative rounded bg-dark-secondary px-2 py-1 text-xs text-dark-text-primary shadow-lg">
            {content}
            <div
              className={cn(
                'absolute border-4 border-dark-secondary',
                arrows[position]
              )}
            />
          </div>
        </div>
      )}
    </div>
  );
}
