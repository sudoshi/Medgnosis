'use client';

import { UserIcon } from '@heroicons/react/24/solid';
import Image from 'next/image';
import { useEffect, useState } from 'react';

import { cn } from '@/lib/utils';


export interface AvatarProps {
  src?: string | null;
  alt?: string;
  fallback?: string;
  size?: 'sm' | 'md' | 'lg' | 'xl';
  className?: string;
  fallbackClassName?: string;
}

export function Avatar({
  src,
  alt,
  fallback,
  size = 'md',
  className,
  fallbackClassName,
}: AvatarProps) {
  const [error, setError] = useState(false);

  useEffect(() => {
    setError(false);
  }, [src]);

  const sizes = {
    sm: 'h-8 w-8',
    md: 'h-10 w-10',
    lg: 'h-12 w-12',
    xl: 'h-14 w-14',
  };

  const getFallback = () => {
    if (fallback) {
      const initials = fallback
        .split(' ')
        .map((n) => n[0])
        .slice(0, 2)
        .join('')
        .toUpperCase();
      return (
        <span
          className={cn(
            'flex h-full w-full items-center justify-center bg-accent-primary text-white',
            getFontSize(),
            fallbackClassName
          )}
        >
          {initials}
        </span>
      );
    }
    return (
      <div
        className={cn(
          'flex h-full w-full items-center justify-center bg-dark-border text-dark-text-secondary',
          fallbackClassName
        )}
      >
        <UserIcon className="h-1/2 w-1/2" />
      </div>
    );
  };

  const getFontSize = () => {
    switch (size) {
      case 'sm':
        return 'text-xs';
      case 'md':
        return 'text-sm';
      case 'lg':
        return 'text-base';
      case 'xl':
        return 'text-lg';
      default:
        return 'text-sm';
    }
  };

  return (
    <div
      className={cn(
        'relative shrink-0 overflow-hidden rounded-full',
        sizes[size],
        className
      )}
    >
      {src && !error ? (
        <Image
          src={src}
          alt={alt || 'Avatar'}
          className="aspect-square h-full w-full"
          width={56}
          height={56}
          onError={() => setError(true)}
        />
      ) : (
        getFallback()
      )}
    </div>
  );
}

export interface AvatarGroupProps {
  avatars: Array<{
    src?: string | null;
    alt?: string;
    fallback?: string;
  }>;
  max?: number;
  size?: AvatarProps['size'];
  className?: string;
}

export function AvatarGroup({
  avatars,
  max = 4,
  size = 'md',
  className,
}: AvatarGroupProps) {
  const visibleAvatars = avatars.slice(0, max);
  const remainingCount = avatars.length - max;

  return (
    <div className={cn('flex -space-x-2', className)}>
      {visibleAvatars.map((avatar, i) => (
        <Avatar
          key={i}
          src={avatar.src}
          alt={avatar.alt}
          fallback={avatar.fallback}
          size={size}
          className="ring-2 ring-dark-primary"
        />
      ))}
      {remainingCount > 0 && (
        <div
          className={cn(
            'relative flex shrink-0 items-center justify-center rounded-full bg-dark-border text-dark-text-secondary ring-2 ring-dark-primary',
            {
              'h-8 w-8 text-xs': size === 'sm',
              'h-10 w-10 text-sm': size === 'md',
              'h-12 w-12 text-base': size === 'lg',
              'h-14 w-14 text-lg': size === 'xl',
            }
          )}
        >
          +{remainingCount}
        </div>
      )}
    </div>
  );
}
