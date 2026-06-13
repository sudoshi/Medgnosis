import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { Checkbox } from './checkbox.js';

describe('Checkbox', () => {
  it('renders an unchecked checkbox', () => {
    render(<Checkbox aria-label="agree" />);
    const el = screen.getByRole('checkbox', { name: 'agree' });
    expect(el).toBeInTheDocument();
    expect(el).toHaveAttribute('data-state', 'unchecked');
  });
});
