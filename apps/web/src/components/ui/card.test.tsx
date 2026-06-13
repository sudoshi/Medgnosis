import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { Card, CardContent, CardHeader, CardTitle } from './card.js';

describe('Card', () => {
  it('renders title and content', () => {
    render(
      <Card>
        <CardHeader>
          <CardTitle>Population</CardTitle>
        </CardHeader>
        <CardContent>42 patients</CardContent>
      </Card>,
    );
    expect(screen.getByText('Population')).toBeInTheDocument();
    expect(screen.getByText('42 patients')).toBeInTheDocument();
  });
});
