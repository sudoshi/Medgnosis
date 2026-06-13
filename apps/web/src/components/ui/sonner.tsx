import { type ComponentProps } from 'react';
import { Toaster as Sonner } from 'sonner';
import { useThemeStore } from '@/stores/theme';

type ToasterProps = ComponentProps<typeof Sonner>;

/**
 * App toaster. Follows the Clinical Obsidian theme (dark/light) and tokens.
 * Use the `toast()` API from `sonner` directly at call sites.
 */
function Toaster(props: ToasterProps) {
  const resolvedTheme = useThemeStore((s) => s.resolvedTheme);
  return (
    <Sonner
      theme={resolvedTheme}
      className="toaster group"
      toastOptions={{
        classNames: {
          toast:
            'group toast group-[.toaster]:bg-s1 group-[.toaster]:text-bright group-[.toaster]:border-edge/50 group-[.toaster]:shadow-panel group-[.toaster]:rounded-card',
          description: 'group-[.toast]:text-dim',
          actionButton: 'group-[.toast]:bg-primary group-[.toast]:text-primary-foreground',
          cancelButton: 'group-[.toast]:bg-muted group-[.toast]:text-dim',
        },
      }}
      {...props}
    />
  );
}

export { Toaster };
