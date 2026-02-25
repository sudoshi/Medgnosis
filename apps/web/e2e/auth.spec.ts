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
    await expect(page.getByPlaceholder('Enter your email')).toBeVisible();
    await expect(page.getByPlaceholder('Enter your password')).toBeVisible();
    await expect(page.getByRole('button', { name: 'Sign in' })).toBeVisible();
  });

  test('shows error on invalid credentials', async ({ page }) => {
    await page.goto('/login');
    await page.getByPlaceholder('Enter your email').fill('bad@example.com');
    await page.getByPlaceholder('Enter your password').fill('wrong');
    await page.getByRole('button', { name: 'Sign in' }).click();
    await expect(page.getByText(/error|failed|invalid/i)).toBeVisible();
  });
});
