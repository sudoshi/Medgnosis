import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { Switch } from './switch.js';

describe('Switch', () => {
  it('renders a switch in the off state', () => {
    render(<Switch aria-label="notifications" />);
    const el = screen.getByRole('switch', { name: 'notifications' });
    expect(el).toBeInTheDocument();
    expect(el).toHaveAttribute('data-state', 'unchecked');
  });
});
