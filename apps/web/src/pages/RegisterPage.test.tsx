import { render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { RegisterPage } from './RegisterPage.js';

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

function renderRegisterPage() {
  return render(
    <MemoryRouter>
      <RegisterPage />
    </MemoryRouter>,
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  mockApiPost.mockResolvedValue({ success: true, data: { message: 'ok' } });
});

describe('RegisterPage auth exposure policy', () => {
  it('blocks direct registration page access when discovery disables registration', async () => {
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

    renderRegisterPage();

    expect(await screen.findByText(/account access is invite-only/i)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /create account/i })).not.toBeInTheDocument();
    expect(mockApiPost).not.toHaveBeenCalled();
  });

  it('shows the registration form when discovery enables registration', async () => {
    mockApiGet.mockResolvedValue({
      success: true,
      data: {
        local_enabled: true,
        oidc_enabled: false,
        oidc_label: null,
        oidc_redirect_path: null,
        registration_enabled: true,
        demo_quick_fill_enabled: false,
      },
    });

    renderRegisterPage();

    await waitFor(() => expect(mockApiGet).toHaveBeenCalledWith('/auth/providers'));
    expect(screen.getByRole('heading', { name: /create your account/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /create account/i })).toBeInTheDocument();
  });
});
