import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { Input } from './input.js';

describe('Input', () => {
  it('renders with placeholder and value', () => {
    render(<Input placeholder="Search measures" defaultValue="abc" aria-label="q" />);
    const el = screen.getByLabelText('q') as HTMLInputElement;
    expect(el).toBeInTheDocument();
    expect(el).toHaveAttribute('placeholder', 'Search measures');
    expect(el.value).toBe('abc');
  });
});
