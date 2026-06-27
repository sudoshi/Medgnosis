// =============================================================================
// Medgnosis Web — Admin EtlTab error-state safety test
// A failed /admin/etl-status fetch must surface a loud error, NEVER fall through
// to zeroed star-schema counts or "No ETL runs recorded" (reads as healthy).
// =============================================================================

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { EtlTab } from './EtlTab.js';
import type { EtlLog, Migration, StarCounts } from './types.js';

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

function renderEtlTab() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return render(
    <QueryClientProvider client={queryClient}>
      <EtlTab />
    </QueryClientProvider>,
  );
}

const starCounts: StarCounts = {
  composite_rows: '1000',
  bundle_rows: '2000',
  detail_rows: '3000',
  dim_patient_rows: '400',
  dim_provider_rows: '50',
  dim_bundle_rows: '12',
};

const etlLog: EtlLog = {
  source_system: 'edw',
  load_status: 'success',
  rows_inserted: 1234,
  created_at: '2026-06-26T00:00:00Z',
};

const migration: Migration = {
  migration_name: '092_ehr_capability_snapshot',
  applied_at: '2026-06-25T12:00:00Z',
};

beforeEach(() => {
  vi.clearAllMocks();
});

describe('EtlTab', () => {
  it('surfaces a loud error and NOT the empty states when etl-status fails', async () => {
    mockApiGet.mockRejectedValue(new Error('etl status unavailable'));

    renderEtlTab();

    const alerts = await screen.findAllByRole('alert');
    expect(alerts.length).toBeGreaterThan(0);
    expect(alerts[0]).toHaveTextContent(/couldn.t load/i);
    expect(screen.queryByText('No ETL runs recorded')).not.toBeInTheDocument();
    expect(screen.queryByText('No migrations tracked')).not.toBeInTheDocument();
    expect(screen.getAllByRole('button', { name: /retry/i }).length).toBeGreaterThan(0);
  });

  it('renders empty states (not the error) when etl-status loads empty', async () => {
    mockApiGet.mockResolvedValue({
      success: true,
      data: { etl_logs: [], migrations: [], star_counts: starCounts },
    });

    renderEtlTab();

    expect(await screen.findByText('No ETL runs recorded')).toBeInTheDocument();
    expect(screen.getByText('No migrations tracked')).toBeInTheDocument();
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it('renders ETL rows when etl-status loads with data', async () => {
    mockApiGet.mockResolvedValue({
      success: true,
      data: { etl_logs: [etlLog], migrations: [migration], star_counts: starCounts },
    });

    renderEtlTab();

    expect(await screen.findByText('fact_patient_composite')).toBeInTheDocument();
    expect(screen.getByText('092_ehr_capability_snapshot')).toBeInTheDocument();
    expect(screen.queryByText('No ETL runs recorded')).not.toBeInTheDocument();
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });
});
