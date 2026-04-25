import { test, expect } from '@playwright/test';

/**
 * Edit-then-publish happy path.
 *
 * Uses dev-bypass sign-in (requires the local dev webServer started by
 * playwright.config.ts with DEV_AUTH_BYPASS_ENABLED=true) and an existing
 * project whose run is in `awaiting_review` or `published` state. The test
 * exercises the draft pages screen, applies a single page-title edit through
 * the UI, asserts the edit persists across a hard reload, and restores the
 * original title so reruns stay idempotent.
 *
 * Why no actual publish click?
 *   `publishCurrentRun` is irreversible (creates a real release row + sends
 *   a Resend confirmation email). The pre-existing creator-journey spec
 *   already covers configure → checkout → page assertion. This spec fills
 *   the gap between "run finished" and "creator publishes" with a single
 *   edit-save-verify assertion.
 *
 * Project id defaulted to a known prior proof run; override via
 * E2E_EDIT_PROJECT_ID for repeatability against other workspaces.
 */

const PROJECT_ID_DEFAULT = 'df018f46-66b4-4199-9b05-a5653742cadd';

test.skip(
  !process.env.E2E_EDIT_ENABLED,
  'Set E2E_EDIT_ENABLED=true to run (requires a pre-existing awaiting_review/published project + local dev server with DEV_AUTH_BYPASS_ENABLED=true).',
);

test.describe('Edit-then-publish happy path (dev bypass)', () => {
  test('creator edits a page title and save persists', async ({ page }) => {
    const projectId = process.env.E2E_EDIT_PROJECT_ID ?? PROJECT_ID_DEFAULT;

    await page.goto('/sign-in');
    await page
      .getByRole('button', { name: /continue as local dev user|dev bypass/i })
      .click();
    await page.waitForURL(/\/app(\/|$)/);

    await page.goto(`/app/projects/${projectId}/pages`);

    const pageSection = page.locator('[data-testid="page-version-block"]').first();
    await expect(pageSection).toBeVisible({ timeout: 10_000 });

    const titleInput = pageSection.locator('input[name="title"]');
    const initialTitle = await titleInput.inputValue();
    const newTitle = `E2E edit ${Date.now().toString(36)}`;
    await titleInput.fill(newTitle);
    await pageSection.getByRole('button', { name: /save title/i }).click();

    // The form submission triggers a server action + revalidation. Give the
    // round-trip a beat, then hard-reload to prove the edit landed in the DB
    // (not just optimistic UI state).
    await page.waitForTimeout(1500);
    await page.reload();
    await expect(pageSection.locator('input[name="title"]')).toHaveValue(newTitle);

    // Restore the original title so repeated runs stay idempotent.
    await pageSection.locator('input[name="title"]').fill(initialTitle);
    await pageSection.getByRole('button', { name: /save title/i }).click();
  });
});
