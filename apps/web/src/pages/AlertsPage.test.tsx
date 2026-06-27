// =============================================================================
// Medgnosis Web — AlertsPage error-state safety test
// A failed /alerts fetch must surface a loud error, NEVER fall through to the
// "No alerts" empty state (which would silently read as "all clear").
// =============================================================================

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';
import { render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AlertsPage } from './AlertsPage.js';

const { mockApiGet, mockApiPost } = vi.hoisted(() => ({
  mockApiGet: vi.fn(),
  mockApiPost: vi.fn(),
}));

vi.mock('../services/api.js', () => ({
  api: { get: mockApiGet, post: mockApiPost },
}));

vi.mock('../stores/ui.js', () => ({
  useToast: () => ({ success: vi.fn(), error: vi.fn() }),
}));

function renderAlertsPage() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter>
        <AlertsPage />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  vi.clearAllMocks();
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('AlertsPage', () => {
  it('surfaces a loud error and NOT the empty state when the feed fails to load', async () => {
    mockApiGet.mockRejectedValue(new Error('network down'));

    renderAlertsPage();

    // The shared QueryError renders role="alert".
    expect(await screen.findByRole('alert')).toHaveTextContent(/couldn.t load alerts/i);
    // Critically: the empty state must not appear on error.
    expect(screen.queryByText('No alerts')).not.toBeInTheDocument();
    // A retry affordance is offered.
    expect(screen.getByRole('button', { name: /retry/i })).toBeInTheDocument();
  });

  it('renders the empty state (not the error) when the feed loads with no alerts', async () => {
    mockApiGet.mockResolvedValue({ success: true, data: [] });

    renderAlertsPage();

    expect(await screen.findByText('No alerts')).toBeInTheDocument();
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });
});
