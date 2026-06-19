// =============================================================================
// Medgnosis Web — Navigation E2E tests
// =============================================================================

import { test, expect } from '@playwright/test';
import { mockAuthProviderDiscovery } from './support/api-mocks.js';

test.describe('Navigation', () => {
  test.beforeEach(async ({ page }) => {
    await mockAuthProviderDiscovery(page);
  });

  test('login page renders with branding', async ({ page }) => {
    await page.goto('/login');
    await expect(page.getByText('Medgnosis')).toBeVisible();
    await expect(page.getByText('Welcome back')).toBeVisible();
  });

  test('404 page renders for unknown routes', async ({ page }) => {
    await page.goto('/nonexistent-route');
    await expect(page.getByText('404')).toBeVisible();
    await expect(page.getByText('Page not found')).toBeVisible();
  });
});
