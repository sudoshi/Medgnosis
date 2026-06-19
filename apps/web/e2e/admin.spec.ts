// =============================================================================
// Medgnosis Web - Admin E2E smoke tests
// =============================================================================

import { test, expect } from '@playwright/test';
import {
  mockAdminApis,
  mockAuthenticatedShellApis,
  seedAuthenticatedSession,
} from './support/api-mocks.js';

test.describe('Admin', () => {
  test.beforeEach(async ({ page }) => {
    await seedAuthenticatedSession(page);
    await mockAuthenticatedShellApis(page);
    await mockAdminApis(page);
  });

  test('loads the admin dashboard for an authenticated admin', async ({ page }) => {
    await page.goto('/admin');

    await expect(page.getByRole('heading', { name: 'Admin Panel' })).toBeVisible();
    await expect(page.getByText('Total Providers')).toBeVisible();
    await expect(page.getByText('Active Patients')).toBeVisible();
    await expect(page.getByText('Star Schema Health')).toBeVisible();
    await expect(page.getByText('Recent Activity')).toBeVisible();
    await expect(page.getByText('Admin signed in')).toBeVisible();
  });

  test('loads the Users tab with active and pending invite rows', async ({ page }) => {
    await page.goto('/admin');
    await page.getByRole('button', { name: 'Users' }).click();

    await expect(page.getByRole('heading', { name: 'Users' })).toBeVisible();
    await expect(page.getByText('admin@example.test')).toBeVisible();
    await expect(page.getByText('pending.clinician@example.test')).toBeVisible();
    await expect(page.getByText('Invite pending')).toBeVisible();
    await expect(page.getByRole('button', { name: 'Resend invite to Pending Clinician' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Revoke invite for Pending Clinician' })).toBeVisible();
  });

  test('revokes a pending invite from the Users tab', async ({ page }) => {
    await page.goto('/admin');
    await page.getByRole('button', { name: 'Users' }).click();

    await page.getByRole('button', { name: 'Revoke invite for Pending Clinician' }).click();
    await expect(page.getByRole('heading', { name: 'Revoke invite for Pending Clinician?' })).toBeVisible();
    await page.getByRole('button', { name: 'Revoke invite', exact: true }).click();

    await expect(page.getByText('Invite revoked')).toBeVisible();
  });
});
