// =============================================================================
// Medgnosis Web - role-based workflow E2E tests
// =============================================================================

import { test, expect, type Page } from '@playwright/test';
import {
  analystAuthTokens,
  analystUser,
  mockProtectedRouteSmokeApis,
  providerAuthTokens,
  providerUser,
  seedAuthenticatedSession,
  standardAdminAuthTokens,
  standardAdminUser,
  superAdminAuthTokens,
  superAdminUser,
} from './support/api-mocks.js';

async function seedRoleSession(
  page: Page,
  user: Record<string, unknown>,
  tokens: Record<string, unknown>,
  unhandledApiRequests: string[],
) {
  await seedAuthenticatedSession(page, user, tokens);
  await mockProtectedRouteSmokeApis(page, unhandledApiRequests);
}

test.describe('Role-based workflows', () => {
  test('keeps a provider in clinical workflows and redirects direct admin access', async ({ page }) => {
    const unhandledApiRequests: string[] = [];
    await seedRoleSession(page, providerUser, providerAuthTokens, unhandledApiRequests);

    await page.goto('/dashboard');
    await expect(page.getByRole('heading', { name: /Good (morning|afternoon|evening), Dr\. Provider/ })).toBeVisible();
    await expect(page.getByRole('link', { name: 'Admin' })).toHaveCount(0);

    await page.goto('/patients/123');
    await expect(page.getByRole('heading', { name: 'Launch, Ehr' })).toBeVisible();
    await expect(page).not.toHaveURL(/\/login(?:[?#]|$)/);

    await page.goto('/admin');
    await expect(page).toHaveURL(/\/dashboard$/);
    await expect(page.getByRole('heading', { name: /Good (morning|afternoon|evening), Dr\. Provider/ })).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Admin Panel' })).toHaveCount(0);

    expect(unhandledApiRequests).toEqual([]);
  });

  test('lets an analyst use population workflows without exposing admin navigation', async ({ page }) => {
    const unhandledApiRequests: string[] = [];
    await seedRoleSession(page, analystUser, analystAuthTokens, unhandledApiRequests);

    await page.goto('/measures');
    await expect(page.getByRole('heading', { name: 'Quality Measures' })).toBeVisible();
    await expect(page.getByRole('button', { name: /CMS122 Diabetes: Hemoglobin/ })).toBeVisible();
    await expect(page.getByRole('link', { name: 'Admin' })).toHaveCount(0);

    await page.goto('/population-finder');
    await expect(page.getByRole('heading', { name: 'Population Finder' })).toBeVisible();
    await expect(page).not.toHaveURL(/\/login(?:[?#]|$)/);

    await page.goto('/admin');
    await expect(page).toHaveURL(/\/dashboard$/);
    await expect(page.getByRole('heading', { name: /Good (morning|afternoon|evening), Dr\. Analyst/ })).toBeVisible();

    expect(unhandledApiRequests).toEqual([]);
  });

  test('shows admin operations to admins while reserving auth-provider governance for super-admins', async ({ page }) => {
    const unhandledAdminApiRequests: string[] = [];
    await seedRoleSession(page, standardAdminUser, standardAdminAuthTokens, unhandledAdminApiRequests);

    await page.goto('/admin');
    await expect(page.getByRole('heading', { name: 'Admin Panel' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Users' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'System Health' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'EHR Integrations' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Auth Providers' })).toHaveCount(0);
    expect(unhandledAdminApiRequests).toEqual([]);

    const unhandledSuperAdminApiRequests: string[] = [];
    await page.unroute('**/api/v1/**');
    await seedRoleSession(page, superAdminUser, superAdminAuthTokens, unhandledSuperAdminApiRequests);

    await page.goto('/admin');
    await expect(page.getByRole('heading', { name: 'Admin Panel' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Auth Providers' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Users' })).toBeVisible();
    expect(unhandledSuperAdminApiRequests).toEqual([]);
  });
});
