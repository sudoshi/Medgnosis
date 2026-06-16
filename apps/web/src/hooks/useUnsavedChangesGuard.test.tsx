import { describe, it, expect, vi } from 'vitest';
import { render } from '@testing-library/react';
import { useUnsavedChangesGuard } from './useUnsavedChangesGuard.js';

function Harness({ dirty, onFlush }: { dirty: boolean; onFlush: () => void }) {
  useUnsavedChangesGuard(dirty, onFlush);
  return null;
}

describe('useUnsavedChangesGuard', () => {
  it('flushes pending work on unmount when dirty (in-app navigation)', () => {
    const onFlush = vi.fn();
    const { unmount } = render(<Harness dirty onFlush={onFlush} />);
    unmount();
    expect(onFlush).toHaveBeenCalledTimes(1);
  });

  it('does NOT flush on unmount when clean', () => {
    const onFlush = vi.fn();
    const { unmount } = render(<Harness dirty={false} onFlush={onFlush} />);
    unmount();
    expect(onFlush).not.toHaveBeenCalled();
  });

  it('prevents tab-close/refresh (beforeunload) when dirty', () => {
    render(<Harness dirty onFlush={() => {}} />);
    const e = new Event('beforeunload', { cancelable: true }) as BeforeUnloadEvent;
    window.dispatchEvent(e);
    expect(e.defaultPrevented).toBe(true);
  });

  it('allows tab-close/refresh when clean', () => {
    render(<Harness dirty={false} onFlush={() => {}} />);
    const e = new Event('beforeunload', { cancelable: true }) as BeforeUnloadEvent;
    window.dispatchEvent(e);
    expect(e.defaultPrevented).toBe(false);
  });
});
