// =============================================================================
// Medgnosis Web — Admin AuditTab error-state safety test
// A failed /admin/audit-log fetch must surface a loud error, NEVER fall through
// to "No events found" (which would silently read as "no audit activity").
// =============================================================================

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { AuditTab } from './AuditTab.js';
import type { AuditLog } from './types.js';

const { mockApiGet } = vi.hoisted(() => ({
  mockApiGet: vi.fn(),
}));

vi.mock('../../services/api.js', () => ({
  api: { get: mockApiGet },
}));

function renderAuditTab() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return render(
    <QueryClientProvider client={queryClient}>
      <AuditTab />
    </QueryClientProvider>,
  );
}

const sampleLog: AuditLog = {
  audit_id: 1,
  event_type: 'login',
  user_email: 'admin@acumenus.net',
  user_first_name: 'Admin',
  user_last_name: 'User',
  target_type: 'session',
  target_id: null,
  description: 'Signed in',
  ip_address: '127.0.0.1',
  created_at: '2026-06-26T00:00:00Z',
};

beforeEach(() => {
  vi.clearAllMocks();
});

describe('AuditTab', () => {
  it('surfaces a loud error and NOT "No events found" when the audit log fails', async () => {
    mockApiGet.mockRejectedValue(new Error('audit log unavailable'));

    renderAuditTab();

    expect(await screen.findByRole('alert')).toHaveTextContent(/couldn.t load the audit log/i);
    expect(screen.queryByText('No events found')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: /retry/i })).toBeInTheDocument();
  });

  it('renders "No events found" (not the error) when the log loads empty', async () => {
    mockApiGet.mockResolvedValue({ success: true, data: { logs: [], total: 0 } });

    renderAuditTab();

    expect(await screen.findByText('No events found')).toBeInTheDocument();
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it('renders audit rows when the log loads with data', async () => {
    mockApiGet.mockResolvedValue({ success: true, data: { logs: [sampleLog], total: 1 } });

    renderAuditTab();

    expect(await screen.findByText('Signed in')).toBeInTheDocument();
    expect(screen.queryByText('No events found')).not.toBeInTheDocument();
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });
});
