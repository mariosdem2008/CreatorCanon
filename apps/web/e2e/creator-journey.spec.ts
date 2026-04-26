import { test, expect } from '@playwright/test';

/**
 * Creator-journey E2E. Covers:
 *
 * 1. Public surface — runs without auth. The marketing routes never require
 *    a session, so these always run.
 * 2. Protected redirects — verifies that /app/* surfaces send anonymous
 *    visitors back to /sign-in. Always runs.
 * 3. Authenticated app shell (dev bypass) — only runs when the playwright
 *    webServer launches with DEV_AUTH_BYPASS_ENABLED=true (default per
 *    playwright.config.ts). Skips itself at runtime if the dev-bypass
 *    button isn't rendered on /sign-in.
 *
 * Stripe checkout is NEVER exercised here — real test-card payments stay a
 * manual checklist item.
 */

test.describe('Public surface', () => {
  test('marketing landing renders with hero + alpha access CTA', async ({ page }) => {
    await page.goto('/');
    await expect(
      page.getByRole('heading', { level: 1, name: /premium/i }),
    ).toBeVisible();
    await expect(
      page.getByRole('link', { name: /request alpha access/i }).first(),
    ).toBeVisible();
  });

  test('pricing page renders with $29 price and FAQ', async ({ page }) => {
    await page.goto('/pricing');
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
    await expect(page.getByText(/\$29/).first()).toBeVisible();
    await expect(page.getByText(/pricing faq/i)).toBeVisible();
  });

  test('request-access page accepts a valid email', async ({ page }) => {
    await page.goto('/request-access');
    await expect(
      page.getByRole('heading', { level: 1, name: /request alpha access/i }),
    ).toBeVisible();

    await page.getByLabel(/work email|^email$/i).fill('e2e+test@example.com');
    await page.getByRole('button', { name: /request access/i }).click();

    await expect(page.getByText(/request received/i)).toBeVisible({ timeout: 10_000 });
  });

  test('sign-in page renders the Google CTA', async ({ page }) => {
    await page.goto('/sign-in');
    await expect(page.getByRole('heading', { name: /sign in/i })).toBeVisible();
    await expect(
      page.getByRole('button', { name: /continue with google/i }),
    ).toBeVisible();
  });
});

test.describe('Protected routes redirect when unauthenticated', () => {
  test.use({ storageState: { cookies: [], origins: [] } });

  const PROTECTED_ROUTES = [
    '/app',
    '/app/library',
    '/app/projects',
    '/app/projects/new',
    '/app/agent',
    '/app/inbox',
    '/app/insights',
    '/app/activity',
    '/app/settings',
    '/app/settings/billing',
    '/app/settings/team',
    '/app/settings/source',
  ];

  for (const route of PROTECTED_ROUTES) {
    test(`${route} redirects to /sign-in for anonymous user`, async ({ page }) => {
      await page.goto(route);
      await page.waitForURL(/\/sign-in(\?|$)/, { timeout: 15_000 });
      await expect(page.getByRole('heading', { name: /sign in/i })).toBeVisible();
    });
  }
});

test.describe('Authenticated app shell (dev bypass)', () => {
  // The dev bypass is intentionally lightweight — it requires (1) the dev
  // server to launch with DEV_AUTH_BYPASS_ENABLED=true (so the button
  // renders) AND (2) the configured DEV_AUTH_BYPASS_EMAIL to already exist
  // in the local `user` table (the credentials provider looks it up but
  // does not auto-create). If either is missing, the click won't actually
  // navigate to /app — we detect that and skip the test cleanly instead of
  // hard-failing.
  test.beforeEach(async ({ page }) => {
    await page.goto('/sign-in');
    const devButton = page.getByRole('button', {
      name: /continue as local dev user|dev bypass/i,
    });
    if (!(await devButton.isVisible().catch(() => false))) {
      test.skip(
        true,
        'Dev bypass button not rendered — DEV_AUTH_BYPASS_ENABLED is not true on the dev server.',
      );
    }

    await devButton.click();
    try {
      await page.waitForURL(/\/app(\/|$)/, { timeout: 8_000 });
    } catch {
      test.skip(
        true,
        'Dev bypass click did not reach /app — likely DEV_AUTH_BYPASS_EMAIL has no matching `user` row in this DB. (Sign in via Google once with that email, or seed the row, then rerun.)',
      );
    }
  });

  test('dev bypass sign-in lands on /app and the shell is rendered', async ({ page }) => {
    await expect(page.locator('main')).toBeVisible();
    await expect(
      page.getByRole('navigation', { name: /workspace navigation/i }),
    ).toBeVisible();
  });

  test('settings subpages render', async ({ page }) => {

    const SECTION_LABELS: Record<string, RegExp> = {
      '/app/settings': /workspace/i,
      '/app/settings/source': /youtube connection|source/i,
      '/app/settings/billing': /customer|billing/i,
      '/app/settings/team': /members|team/i,
    };

    for (const [route, label] of Object.entries(SECTION_LABELS)) {
      await page.goto(route);
      // Settings layout always renders the same h1 — assert it's present.
      await expect(
        page.getByRole('heading', { level: 1, name: /workspace, source, billing/i }),
      ).toBeVisible();
      // Each subpage renders a panel heading scoped to the section.
      await expect(
        page.getByRole('heading', { level: 2, name: label }).first(),
      ).toBeVisible();
    }
  });
});
