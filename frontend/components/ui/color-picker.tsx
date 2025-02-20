'use client';

import { forwardRef, useCallback } from 'react';
import { EyeDropperIcon } from '@heroicons/react/24/outline';
import { cn } from '@/lib/utils';

export interface ColorPickerProps extends Omit<React.InputHTMLAttributes<HTMLInputElement>, 'type' | 'value' | 'onChange'> {
  value: string;
  onChange: (value: string) => void;
  className?: string;
  swatchClassName?: string;
  showEyeDropper?: boolean;
  format?: 'hex' | 'rgb' | 'hsl';
  presetColors?: string[];
}

export const ColorPicker = forwardRef<HTMLDivElement, ColorPickerProps>(
  ({
    value,
    onChange,
    className,
    swatchClassName,
    showEyeDropper = true,
    format = 'hex',
    presetColors,
    disabled,
    ...props
  }, ref) => {
    const handleEyeDropper = useCallback(async () => {
      try {
        // @ts-ignore - EyeDropper API is not yet in TypeScript
        const eyeDropper = new window.EyeDropper();
        const result = await eyeDropper.open();
        onChange(result.sRGBHex);
      } catch (error) {
        console.error('EyeDropper error:', error);
      }
    }, [onChange]);

    const handleColorChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
      let newValue = e.target.value;

      if (format === 'rgb') {
        // Convert hex to RGB
        const r = parseInt(newValue.slice(1, 3), 16);
        const g = parseInt(newValue.slice(3, 5), 16);
        const b = parseInt(newValue.slice(5, 7), 16);
        newValue = `rgb(${r}, ${g}, ${b})`;
      } else if (format === 'hsl') {
        // Convert hex to HSL
        const r = parseInt(newValue.slice(1, 3), 16) / 255;
        const g = parseInt(newValue.slice(3, 5), 16) / 255;
        const b = parseInt(newValue.slice(5, 7), 16) / 255;

        const max = Math.max(r, g, b);
        const min = Math.min(r, g, b);
        let h = 0;
        let s = 0;
        const l = (max + min) / 2;

        if (max !== min) {
          const d = max - min;
          s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
          switch (max) {
            case r:
              h = (g - b) / d + (g < b ? 6 : 0);
              break;
            case g:
              h = (b - r) / d + 2;
              break;
            case b:
              h = (r - g) / d + 4;
              break;
          }
          h /= 6;
        }

        newValue = `hsl(${Math.round(h * 360)}, ${Math.round(s * 100)}%, ${Math.round(l * 100)}%)`;
      }

      onChange(newValue);
    }, [format, onChange]);

    return (
      <div
        ref={ref}
        className={cn('relative inline-block', className)}
      >
        <div
          className={cn(
            'flex items-center gap-2 rounded-md border border-dark-border bg-dark-secondary p-1',
            disabled && 'cursor-not-allowed opacity-50'
          )}
        >
          <div
            className={cn(
              'h-8 w-8 rounded-sm border border-dark-border',
              swatchClassName
            )}
            style={{ backgroundColor: value }}
          />
          <input
            type="color"
            value={value}
            onChange={handleColorChange}
            disabled={disabled}
            className={cn(
              'h-0 w-0 opacity-0',
              '[&::-webkit-color-swatch-wrapper]:p-0',
              '[&::-webkit-color-swatch]:border-none'
            )}
            {...props}
          />
          {showEyeDropper && 'EyeDropper' in window && (
            <button
              type="button"
              onClick={handleEyeDropper}
              disabled={disabled}
              className={cn(
                'rounded-sm p-1 hover:bg-dark-border focus:outline-none focus:ring-2 focus:ring-accent-primary focus:ring-offset-2',
                'disabled:cursor-not-allowed disabled:opacity-50'
              )}
            >
              <EyeDropperIcon className="h-4 w-4" />
              <span className="sr-only">Pick color from screen</span>
            </button>
          )}
        </div>
        {presetColors && (
          <div className="mt-2 flex flex-wrap gap-1">
            {presetColors.map((color, index) => (
              <button
                key={index}
                type="button"
                onClick={() => onChange(color)}
                disabled={disabled}
                className={cn(
                  'h-6 w-6 rounded-sm border border-dark-border',
                  'hover:scale-110 focus:outline-none focus:ring-2 focus:ring-accent-primary focus:ring-offset-2',
                  'disabled:cursor-not-allowed disabled:opacity-50'
                )}
                style={{ backgroundColor: color }}
              >
                <span className="sr-only">Select color: {color}</span>
              </button>
            ))}
          </div>
        )}
      </div>
    );
  }
);
ColorPicker.displayName = 'ColorPicker';
