// =============================================================================
// Medgnosis Web — Navigation E2E tests
// =============================================================================

import { test, expect } from '@playwright/test';

test.describe('Navigation', () => {
  // NOTE: These tests require a running API with valid test credentials.
  // In CI, a test login helper should be used.

  test('login page renders with branding', async ({ page }) => {
    await page.goto('/login');
    await expect(page.getByText('Medgnosis')).toBeVisible();
    await expect(page.getByText('Population Health Management')).toBeVisible();
  });

  test('404 page renders for unknown routes', async ({ page }) => {
    await page.goto('/nonexistent-route');
    await expect(page.getByText('404')).toBeVisible();
    await expect(page.getByText('Page not found')).toBeVisible();
  });
});
