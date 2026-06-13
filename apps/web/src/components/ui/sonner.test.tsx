import { describe, it, expect } from 'vitest';
import { render } from '@testing-library/react';
import { Toaster } from './sonner.js';

describe('Toaster', () => {
  it('mounts without crashing and renders a toaster section', () => {
    expect(() => render(<Toaster />)).not.toThrow();
    // sonner wraps its toasts in an aria-labelled section
    expect(document.querySelector('section[aria-label]')).toBeInTheDocument();
  });
});
