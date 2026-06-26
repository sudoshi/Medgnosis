// =============================================================================
// Medgnosis Web - authenticated protected-route smoke tests
// =============================================================================

import { test, expect, type Page } from '@playwright/test';
import {
  mockProtectedRouteSmokeApis,
  seedAuthenticatedSession,
} from './support/api-mocks.js';

const protectedRoutes: Array<{ path: string; heading: string | RegExp; redirectedTo?: RegExp }> = [
  { path: '/', heading: /Good (morning|afternoon|evening), Dr\. Admin/, redirectedTo: /\/dashboard$/ },
  { path: '/dashboard', heading: /Good (morning|afternoon|evening), Dr\. Admin/ },
  { path: '/patients', heading: 'Patient Management' },
  { path: '/patients/123', heading: 'Launch, Ehr' },
  { path: '/patients/123/encounter-note', heading: 'Encounter Note' },
  { path: '/patients/123/supernote', heading: /SuperNote/ },
  { path: '/measures', heading: 'Quality Measures' },
  { path: '/bundles', heading: 'Disease Bundles' },
  { path: '/care-lists', heading: 'Care Lists' },
  { path: '/population-finder', heading: 'Population Finder' },
  { path: '/close-the-loop', heading: 'Close the Loop' },
  { path: '/anticipatory', heading: 'Anticipatory Care' },
  { path: '/surveillance', heading: 'Real-Time Surveillance' },
  { path: '/data-quality', heading: 'Data Quality' },
  { path: '/cohorts', heading: 'Cohort Manager' },
  { path: '/coding', heading: 'Coding & HCC Capture' },
  { path: '/alerts', heading: 'Alerts' },
  { path: '/settings', heading: 'Settings' },
  { path: '/admin', heading: 'Admin Panel' },
];

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

test.describe('Protected route smoke', () => {
  test('loads every top-level protected route for an authenticated admin', async ({ page }) => {
    const runtimeErrors = collectRuntimeErrors(page);
    const unhandledApiRequests: string[] = [];

    await seedAuthenticatedSession(page);
    await mockProtectedRouteSmokeApis(page, unhandledApiRequests);

    for (const route of protectedRoutes) {
      await test.step(route.path, async () => {
        const runtimeErrorCount = runtimeErrors.length;
        const unhandledApiCount = unhandledApiRequests.length;

        await page.goto(route.path);

        if (route.redirectedTo) {
          await expect(page).toHaveURL(route.redirectedTo);
        } else {
          await expect(page).toHaveURL(new RegExp(`${route.path.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}(?:[?#].*)?$`));
        }

        await expect(page.getByRole('heading', { name: route.heading })).toBeVisible({ timeout: 10_000 });
        await expect(page).not.toHaveURL(/\/login(?:[?#]|$)/);
        await expect(page.getByRole('heading', { name: '404' })).toHaveCount(0);

        expect(unhandledApiRequests.slice(unhandledApiCount), `Unhandled API requests on ${route.path}`).toEqual([]);
        expect(runtimeErrors.slice(runtimeErrorCount), `Browser runtime errors on ${route.path}`).toEqual([]);
      });
    }
  });
});
