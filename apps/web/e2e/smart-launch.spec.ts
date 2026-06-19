// =============================================================================
// Medgnosis Web - SMART launch completion E2E tests
// =============================================================================

import { test, expect } from '@playwright/test';
import {
  adminAuthTokens,
  adminUser,
  mockAuthenticatedShellApis,
  mockAuthProviderDiscovery,
  mockPatientDetailApis,
  mockSmartLaunchCompletion,
  seedAuthenticatedSession,
} from './support/api-mocks.js';

test.describe('SMART launch completion', () => {
  test('shows an error when the handoff code is missing', async ({ page }) => {
    let resolverCalls = 0;
    await page.route('**/api/v1/ehr/launch/complete', async (route) => {
      resolverCalls += 1;
      await route.abort();
    });

    await page.goto('/ehr/complete');

    await expect(page.getByRole('heading', { name: 'EHR launch needs attention' })).toBeVisible();
    await expect(page.getByText('handoff is missing or expired')).toBeVisible();
    expect(resolverCalls).toBe(0);
  });

  test('opens the resolved local patient when completion returns a patient id', async ({ page }) => {
    await seedAuthenticatedSession(page);
    await mockAuthenticatedShellApis(page);
    await mockSmartLaunchCompletion(page, { patient_id: 123 });
    await mockPatientDetailApis(page, 123);

    await page.goto('/ehr/complete?smart_handoff=handoff-code-1');

    await expect(page).toHaveURL(/\/patients\/123/);
    await expect(page.getByRole('heading', { name: 'Launch, Ehr' })).toBeVisible();
  });

  test('falls back to the dashboard when no local patient is resolved', async ({ page }) => {
    await seedAuthenticatedSession(page);
    await mockAuthenticatedShellApis(page);
    await mockSmartLaunchCompletion(page, { patient_id: null });

    await page.goto('/ehr/complete?smart_handoff=handoff-code-1');

    await expect(page).toHaveURL(/\/dashboard/);
  });

  test('shows patient import failures without falling back to dashboard', async ({ page }) => {
    await seedAuthenticatedSession(page);
    await mockSmartLaunchCompletion(page, {
      patient_id: null,
      patient_sync: {
        status: 'failed',
        errorMessage: 'FHIR Patient.birthDate is required to create a local patient',
      },
    });

    await page.goto('/ehr/complete?smart_handoff=handoff-code-1');

    await expect(page).toHaveURL(/\/ehr\/complete/);
    await expect(page.getByRole('heading', { name: 'EHR launch needs attention' })).toBeVisible();
    await expect(page.getByText('FHIR Patient.birthDate is required')).toBeVisible();
  });

  test('shows resolver failures without looping', async ({ page }) => {
    await seedAuthenticatedSession(page);
    await mockSmartLaunchCompletion(page, {}, 404);

    await page.goto('/ehr/complete?smart_handoff=expired-code');

    await expect(page).toHaveURL(/\/ehr\/complete/);
    await expect(page.getByRole('heading', { name: 'EHR launch needs attention' })).toBeVisible();
    await expect(page.getByText('SMART launch handoff is invalid or expired')).toBeVisible();
  });

  test('preserves the handoff through local sign-in when unauthenticated', async ({ page }) => {
    await mockAuthProviderDiscovery(page);
    await mockAuthenticatedShellApis(page);
    await mockSmartLaunchCompletion(page, { patient_id: 123 });
    await mockPatientDetailApis(page, 123);
    await page.route('**/api/v1/auth/login', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          success: true,
          data: {
            user: adminUser,
            tokens: adminAuthTokens,
          },
        }),
      });
    });

    await page.goto('/ehr/complete?smart_handoff=handoff-code-1');
    await page.getByRole('button', { name: 'Sign in' }).click();
    await expect(page).toHaveURL(/\/login\?return_to=/);

    await page.locator('#lpg-email').fill('admin@example.test');
    await page.locator('#lpg-pw').fill('correct-password');
    await page.getByRole('button', { name: 'Sign in' }).click();

    await expect(page).toHaveURL(/\/patients\/123/);
  });
});
