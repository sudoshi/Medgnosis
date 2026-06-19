// =============================================================================
// Medgnosis Web - Settings E2E smoke tests
// =============================================================================

import { test, expect } from '@playwright/test';
import {
  mockAuthenticatedShellApis,
  mockSettingsApis,
  seedAuthenticatedSession,
} from './support/api-mocks.js';

test.describe('Settings', () => {
  test.beforeEach(async ({ page }) => {
    await seedAuthenticatedSession(page);
    await mockAuthenticatedShellApis(page);
    await mockSettingsApis(page);
  });

  test('shows active sessions and revokes another device session', async ({ page }) => {
    await page.goto('/settings');
    await page.getByRole('button', { name: 'Security' }).click();

    await expect(page.getByRole('heading', { name: 'Active sessions' })).toBeVisible();
    await expect(page.getByText('Current')).toBeVisible();
    await expect(page.getByText('Chrome browser')).toBeVisible();
    await expect(page.getByText('Safari browser')).toBeVisible();
    await expect(page.getByText('IP 203.0.113.10')).toBeVisible();

    await page.getByRole('button', { name: 'Revoke' }).click();
    await expect(page.getByRole('heading', { name: 'Revoke this session?' })).toBeVisible();
    await page.getByRole('button', { name: 'Revoke session' }).click();

    await expect(page.getByText('Session revoked')).toBeVisible();
  });

  test('enables and disables two-factor authentication', async ({ page }) => {
    await page.goto('/settings');
    await page.getByRole('button', { name: 'Security' }).click();

    await page.getByRole('button', { name: 'Enable 2FA' }).click();
    await expect(page.getByRole('heading', { name: 'Set up two-factor authentication' })).toBeVisible();
    await expect(page.getByText('JBSWY3DPEHPK3PXP')).toBeVisible();

    await page.locator('#mfa-setup-code').fill('123456');
    await page.getByRole('button', { name: 'Verify and enable' }).click();

    await expect(page.getByText('Two-factor authentication enabled')).toBeVisible();
    await expect(page.getByText('MG-ABCDEFGH-234567AB')).toBeVisible();
    await page.getByRole('button', { name: 'Done' }).click();

    await expect(page.getByText('Enabled', { exact: true })).toBeVisible();
    await page.getByRole('button', { name: 'Disable 2FA' }).click();
    await expect(page.getByRole('heading', { name: 'Disable two-factor authentication?' })).toBeVisible();
    await page.locator('#mfa-disable-code').fill('123456');
    await page.getByRole('button', { name: 'Disable 2FA' }).last().click();

    await expect(page.getByText('Two-factor authentication disabled')).toBeVisible();
    await expect(page.getByRole('button', { name: 'Enable 2FA' })).toBeVisible();
  });
});
