'use client';

import { forwardRef, useState, useCallback, useEffect } from 'react';
import { ChevronLeftIcon, ChevronRightIcon } from '@heroicons/react/24/outline';
import { cn } from '@/lib/utils';

export interface CarouselProps {
  children: React.ReactNode[];
  className?: string;
  contentClassName?: string;
  showArrows?: boolean;
  showDots?: boolean;
  autoPlay?: boolean;
  interval?: number;
  loop?: boolean;
}

export const Carousel = forwardRef<HTMLDivElement, CarouselProps>(
  ({
    children,
    className,
    contentClassName,
    showArrows = true,
    showDots = true,
    autoPlay = false,
    interval = 5000,
    loop = true,
  }, ref) => {
    const [currentIndex, setCurrentIndex] = useState(0);
    const [isHovered, setIsHovered] = useState(false);

    const next = useCallback(() => {
      if (currentIndex === children.length - 1) {
        if (loop) setCurrentIndex(0);
      } else {
        setCurrentIndex(prev => prev + 1);
      }
    }, [currentIndex, children.length, loop]);

    const prev = useCallback(() => {
      if (currentIndex === 0) {
        if (loop) setCurrentIndex(children.length - 1);
      } else {
        setCurrentIndex(prev => prev - 1);
      }
    }, [currentIndex, children.length, loop]);

    const goTo = useCallback((index: number) => {
      setCurrentIndex(index);
    }, []);

    useEffect(() => {
      if (autoPlay && !isHovered) {
        const timer = setInterval(() => {
          next();
        }, interval);
        return () => clearInterval(timer);
      }
      return undefined;
    }, [autoPlay, interval, next, isHovered]);

    return (
      <div
        ref={ref}
        className={cn('relative', className)}
        onMouseEnter={() => setIsHovered(true)}
        onMouseLeave={() => setIsHovered(false)}
      >
        <div
          className={cn(
            'relative h-full w-full overflow-hidden rounded-lg',
            contentClassName
          )}
        >
          <div
            className="flex h-full transition-transform duration-300 ease-in-out"
            style={{
              transform: `translateX(-${currentIndex * 100}%)`,
              width: `${children.length * 100}%`,
            }}
          >
            {children.map((child, index) => (
              <div
                key={index}
                className="relative h-full w-full shrink-0"
                style={{ width: `${100 / children.length}%` }}
              >
                {child}
              </div>
            ))}
          </div>
        </div>

        {showArrows && (
          <>
            <button
              onClick={prev}
              disabled={!loop && currentIndex === 0}
              className={cn(
                'absolute left-4 top-1/2 -translate-y-1/2 rounded-full bg-dark-secondary/80 p-2 text-dark-text-primary shadow-lg backdrop-blur-sm transition-all',
                'hover:bg-dark-secondary hover:text-dark-text-primary',
                'focus:outline-none focus:ring-2 focus:ring-accent-primary focus:ring-offset-2',
                'disabled:cursor-not-allowed disabled:opacity-50',
                (!loop && currentIndex === 0) && 'hidden'
              )}
            >
              <ChevronLeftIcon className="h-6 w-6" />
            </button>
            <button
              onClick={next}
              disabled={!loop && currentIndex === children.length - 1}
              className={cn(
                'absolute right-4 top-1/2 -translate-y-1/2 rounded-full bg-dark-secondary/80 p-2 text-dark-text-primary shadow-lg backdrop-blur-sm transition-all',
                'hover:bg-dark-secondary hover:text-dark-text-primary',
                'focus:outline-none focus:ring-2 focus:ring-accent-primary focus:ring-offset-2',
                'disabled:cursor-not-allowed disabled:opacity-50',
                (!loop && currentIndex === children.length - 1) && 'hidden'
              )}
            >
              <ChevronRightIcon className="h-6 w-6" />
            </button>
          </>
        )}

        {showDots && (
          <div className="absolute bottom-4 left-1/2 flex -translate-x-1/2 space-x-2">
            {children.map((_, index) => (
              <button
                key={index}
                onClick={() => goTo(index)}
                className={cn(
                  'h-2 w-2 rounded-full bg-dark-secondary/80 transition-all',
                  'hover:bg-dark-secondary',
                  'focus:outline-none focus:ring-2 focus:ring-accent-primary focus:ring-offset-2',
                  index === currentIndex && 'w-4 bg-dark-secondary'
                )}
              >
                <span className="sr-only">Go to slide {index + 1}</span>
              </button>
            ))}
          </div>
        )}
      </div>
    );
  }
);
Carousel.displayName = 'Carousel';

export interface CarouselItemProps {
  children: React.ReactNode;
  className?: string;
}

export const CarouselItem = forwardRef<HTMLDivElement, CarouselItemProps>(
  ({ children, className }, ref) => {
    return (
      <div
        ref={ref}
        className={cn('relative h-full w-full', className)}
      >
        {children}
      </div>
    );
  }
);
CarouselItem.displayName = 'CarouselItem';

export interface CarouselImageProps extends CarouselItemProps {
  src: string;
  alt: string;
  objectFit?: 'contain' | 'cover';
}

export const CarouselImage = forwardRef<HTMLDivElement, CarouselImageProps>(
  ({ src, alt, objectFit = 'cover', className }, ref) => {
    return (
      <CarouselItem ref={ref} className={className}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={src}
          alt={alt}
          className={cn(
            'h-full w-full',
            objectFit === 'contain' ? 'object-contain' : 'object-cover'
          )}
        />
      </CarouselItem>
    );
  }
);
CarouselImage.displayName = 'CarouselImage';
