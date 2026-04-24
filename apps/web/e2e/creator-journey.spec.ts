import { test, expect } from '@playwright/test';

/**
 * Happy-path E2E for the creator journey. Covers:
 * - Dev-bypass sign-in (Google OAuth not exercised; webServer starts
 *   with DEV_AUTH_BYPASS_ENABLED=true so the "Continue as local dev user"
 *   button is rendered)
 * - Dashboard lands at /app
 * - My Hubs page renders for an authed user
 * - Request-access form accepts a submission and renders confirmation
 *
 * Stripe checkout is NOT exercised here — keeping the test deterministic.
 * Real test-card payments stay a manual checklist item.
 */

test.describe('Creator journey — happy path (dev bypass)', () => {
  test('sign in → dashboard', async ({ page }) => {
    await page.goto('/sign-in');

    const devButton = page.getByRole('button', {
      name: /continue as local dev user|dev bypass/i,
    });
    await expect(devButton).toBeVisible({ timeout: 10_000 });
    await devButton.click();

    await page.waitForURL(/\/app(\/|$)/, { timeout: 15_000 });
    // Dashboard is rendered; at minimum some navigation or card is visible.
    await expect(page.locator('main')).toBeVisible();
  });

  test('My hubs page renders for an authed user', async ({ page }) => {
    await page.goto('/sign-in');
    const devButton = page.getByRole('button', {
      name: /continue as local dev user|dev bypass/i,
    });
    await devButton.click();
    await page.waitForURL(/\/app(\/|$)/);

    await page.goto('/app/hubs');
    await expect(page.getByRole('heading', { name: /my hubs/i })).toBeVisible();
  });

  test('Request access page accepts an email', async ({ page }) => {
    await page.goto('/request-access');
    await expect(
      page.getByRole('heading', { name: /request alpha access/i }),
    ).toBeVisible();

    await page.getByLabel(/email/i).fill('e2e+test@example.com');
    await page.getByRole('button', { name: /request access/i }).click();

    // Either status=submitted redirect renders the confirmation, or
    // the invalid branch (shouldn't happen for a valid email). Both
    // are same-page so looking for the success banner is enough.
    await expect(page.getByText(/request received/i)).toBeVisible({ timeout: 10_000 });
  });

  test('Public /pricing renders single-tier copy', async ({ page }) => {
    await page.goto('/pricing');
    await expect(page.getByRole('heading', { name: /one hub\. one price\./i })).toBeVisible();
    await expect(page.getByText(/\$29/)).toBeVisible();
  });
});
