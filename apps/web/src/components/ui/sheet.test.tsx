import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { Sheet, SheetContent, SheetDescription, SheetTitle } from './sheet.js';

describe('Sheet', () => {
  it('renders an open sheet with a title', () => {
    render(
      <Sheet defaultOpen>
        <SheetContent>
          <SheetTitle>Order panel</SheetTitle>
          <SheetDescription>Review and submit the order.</SheetDescription>
        </SheetContent>
      </Sheet>,
    );
    expect(screen.getByRole('dialog')).toBeInTheDocument();
    expect(screen.getByText('Order panel')).toBeInTheDocument();
  });
});
