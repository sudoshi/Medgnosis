// =============================================================================
// Medgnosis Web — Typed API client
// Replaces Axios with native fetch + auth interceptor
// =============================================================================

import { useAuthStore } from '../stores/auth.js';
import type { ApiResponse } from '@medgnosis/shared';

const BASE_URL = '/api/v1';

async function readApiResponse<T>(response: Response): Promise<ApiResponse<T>> {
  if (response.status === 204) {
    return { success: response.ok } as ApiResponse<T>;
  }

  const text = await response.text();
  if (!text) {
    return { success: response.ok } as ApiResponse<T>;
  }

  return JSON.parse(text) as ApiResponse<T>;
}

async function request<T>(
  path: string,
  options: RequestInit = {},
): Promise<ApiResponse<T>> {
  const { tokens, clearAuth, updateTokens } = useAuthStore.getState();

  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...(options.headers as Record<string, string>),
  };

  if (tokens?.access_token) {
    headers['Authorization'] = `Bearer ${tokens.access_token}`;
  }

  let response = await fetch(`${BASE_URL}${path}`, {
    ...options,
    headers,
  });

  // Auto-refresh on 401
  if (response.status === 401 && tokens?.refresh_token) {
    const refreshResponse = await fetch(`${BASE_URL}/auth/refresh`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ refresh_token: tokens.refresh_token }),
    });

    if (refreshResponse.ok) {
      const refreshData = await readApiResponse<{
        tokens: { access_token: string; refresh_token: string; expires_in: number };
      }>(refreshResponse);
      if (refreshData.data?.tokens) {
        updateTokens(refreshData.data.tokens);
        headers['Authorization'] = `Bearer ${refreshData.data.tokens.access_token}`;
        response = await fetch(`${BASE_URL}${path}`, { ...options, headers });
      }
    } else {
      clearAuth();
      window.location.href = '/login';
    }
  }

  return readApiResponse<T>(response);
}

export const api = {
  get: <T>(path: string) => request<T>(path),

  post: <T>(path: string, body?: unknown) =>
    request<T>(path, {
      method: 'POST',
      body: body ? JSON.stringify(body) : undefined,
    }),

  put: <T>(path: string, body?: unknown) =>
    request<T>(path, {
      method: 'PUT',
      body: body ? JSON.stringify(body) : undefined,
    }),

  patch: <T>(path: string, body?: unknown) =>
    request<T>(path, {
      method: 'PATCH',
      body: body ? JSON.stringify(body) : undefined,
    }),

  delete: <T>(path: string) => request<T>(path, { method: 'DELETE' }),
};
