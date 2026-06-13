import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { Popover, PopoverContent, PopoverTrigger } from './popover.js';

describe('Popover', () => {
  it('renders a closed trigger', () => {
    render(
      <Popover>
        <PopoverTrigger>Filters</PopoverTrigger>
        <PopoverContent>body</PopoverContent>
      </Popover>,
    );
    expect(screen.getByRole('button', { name: 'Filters' })).toBeInTheDocument();
  });
});
