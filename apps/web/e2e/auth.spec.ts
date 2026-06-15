// =============================================================================
// Medgnosis Web — Auth E2E tests
// =============================================================================

import { test, expect } from '@playwright/test';

test.describe('Authentication', () => {
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
});
