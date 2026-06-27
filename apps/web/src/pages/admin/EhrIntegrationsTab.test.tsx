// =============================================================================
// Medgnosis Web — Admin EhrIntegrationsTab error-state safety test
// A failed /ehr/admin/tenants fetch must surface a loud error, NEVER fall
// through to "No EHR tenants registered" (which reads as a clean registry).
// =============================================================================

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { EhrIntegrationsTab } from './EhrIntegrationsTab.js';
import type { EhrTenant } from './types.js';

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

function renderEhrTab() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return render(
    <QueryClientProvider client={queryClient}>
      <EhrIntegrationsTab />
    </QueryClientProvider>,
  );
}

const sampleTenant: EhrTenant = {
  id: 1,
  orgId: null,
  vendor: 'smart_generic',
  name: 'SMART Sandbox',
  environment: 'sandbox',
  fhirBaseUrl: 'https://launch.smarthealthit.org/v/r4/fhir',
  smartConfigUrl: null,
  issuer: null,
  audience: null,
  status: 'testing',
  createdAt: '2026-06-26T00:00:00Z',
  updatedAt: '2026-06-26T00:00:00Z',
};

beforeEach(() => {
  vi.clearAllMocks();
});

describe('EhrIntegrationsTab', () => {
  it('surfaces a loud error and NOT "No EHR tenants registered" when the registry fails', async () => {
    // Only the tenant-registry list is queried until a tenant is selected.
    mockApiGet.mockRejectedValue(new Error('tenant registry unavailable'));

    renderEhrTab();

    expect(await screen.findByRole('alert')).toHaveTextContent(/couldn.t load the ehr tenant registry/i);
    expect(screen.queryByText('No EHR tenants registered')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: /retry/i })).toBeInTheDocument();
  });

  it('renders "No EHR tenants registered" (not the error) when the registry loads empty', async () => {
    mockApiGet.mockImplementation((path: string) => {
      if (path.startsWith('/ehr/admin/tenants')) {
        return Promise.resolve({ success: true, data: { tenants: [], count: 0 } });
      }
      return Promise.resolve({ success: true, data: {} });
    });

    renderEhrTab();

    expect(await screen.findByText('No EHR tenants registered')).toBeInTheDocument();
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it('renders tenant rows when the registry loads with data', async () => {
    mockApiGet.mockImplementation((path: string) => {
      if (path.match(/^\/ehr\/admin\/tenants(\?|$)/)) {
        return Promise.resolve({ success: true, data: { tenants: [sampleTenant], count: 1 } });
      }
      // Detail and sub-resource queries fire once the first tenant auto-selects.
      return Promise.resolve({ success: true, data: {} });
    });

    renderEhrTab();

    expect(await screen.findByText('SMART Sandbox')).toBeInTheDocument();
    expect(screen.queryByText('No EHR tenants registered')).not.toBeInTheDocument();
  });
});
