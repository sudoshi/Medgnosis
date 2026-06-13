import { describe, it, expect } from 'vitest';
import { render } from '@testing-library/react';
import { Skeleton } from './skeleton.js';

describe('Skeleton', () => {
  it('applies the shimmer class', () => {
    const { container } = render(<Skeleton className="h-4 w-20" />);
    expect(container.firstChild).toHaveClass('skeleton');
    expect(container.firstChild).toHaveClass('h-4');
  });
});
