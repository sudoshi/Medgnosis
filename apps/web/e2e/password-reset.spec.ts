// =============================================================================
// Medgnosis Web - Password reset E2E tests
// =============================================================================

import { test, expect } from '@playwright/test';
import { mockAuthProviderDiscovery } from './support/api-mocks.js';

test.describe('Password reset', () => {
  test.beforeEach(async ({ page }) => {
    await mockAuthProviderDiscovery(page);
  });

  test('links from login to the password reset request form', async ({ page }) => {
    let requestBody: unknown;

    await page.route('**/api/v1/auth/request-password-reset', async (route) => {
      requestBody = route.request().postDataJSON();
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          success: true,
          data: {
            message: 'If this email is eligible for password reset, instructions have been sent to your inbox.',
          },
        }),
      });
    });

    await page.goto('/login');
    await page.getByRole('link', { name: 'Forgot password?' }).click();

    await expect(page).toHaveURL(/\/reset-password$/);
    await expect(page.getByRole('heading', { name: 'Recover your account' })).toBeVisible();
    await page.locator('#rpg-email').fill('clinician@example.test');
    await page.getByRole('button', { name: 'Send reset link' }).click();

    await expect(page.locator('.rpg-success')).toContainText('eligible for password reset');
    expect(requestBody).toEqual({ email: 'clinician@example.test' });
  });

  test('sets a new password and redirects to login', async ({ page }) => {
    let resetBody: unknown;

    await page.route('**/api/v1/auth/reset-password', async (route) => {
      resetBody = route.request().postDataJSON();
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          success: true,
          data: { message: 'Password reset successfully. Sign in with your new password.' },
        }),
      });
    });

    await page.goto('/reset-password?token=reset-token-1234567890');
    await expect(page.getByRole('heading', { name: 'Reset your password' })).toBeVisible();
    await page.locator('#rpg-password').fill('ValidPass123!');
    await page.locator('#rpg-confirm-password').fill('ValidPass123!');
    await page.getByRole('button', { name: 'Reset password' }).click();

    await expect(page.locator('.rpg-success')).toContainText('Password reset successfully');
    await expect(page).toHaveURL(/\/login$/);
    expect(resetBody).toEqual({
      token: 'reset-token-1234567890',
      password: 'ValidPass123!',
    });
  });

  test('shows reset API errors and stays on the reset page', async ({ page }) => {
    await page.route('**/api/v1/auth/reset-password', async (route) => {
      await route.fulfill({
        status: 400,
        contentType: 'application/json',
        body: JSON.stringify({
          success: false,
          error: {
            code: 'RESET_TOKEN_INVALID',
            message: 'Reset link is invalid or expired',
          },
        }),
      });
    });

    await page.goto('/reset-password?token=expired-reset-token');
    await page.locator('#rpg-password').fill('ValidPass123!');
    await page.locator('#rpg-confirm-password').fill('ValidPass123!');
    await page.getByRole('button', { name: 'Reset password' }).click();

    await expect(page).toHaveURL(/\/reset-password\?token=expired-reset-token$/);
    await expect(page.locator('.rpg-error')).toContainText('Reset link is invalid or expired');
  });
});
