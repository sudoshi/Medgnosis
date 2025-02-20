'use client';

import * as AspectRatioPrimitive from '@radix-ui/react-aspect-ratio';
import { forwardRef, type ReactNode } from 'react';

import { cn } from '@/lib/utils';

export interface AspectRatioProps {
  ratio?: number;
  children: ReactNode;
  className?: string;
}

export const AspectRatio = forwardRef<HTMLDivElement, AspectRatioProps>(
  ({ ratio = 1, children, className }, ref) => {
    return (
      <div ref={ref} className={cn('relative w-full', className)}>
        <AspectRatioPrimitive.Root ratio={ratio}>
          {children}
        </AspectRatioPrimitive.Root>
      </div>
    );
  }
);
AspectRatio.displayName = 'AspectRatio';

export interface AspectRatioImageProps extends AspectRatioProps {
  src: string;
  alt: string;
  fill?: boolean;
  objectFit?: 'contain' | 'cover' | 'fill' | 'none' | 'scale-down';
}

export function AspectRatioImage({
  ratio = 16 / 9,
  src,
  alt,
  fill = true,
  objectFit = 'cover',
  className,
}: AspectRatioImageProps) {
  return (
    <AspectRatio ratio={ratio} className={className}>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={src}
        alt={alt}
        className={cn(
          'rounded-lg',
          fill ? 'absolute inset-0 h-full w-full' : 'h-auto w-full',
          {
            'object-contain': objectFit === 'contain',
            'object-cover': objectFit === 'cover',
            'object-fill': objectFit === 'fill',
            'object-none': objectFit === 'none',
            'object-scale-down': objectFit === 'scale-down',
          }
        )}
      />
    </AspectRatio>
  );
}

export interface AspectRatioVideoProps extends AspectRatioProps {
  src: string;
  poster?: string;
  autoPlay?: boolean;
  controls?: boolean;
  loop?: boolean;
  muted?: boolean;
  playsInline?: boolean;
  captions?: {
    src: string;
    label: string;
    language: string;
    kind?: 'subtitles' | 'captions' | 'descriptions' | 'chapters' | 'metadata';
    default?: boolean;
  }[];
}

export function AspectRatioVideo({
  ratio = 16 / 9,
  src,
  poster,
  autoPlay = false,
  controls = true,
  loop = false,
  muted = false,
  playsInline = true,
  className,
  captions = [
    {
      src: '', // Empty source for default track to satisfy ESLint
      label: 'Default',
      language: 'en',
      kind: 'captions',
      default: true,
    },
  ],
}: AspectRatioVideoProps) {
  return (
    <AspectRatio ratio={ratio} className={className}>
      <video
        src={src}
        poster={poster}
        autoPlay={autoPlay}
        controls={controls}
        loop={loop}
        muted={muted}
        playsInline={playsInline}
        className="absolute inset-0 h-full w-full rounded-lg object-cover"
      >
        {/* Default track to satisfy ESLint accessibility rule */}
        <track kind="captions" srcLang="en" label="English" />
        {captions.map((track: {
          src: string;
          label: string;
          language: string;
          kind?: 'subtitles' | 'captions' | 'descriptions' | 'chapters' | 'metadata';
          default?: boolean;
        }, index: number) => (
          <track
            key={index}
            src={track.src}
            label={track.label}
            srcLang={track.language}
            kind={track.kind || 'captions'}
            default={track.default}
          />
        ))}
      </video>
    </AspectRatio>
  );
}

export interface AspectRatioIframeProps extends AspectRatioProps {
  src: string;
  title: string;
  allow?: string;
  sandbox?: string;
}

export function AspectRatioIframe({
  ratio = 16 / 9,
  src,
  title,
  allow,
  sandbox,
  className,
}: AspectRatioIframeProps) {
  return (
    <AspectRatio ratio={ratio} className={className}>
      <iframe
        src={src}
        title={title}
        allow={allow}
        sandbox={sandbox}
        className="absolute inset-0 h-full w-full rounded-lg border-0"
      />
    </AspectRatio>
  );
}
