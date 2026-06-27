// =============================================================================
// Medgnosis Web — Admin UsersTab error-state safety test
// A failed /admin/users fetch must surface a loud error, NEVER fall through to
// "No users found" (which would silently read as "no accounts exist").
// =============================================================================

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { UsersTab } from './UsersTab.js';
import type { AdminUser } from './types.js';

const { mockApiGet, mockApiPost, mockApiDelete } = vi.hoisted(() => ({
  mockApiGet: vi.fn(),
  mockApiPost: vi.fn(),
  mockApiDelete: vi.fn(),
}));

vi.mock('../../services/api.js', () => ({
  api: { get: mockApiGet, post: mockApiPost, delete: mockApiDelete },
  apiErrorMessage: (_err: unknown, fallback: string) => fallback,
}));

vi.mock('../../stores/ui.js', () => ({
  useToast: () => ({ success: vi.fn(), error: vi.fn(), warning: vi.fn() }),
}));

function renderUsersTab() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return render(
    <QueryClientProvider client={queryClient}>
      <UsersTab />
    </QueryClientProvider>,
  );
}

const sampleUser: AdminUser = {
  id: 'u1',
  email: 'clinician@acumenus.net',
  first_name: 'Casey',
  last_name: 'Provider',
  role: 'provider',
  is_active: true,
  created_at: '2026-06-26T00:00:00Z',
  last_login_at: '2026-06-26T12:00:00Z',
  provider_first_name: null,
  provider_last_name: null,
  pending_invite: null,
};

beforeEach(() => {
  vi.clearAllMocks();
});

describe('UsersTab', () => {
  it('surfaces a loud error and NOT "No users found" when the user list fails', async () => {
    mockApiGet.mockRejectedValue(new Error('user list unavailable'));

    renderUsersTab();

    expect(await screen.findByRole('alert')).toHaveTextContent(/couldn.t load the user list/i);
    expect(screen.queryByText('No users found')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: /retry/i })).toBeInTheDocument();
  });

  it('renders "No users found" (not the error) when the list loads empty', async () => {
    mockApiGet.mockResolvedValue({ success: true, data: { users: [] } });

    renderUsersTab();

    expect(await screen.findByText('No users found')).toBeInTheDocument();
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it('renders user rows when the list loads with data', async () => {
    mockApiGet.mockResolvedValue({ success: true, data: { users: [sampleUser] } });

    renderUsersTab();

    expect(await screen.findByText('Casey Provider')).toBeInTheDocument();
    expect(screen.queryByText('No users found')).not.toBeInTheDocument();
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });
});
