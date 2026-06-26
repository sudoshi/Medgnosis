// =============================================================================
// Medgnosis Web - Admin operational release smoke tests
// =============================================================================

import { test, expect, type Page } from '@playwright/test';
import {
  mockAdminReleaseSmokeApis,
  seedAuthenticatedSession,
  standardAdminAuthTokens,
  standardAdminUser,
} from './support/api-mocks.js';

function collectRuntimeErrors(page: Page): string[] {
  const errors: string[] = [];

  page.on('pageerror', (error) => {
    errors.push(error.message);
  });

  page.on('console', (message) => {
    if (message.type() !== 'error') return;
    const text = message.text();
    if (text.includes('Failed to load resource')) return;
    errors.push(text);
  });

  return errors;
}

test.describe('Admin release smoke', () => {
  test('loads System Health, EHR Integrations, and Measure Governance without backend leakage', async ({ page }) => {
    const runtimeErrors = collectRuntimeErrors(page);
    const unhandledApiRequests: string[] = [];

    await seedAuthenticatedSession(page, standardAdminUser, standardAdminAuthTokens);
    await mockAdminReleaseSmokeApis(page, unhandledApiRequests);

    await page.goto('/admin');
    await expect(page.getByRole('heading', { name: 'Admin Panel' })).toBeVisible();

    await page.getByRole('button', { name: 'System Health' }).click();
    await expect(page.getByRole('heading', { name: 'System Health' })).toBeVisible();
    await expect(page.getByText('Runtime checks for core Medgnosis services')).toBeVisible();
    await expect(page.getByText('Workers & Queues')).toBeVisible();
    await expect(page.getByText('EHR/FHIR Tenant Readiness')).toBeVisible();
    await expect(page.getByText('EHR Bulk Readiness')).toBeVisible();
    await expect(page.getByText('Standards Readiness')).toBeVisible();
    await expect(page.getByText('EHR Sync Alerts')).toBeVisible();
    await page.getByRole('button', { name: 'Dispatch' }).click();
    await expect(page.getByText('sent / sent / 3 issues')).toBeVisible();

    await page.getByRole('button', { name: 'EHR Integrations' }).click();
    await expect(page.getByRole('heading', { name: 'EHR Integrations' })).toBeVisible();
    await expect(page.getByText('Tenant Registry')).toBeVisible();
    await expect(page.getByText('Epic Sandbox Smoke', { exact: true })).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Readiness' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Run diagnostics' })).toBeVisible();
    await expect(page.getByText('Tenant readiness evidence')).toBeVisible();
    await expect(page.getByRole('button', { name: 'Refresh evidence' })).toBeVisible();
    await expect(page.locator('p', { hasText: /^Sync status$/ })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Refresh status' })).toBeVisible();
    await expect(page.getByText('Patient sync')).toBeVisible();
    await expect(page.getByText('Bulk Data')).toBeVisible();
    await expect(page.getByRole('button', { name: 'Bulk status' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Start' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Schedule' })).toBeVisible();
    await expect(page.getByText('No ingest runs found')).toBeVisible();
    await expect(page.getByText('No sync resources found')).toBeVisible();
    await expect(page.getByText('No capability snapshot captured')).toBeVisible();

    await page.getByRole('button', { name: 'Measure Governance' }).click();
    await expect(page.getByRole('heading', { name: 'Measure Governance' })).toBeVisible();
    await expect(page.getByText('Promotion Configs')).toBeVisible();
    await expect(page.getByText('Default measure')).toBeVisible();
    await expect(page.getByRole('heading', { name: 'CMS122v12' })).toBeVisible();
    await expect(page.getByText('Bridge Ops')).toBeVisible();
    await expect(page.getByText('No open QDM bridge issues')).toBeVisible();
    await expect(page.getByText('Dossier Evidence')).toBeVisible();
    await expect(page.getByText('No validated local test-deck evidence is registered for this measure.')).toBeVisible();
    await expect(page.getByText('No rows for this filter')).toBeVisible();
    await expect(page.getByText('Select a drift row')).toBeVisible();

    await expect(page).not.toHaveURL(/\/login(?:[?#]|$)/);
    await expect(page.getByRole('heading', { name: '404' })).toHaveCount(0);
    expect(unhandledApiRequests).toEqual([]);
    expect(runtimeErrors).toEqual([]);
  });
});
