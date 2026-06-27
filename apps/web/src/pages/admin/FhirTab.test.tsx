// =============================================================================
// Medgnosis Web — Admin FhirTab error-state safety test
// A failed /admin/fhir-endpoints fetch must surface a loud error, NEVER fall
// through to "No FHIR endpoints configured" (which masks live EHR links).
// =============================================================================

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { FhirTab } from './FhirTab.js';
import type { FhirEndpoint } from './types.js';

const { mockApiGet, mockApiPost, mockApiPatch, mockApiDelete } = vi.hoisted(() => ({
  mockApiGet: vi.fn(),
  mockApiPost: vi.fn(),
  mockApiPatch: vi.fn(),
  mockApiDelete: vi.fn(),
}));

vi.mock('../../services/api.js', () => ({
  api: { get: mockApiGet, post: mockApiPost, patch: mockApiPatch, delete: mockApiDelete },
  apiErrorMessage: (_err: unknown, fallback: string) => fallback,
}));

vi.mock('../../stores/ui.js', () => ({
  useToast: () => ({ success: vi.fn(), error: vi.fn(), warning: vi.fn() }),
}));

function renderFhirTab() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return render(
    <QueryClientProvider client={queryClient}>
      <FhirTab />
    </QueryClientProvider>,
  );
}

const sampleEndpoint: FhirEndpoint = {
  endpoint_id: 1,
  name: 'Epic Sandbox',
  ehr_type: 'epic',
  base_url: 'https://fhir.epic.example/api/FHIR/R4',
  auth_type: 'oauth2',
  status: 'connected',
  version: 'R4',
  patients_linked: 42,
  last_sync_at: '2026-06-26T00:00:00Z',
  notes: null,
};

beforeEach(() => {
  vi.clearAllMocks();
});

describe('FhirTab', () => {
  it('surfaces a loud error and NOT the empty state when the endpoint list fails', async () => {
    mockApiGet.mockRejectedValue(new Error('fhir endpoints unavailable'));

    renderFhirTab();

    expect(await screen.findByRole('alert')).toHaveTextContent(/couldn.t load fhir endpoints/i);
    expect(screen.queryByText('No FHIR endpoints configured')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: /retry/i })).toBeInTheDocument();
  });

  it('renders the empty state (not the error) when the list loads empty', async () => {
    mockApiGet.mockResolvedValue({ success: true, data: { endpoints: [] } });

    renderFhirTab();

    expect(await screen.findByText('No FHIR endpoints configured')).toBeInTheDocument();
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it('renders endpoint rows when the list loads with data', async () => {
    mockApiGet.mockResolvedValue({ success: true, data: { endpoints: [sampleEndpoint] } });

    renderFhirTab();

    expect(await screen.findByText('Epic Sandbox')).toBeInTheDocument();
    expect(screen.queryByText('No FHIR endpoints configured')).not.toBeInTheDocument();
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });
});
