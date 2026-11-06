import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { navigateToStep3, openFirstDayWithSlots } from './helpers/booking-form';
import { gotoBookingPage } from './helpers/booking-form/goto';

test.describe('UC-001 — Guest booking golden path', () => {
  test('guest navigates from hotsite to booking form and submits successfully', async ({
    page,
  }) => {
    // Hotsite renders
    await page.goto('/ikaro');
    await expect(page.locator('#service-list')).toBeVisible();

    // Navigate to booking form — step 1 visible
    await gotoBookingPage(page, '/ikaro/booking');
    await expect(page.locator('[data-testid="step-service-selection"]')).toBeVisible();

    // Step 1 — select first service that does not require pickup address
    await page
      .locator('[data-testid="service-card"][data-requires-pickup="false"]')
      .first()
      .click();
    await page.locator('[data-testid="step-next"]').click();

    // Step 2 — pick first available day then first slot
    await openFirstDayWithSlots(page);
    await page.locator('[data-testid="time-slot"]').first().click();
    await page.locator('[data-testid="step-next"]').click();

    // Step 3 — personal info
    await page.locator('[data-testid="input-name"]').fill('E2E Teste');
    await page.locator('[data-testid="input-email"]').fill('e2e@teste.com.br');
    await page.locator('[data-testid="input-phone"]').fill('11999999999');
    await page.locator('[data-testid="step-next"]').click();

    // Step 4 — submit
    await page.locator('[data-testid="step-confirm"]').click();
    await expect(page.locator('[data-testid="booking-success"]')).toBeVisible();
  });
});

test.describe('UC-001 — Booking form error paths', () => {
  test('step 4 submit: routes back to step 3 with an address-specific error when the backend rejects the contact address (400)', async ({
    page,
  }) => {
    // Simulates the backend Address VO rejecting contactAddress (e.g. a country-specific
    // postal-code format failure) — mapped to a structured 400 carrying `code`/`field`. The
    // form must route the guest back to step 3 and show the address-specific message there,
    // not the generic step 4 fallback.
    await page.route('**/v1/bookings', (route) => {
      if (route.request().method() !== 'POST') return route.continue();
      return route.fulfill({
        status: 400,
        contentType: 'application/json',
        body: JSON.stringify({
          type: 'about:blank',
          title: 'Bad Request',
          status: 400,
          code: 'ADDRESS_POSTAL_CODE_INVALID',
          field: 'contactAddress',
          detail: 'Invalid ZIP Code: 00000-000',
        }),
      });
    });

    await navigateToStep3(page);

    await page.locator('[data-testid="input-name"]').fill('E2E Teste');
    await page.locator('[data-testid="input-email"]').fill('e2e@teste.com.br');
    await page.locator('[data-testid="input-phone"]').fill('11999999999');
    await page.locator('[data-testid="step-next"]').click();

    await page.locator('[data-testid="step-confirm"]').click();

    // Back on step 3, with the address-specific message
    await expect(page.locator('[data-testid="input-name"]')).toBeVisible();
    await expect(page.locator('[data-testid="step3-submit-error"]')).toContainText(
      'The postal code provided is invalid.',
    );
  });

  test('back navigation: step 3 back button returns to step 2', async ({ page }) => {
    await navigateToStep3(page);

    await page.locator('[data-testid="step-back"]').click();

    // Back on step 2 — day/slot picker visible again
    await expect(page.locator('[data-testid="day-option"]').first()).toBeVisible();
  });
});

// color-contrast is disabled: seeded tenant branding colors may not meet WCAG AA
// against each other. Contrast correctness is verified by contrastRatio unit tests
// in apply-branding.spec.ts (same rationale as the jsdom component specs).
test.describe('UC-001 — Accessibility (axe)', () => {
  test('hotsite landing page has no axe violations', async ({ page }) => {
    await page.goto('/ikaro');
    await expect(page.locator('#service-list')).toBeVisible();

    const results = await new AxeBuilder({ page }).disableRules(['color-contrast']).analyze();
    expect(results.violations).toEqual([]);
  });

  test('booking form step 1 has no axe violations', async ({ page }) => {
    await gotoBookingPage(page, '/ikaro/booking');
    await expect(page.locator('[data-testid="step-service-selection"]')).toBeVisible();

    const results = await new AxeBuilder({ page }).disableRules(['color-contrast']).analyze();
    expect(results.violations).toEqual([]);
  });
});
