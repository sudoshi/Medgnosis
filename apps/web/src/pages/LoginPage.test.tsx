import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { LoginPage } from './LoginPage.js';

const { mockApiGet, mockApiPost } = vi.hoisted(() => ({
  mockApiGet: vi.fn(),
  mockApiPost: vi.fn(),
}));

vi.mock('../services/api.js', () => ({
  api: {
    get: mockApiGet,
    post: mockApiPost,
  },
  apiErrorMessage: (_err: unknown, fallback: string) => fallback,
}));

function renderLoginPage() {
  return render(
    <MemoryRouter>
      <LoginPage />
    </MemoryRouter>,
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  mockApiPost.mockResolvedValue({ success: false, error: { message: 'Login failed' } });
});

describe('LoginPage auth exposure policy', () => {
  it('hides registration and demo quick-fill when discovery disables them', async () => {
    mockApiGet.mockResolvedValue({
      success: true,
      data: {
        local_enabled: true,
        oidc_enabled: false,
        oidc_label: null,
        oidc_redirect_path: null,
        registration_enabled: false,
        demo_quick_fill_enabled: false,
      },
    });

    renderLoginPage();

    await waitFor(() => expect(mockApiGet).toHaveBeenCalledWith('/auth/providers'));
    expect(screen.queryByRole('link', { name: /create account/i })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /demo account/i })).not.toBeInTheDocument();
  });

  it('shows registration and demo quick-fill when discovery enables them', async () => {
    const user = userEvent.setup();
    mockApiGet.mockResolvedValue({
      success: true,
      data: {
        local_enabled: true,
        oidc_enabled: false,
        oidc_label: null,
        oidc_redirect_path: null,
        registration_enabled: true,
        demo_quick_fill_enabled: true,
      },
    });

    renderLoginPage();

    expect(await screen.findByRole('link', { name: /create account/i })).toHaveAttribute('href', '/register');
    await user.click(screen.getByRole('button', { name: /demo account/i }));

    expect(screen.getByLabelText(/email address/i)).toHaveValue('admin@medgnosis.app');
    expect(screen.getByLabelText(/^password$/i)).toHaveValue('password');
  });
});
