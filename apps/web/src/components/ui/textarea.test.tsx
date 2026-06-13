import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { Textarea } from './textarea.js';

describe('Textarea', () => {
  it('renders a textbox with rows', () => {
    render(<Textarea rows={4} aria-label="notes" />);
    const el = screen.getByRole('textbox', { name: 'notes' });
    expect(el).toBeInTheDocument();
    expect(el).toHaveAttribute('rows', '4');
  });
});
