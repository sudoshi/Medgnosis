import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { SeverityBadge } from './SeverityBadge.js';

describe('SeverityBadge', () => {
  it('renders a text label (never color-only) for each severity', () => {
    render(<SeverityBadge severity="critical" />);
    expect(screen.getByText('Critical')).toBeInTheDocument();
  });

  it('uses the crimson badge token for critical', () => {
    const { container } = render(<SeverityBadge severity="critical" />);
    expect(container.querySelector('.badge-crimson')).toBeTruthy();
  });

  it('shows a domain label but keeps the severity level in the accessible name', () => {
    render(<SeverityBadge severity="critical" label="RRT" />);
    const el = screen.getByText('RRT');
    expect(el).toBeInTheDocument();
    // accessible name keeps the level explicit for screen readers / CVD users
    expect(screen.getByLabelText('Critical: RRT')).toBeInTheDocument();
  });

  it('renders an icon (redundant non-color cue) alongside the text', () => {
    const { container } = render(<SeverityBadge severity="high" />);
    expect(container.querySelector('svg')).toBeTruthy();
    expect(screen.getByText('High')).toBeInTheDocument();
  });
});
