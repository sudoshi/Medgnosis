// =============================================================================
// Medgnosis Web — Admin IdentityReviewTab error-state safety test
// A failed /admin/identity/reviews fetch must surface a loud error, NEVER fall
// through to "No open reviews" (a steward would miss pending merge adjudication).
// =============================================================================

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { IdentityReviewTab } from './IdentityReviewTab.js';
import type { IdentityReview } from './IdentityReviewTab.js';

const { mockApiGet, mockApiPost } = vi.hoisted(() => ({
  mockApiGet: vi.fn(),
  mockApiPost: vi.fn(),
}));

vi.mock('../../services/api.js', () => ({
  api: { get: mockApiGet, post: mockApiPost },
  apiErrorMessage: (_err: unknown, fallback: string) => fallback,
}));

vi.mock('../../stores/ui.js', () => ({
  useToast: () => ({ success: vi.fn(), error: vi.fn(), warning: vi.fn() }),
}));

function renderIdentityReviewTab() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return render(
    <QueryClientProvider client={queryClient}>
      <IdentityReviewTab />
    </QueryClientProvider>,
  );
}

const sampleReview: IdentityReview = {
  id: 7,
  reason: 'demographic_only_match',
  sourceSystem: 'epic',
  demographicKey: 'abc',
  createdAt: '2026-06-26T00:00:00Z',
  persons: [
    {
      personId: 101,
      firstName: 'Jordan',
      lastName: 'Rivera',
      dateOfBirth: '1980-01-01',
      sex: 'F',
      status: 'active',
      linkedPatientCount: 2,
      identifiers: [],
    },
    {
      personId: 102,
      firstName: 'Jordan',
      lastName: 'Rivera',
      dateOfBirth: '1980-01-01',
      sex: 'F',
      status: 'provisional',
      linkedPatientCount: 1,
      identifiers: [],
    },
  ],
};

// reviews is the protected list; metrics/merges are secondary and resolve empty.
function resolveSecondaryQueries() {
  mockApiGet.mockImplementation((path: string) => {
    if (path === '/admin/identity/metrics') {
      return Promise.resolve({ success: true, data: { metrics: null } });
    }
    if (path === '/admin/identity/merges') {
      return Promise.resolve({ success: true, data: { merges: [] } });
    }
    return Promise.reject(new Error(`unexpected path ${path}`));
  });
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe('IdentityReviewTab', () => {
  it('surfaces a loud error and NOT "No open reviews" when the review queue fails', async () => {
    mockApiGet.mockImplementation((path: string) => {
      if (path === '/admin/identity/reviews') {
        return Promise.reject(new Error('review queue unavailable'));
      }
      if (path === '/admin/identity/metrics') {
        return Promise.resolve({ success: true, data: { metrics: null } });
      }
      return Promise.resolve({ success: true, data: { merges: [] } });
    });

    renderIdentityReviewTab();

    expect(await screen.findByRole('alert')).toHaveTextContent(/couldn.t load the identity review queue/i);
    expect(screen.queryByText('No open reviews')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: /retry/i })).toBeInTheDocument();
  });

  it('renders "No open reviews" (not the error) when the queue loads empty', async () => {
    mockApiGet.mockImplementation((path: string) => {
      if (path === '/admin/identity/reviews') {
        return Promise.resolve({ success: true, data: { reviews: [] } });
      }
      if (path === '/admin/identity/metrics') {
        return Promise.resolve({ success: true, data: { metrics: null } });
      }
      return Promise.resolve({ success: true, data: { merges: [] } });
    });

    renderIdentityReviewTab();

    expect(await screen.findByText('No open reviews')).toBeInTheDocument();
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it('renders review cards when the queue loads with data', async () => {
    resolveSecondaryQueries();
    mockApiGet.mockImplementation((path: string) => {
      if (path === '/admin/identity/reviews') {
        return Promise.resolve({ success: true, data: { reviews: [sampleReview] } });
      }
      if (path === '/admin/identity/metrics') {
        return Promise.resolve({ success: true, data: { metrics: null } });
      }
      return Promise.resolve({ success: true, data: { merges: [] } });
    });

    renderIdentityReviewTab();

    expect(await screen.findByText('Merge into selected')).toBeInTheDocument();
    expect(screen.queryByText('No open reviews')).not.toBeInTheDocument();
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });
});
