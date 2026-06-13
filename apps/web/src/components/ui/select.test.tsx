import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from './select.js';

describe('Select', () => {
  it('renders a closed trigger showing the placeholder', () => {
    render(
      <Select>
        <SelectTrigger aria-label="status">
          <SelectValue placeholder="Any status" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="active">Active</SelectItem>
        </SelectContent>
      </Select>,
    );
    expect(screen.getByLabelText('status')).toHaveTextContent('Any status');
  });
});
