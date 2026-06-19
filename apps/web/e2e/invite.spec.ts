// =============================================================================
// Medgnosis Web - Invite activation E2E tests
// =============================================================================

import { test, expect } from '@playwright/test';
import {
  invitedAuthTokens,
  invitedUser,
  inviteActivationErrorBody,
  inviteActivationSuccessBody,
  inviteLookupSuccessBody,
  mockAuthenticatedShellApis,
  mockAuthProviderDiscovery,
} from './support/api-mocks.js';

test.describe('Invite activation', () => {
  test.beforeEach(async ({ page }) => {
    await mockAuthProviderDiscovery(page);
    await mockAuthenticatedShellApis(page);
  });

  test('shows an error when the token is missing', async ({ page }) => {
    let lookupRequests = 0;
    let activationRequests = 0;
    await page.route('**/api/v1/auth/accept-invite', async (route) => {
      lookupRequests += 1;
      await route.abort();
    });
    await page.route('**/api/v1/auth/set-password', async (route) => {
      activationRequests += 1;
      await route.abort();
    });

    await page.goto('/accept-invite');

    await expect(page.getByRole('heading', { name: 'Activate your invite' })).toBeVisible();
    await expect(page.locator('.aipg-error')).toContainText('missing an activation token');
    await expect(page.getByRole('button', { name: 'Activate account' })).toBeDisabled();
    expect(lookupRequests).toBe(0);
    expect(activationRequests).toBe(0);
  });

  test('shows an error when invite validation fails', async ({ page }) => {
    await page.route('**/api/v1/auth/accept-invite', async (route) => {
      await route.fulfill({
        status: 400,
        contentType: 'application/json',
        body: JSON.stringify(inviteActivationErrorBody('Invitation is invalid or expired')),
      });
    });

    await page.goto('/accept-invite?token=expired-token');

    await expect(page.getByRole('heading', { name: 'Activate your invite' })).toBeVisible();
    await expect(page.locator('.aipg-error')).toContainText('Invitation is invalid or expired');
    await expect(page.getByRole('button', { name: 'Activate account' })).toBeDisabled();
  });

  test('posts token and password, then redirects to login when activation does not return a session', async ({ page }) => {
    let lookupBody: unknown;
    let activationBody: unknown;

    await page.route('**/api/v1/auth/accept-invite', async (route) => {
      lookupBody = route.request().postDataJSON();
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(inviteLookupSuccessBody()),
      });
    });

    await page.route('**/api/v1/auth/set-password', async (route) => {
      activationBody = route.request().postDataJSON();
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(inviteActivationSuccessBody()),
      });
    });

    await page.goto('/accept-invite?token=invite-token-123');
    await expect(page.getByRole('button', { name: 'Activate account' })).toBeEnabled();
    await page.locator('#aipg-password').fill('ValidPass123!');
    await page.locator('#aipg-confirm-password').fill('ValidPass123!');
    await page.getByRole('button', { name: 'Activate account' }).click();

    await expect(page.locator('.aipg-success')).toContainText('Your account is active');
    await expect(page).toHaveURL(/\/login$/);
    expect(lookupBody).toEqual({ token: 'invite-token-123' });
    expect(activationBody).toEqual({
      token: 'invite-token-123',
      password: 'ValidPass123!',
    });
  });

  test('stores returned auth and sends activated users to dashboard', async ({ page }) => {
    let activationBody: unknown;

    await page.route('**/api/v1/auth/accept-invite', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(inviteLookupSuccessBody()),
      });
    });

    await page.route('**/api/v1/auth/set-password', async (route) => {
      activationBody = route.request().postDataJSON();
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(inviteActivationSuccessBody({
          user: invitedUser,
          tokens: invitedAuthTokens,
        })),
      });
    });

    await page.goto('/accept-invite?token=session-token-456');
    await expect(page.getByRole('button', { name: 'Activate account' })).toBeEnabled();
    await page.locator('#aipg-password').fill('ValidPass123!');
    await page.locator('#aipg-confirm-password').fill('ValidPass123!');
    await page.getByRole('button', { name: 'Activate account' }).click();

    await expect(page).toHaveURL(/\/dashboard$/);
    expect(activationBody).toEqual({
      token: 'session-token-456',
      password: 'ValidPass123!',
    });

    const persisted = await page.evaluate(() => window.localStorage.getItem('medgnosis-auth'));
    expect(persisted).toContain('e2e-access-token');
  });

  test('shows API errors and stays on the invite page', async ({ page }) => {
    await page.route('**/api/v1/auth/accept-invite', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(inviteLookupSuccessBody()),
      });
    });

    await page.route('**/api/v1/auth/set-password', async (route) => {
      await route.fulfill({
        status: 410,
        contentType: 'application/json',
        body: JSON.stringify(inviteActivationErrorBody('Invite link has expired.')),
      });
    });

    await page.goto('/accept-invite?token=expired-token');
    await expect(page.getByRole('button', { name: 'Activate account' })).toBeEnabled();
    await page.locator('#aipg-password').fill('ValidPass123!');
    await page.locator('#aipg-confirm-password').fill('ValidPass123!');
    await page.getByRole('button', { name: 'Activate account' }).click();

    await expect(page).toHaveURL(/\/accept-invite\?token=expired-token$/);
    await expect(page.locator('.aipg-error')).toContainText('Invite link has expired.');
  });
});
