// =============================================================================
// Medgnosis Web — Auth E2E tests
// =============================================================================

import { test, expect } from '@playwright/test';
import {
  adminAuthTokens,
  mfaChallenge,
  mfaEnabledAdminUser,
  mockAuthenticatedShellApis,
  mockAuthProviderDiscovery,
} from './support/api-mocks.js';

test.describe('Authentication', () => {
  test.beforeEach(async ({ page }) => {
    await mockAuthProviderDiscovery(page);
  });

  test('redirects to login when not authenticated', async ({ page }) => {
    await page.goto('/dashboard');
    await expect(page).toHaveURL(/\/login/);
  });

  test('shows login form', async ({ page }) => {
    await page.goto('/login');
    await expect(page.locator('#lpg-email')).toBeVisible();
    await expect(page.locator('#lpg-pw')).toBeVisible();
    await expect(page.getByRole('button', { name: 'Sign in' })).toBeVisible();
  });

  test('shows error on invalid credentials', async ({ page }) => {
    await page.route('**/api/v1/auth/login', async (route) => {
      await route.fulfill({
        status: 401,
        contentType: 'application/json',
        body: JSON.stringify({
          success: false,
          error: {
            code: 'INVALID_CREDENTIALS',
            message: 'Invalid email or password',
          },
        }),
      });
    });

    await page.goto('/login');
    await page.locator('#lpg-email').fill('bad@example.com');
    await page.locator('#lpg-pw').fill('wrong');
    await page.getByRole('button', { name: 'Sign in' }).click();
    await expect(page.getByText(/error|failed|invalid/i)).toBeVisible();
  });

  test('requires MFA verification before persisting auth state', async ({ page }) => {
    await mockAuthenticatedShellApis(page);
    await page.route('**/api/v1/auth/login', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          success: true,
          data: mfaChallenge,
        }),
      });
    });
    await page.route('**/api/v1/auth/mfa/verify', async (route) => {
      const payload = await route.request().postDataJSON();
      expect(payload).toMatchObject({
        mfa_token: mfaChallenge.mfa_token,
        code: '123456',
      });
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          success: true,
          data: {
            user: mfaEnabledAdminUser,
            tokens: adminAuthTokens,
            mfa_required: false,
          },
        }),
      });
    });

    await page.goto('/login');
    await page.locator('#lpg-email').fill('admin@example.test');
    await page.locator('#lpg-pw').fill('correct-password');
    await page.getByRole('button', { name: 'Sign in' }).click();

    await expect(page.getByRole('heading', { name: 'Verify your code' })).toBeVisible();
    const storedBeforeMfa = await page.evaluate(() => window.localStorage.getItem('medgnosis-auth'));
    expect(storedBeforeMfa ?? '').not.toContain('access_token');

    await page.locator('#lpg-mfa').fill('123456');
    await page.getByRole('button', { name: 'Verify code' }).click();
    await expect(page).toHaveURL(/\/dashboard/);

    const storedAfterMfa = await page.evaluate(() => window.localStorage.getItem('medgnosis-auth'));
    expect(storedAfterMfa).toContain('e2e-admin-access-token');
  });
});
