import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { Badge } from './badge.js';

describe('Badge', () => {
  it('renders with the crimson variant class', () => {
    render(<Badge variant="crimson">Overdue</Badge>);
    const el = screen.getByText('Overdue');
    expect(el).toBeInTheDocument();
    expect(el.className).toContain('text-crimson');
  });
});
