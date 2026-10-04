import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Browser, type Page } from '@playwright/test';
import { loginAsStaff } from './helpers/auth';
import { deactivateResource } from './helpers/booking';
import {
  applyDarkHotsitePalette,
  confirmBooking,
  fillGuestContact,
  MANAGER_EMAIL,
  nextButton,
  openBooking,
  parseRange,
  seedVariableDurationService,
  selectService,
  stepIndicator,
  TENANT_SLUG,
} from './helpers/booking-form';
import { deactivateService, publishIntakeSchema } from './helpers/services';

// M23-S11b — UC-067: a service whose duration the customer picks adds a duration step ahead of
// availability; the total is the server's quote and the slot list follows the chosen duration.

async function newGuestPage(browser: Browser): Promise<{ page: Page; close: () => Promise<void> }> {
  const context = await browser.newContext({
    baseURL: process.env.PLAYWRIGHT_BASE_URL ?? 'http://localhost:3000',
  });
  return { page: await context.newPage(), close: () => context.close() };
}

function problemRoute(status: number, code: string) {
  return {
    status,
    contentType: 'application/problem+json',
    body: JSON.stringify({ type: 'about:blank', title: code, status, code, detail: code }),
  };
}

async function reachDuration(guest: Page, serviceId: string): Promise<void> {
  await openBooking(guest);
  await selectService(guest, serviceId);
  await nextButton(guest).click();
  await expect(guest.getByTestId('step-variable-duration')).toBeVisible();
}

async function chooseDuration(guest: Page, minutes: number, total: string): Promise<void> {
  await guest.getByTestId('duration-select').selectOption(String(minutes));
  await expect(guest.getByTestId('duration-total')).toContainText(`Total: ${total}`);
  await expect(nextButton(guest)).toBeEnabled();
}

async function openFirstDay(guest: Page): Promise<void> {
  const day = guest.locator('[data-testid="day-option"]:not([disabled])').first();
  await expect(day).toBeVisible();
  await day.click();
  await expect(guest.getByTestId('time-slot').first()).toBeVisible();
}

test.describe('M23-S11b — variable duration', () => {
  test('the step opens on the minimum with its quote; a longer duration is re-quoted, lists only slots of that length, and books with the quoted total', async ({
    page,
    browser,
  }) => {
    await loginAsStaff(page, MANAGER_EMAIL, TENANT_SLUG);
    const { service, resourceIds } = await seedVariableDurationService(page);
    const guest = await newGuestPage(browser);

    try {
      await reachDuration(guest.page, service.serviceId);
      await expect(stepIndicator(guest.page, 2, 5)).toBeVisible();
      await expect(guest.page.getByTestId('duration-select')).toHaveValue('60');
      await expect(guest.page.getByTestId('duration-total')).toContainText('Total: R$ 50,00');
      // The step asks for the duration only.
      await expect(guest.page.getByTestId('step-variable-duration').locator('input')).toHaveCount(
        0,
      );

      await chooseDuration(guest.page, 120, 'R$ 100,00');
      await nextButton(guest.page).click();

      await openFirstDay(guest.page);
      const labels = await guest.page.getByTestId('time-slot').allTextContents();
      expect(labels.length).toBeGreaterThan(0);
      for (const label of labels) {
        const { start, end } = parseRange(label);
        expect(end - start).toBe(120);
      }

      await guest.page.getByTestId('time-slot').first().click();
      await nextButton(guest.page).click();
      await fillGuestContact(guest.page);
      await nextButton(guest.page).click();
      await expect(guest.page.getByTestId('confirmation-total')).toHaveText(
        'Total: R$ 100,00 — 2h',
      );
      await confirmBooking(guest.page);

      await expect(guest.page.getByTestId('booking-success')).toBeVisible();
      await expect(guest.page.getByTestId('submitted-total')).toContainText('Total: R$ 100,00');
      await expect(guest.page.getByTestId('submitted-total')).toContainText('2h');
    } finally {
      await guest.close();
      await deactivateService(page, service.serviceId);
      for (const id of resourceIds) await deactivateResource(page, id);
    }
  });

  test('the step indicator counts the duration step: 5, and 6 when the service also has an intake form', async ({
    page,
    browser,
  }) => {
    await loginAsStaff(page, MANAGER_EMAIL, TENANT_SLUG);
    const { service, resourceIds } = await seedVariableDurationService(page, 'e2e-por-tempo-form');
    const guest = await newGuestPage(browser);

    try {
      await reachDuration(guest.page, service.serviceId);
      await expect(stepIndicator(guest.page, 2, 5)).toBeVisible();

      await publishIntakeSchema(page, service.serviceId, {
        questions: [
          { fieldKey: 'goal', label: 'Qual o objetivo?', type: 'FREE_TEXT', required: true },
        ],
        consentText: 'Li e aceito os termos.',
        requiresNamedAttendees: false,
        participantCountRequired: false,
      });
      await guest.page.reload();
      await selectService(guest.page, service.serviceId);
      await nextButton(guest.page).click();

      await expect(stepIndicator(guest.page, 2, 6)).toBeVisible();
    } finally {
      await guest.close();
      await deactivateService(page, service.serviceId);
      for (const id of resourceIds) await deactivateResource(page, id);
    }
  });

  test('a failed quote blocks continuing and recovers on retry', async ({ page, browser }) => {
    await loginAsStaff(page, MANAGER_EMAIL, TENANT_SLUG);
    const { service, resourceIds } = await seedVariableDurationService(page, 'e2e-por-tempo-erro');
    const guest = await newGuestPage(browser);
    const quoteUrl = '**/v1/public/services/*/quote*';
    await guest.page.route(quoteUrl, (route) => route.fulfill(problemRoute(500, 'INTERNAL_ERROR')));

    try {
      await reachDuration(guest.page, service.serviceId);

      await expect(guest.page.getByTestId('duration-quote-error')).toContainText(
        'Não foi possível calcular o total.',
      );
      await expect(nextButton(guest.page)).toBeDisabled();

      await guest.page.unroute(quoteUrl);
      await guest.page.getByRole('button', { name: 'Tentar novamente' }).click();

      await expect(guest.page.getByTestId('duration-total')).toContainText('Total: R$ 50,00');
      await expect(nextButton(guest.page)).toBeEnabled();
    } finally {
      await guest.close();
      await deactivateService(page, service.serviceId);
      for (const id of resourceIds) await deactivateResource(page, id);
    }
  });

  test('a mocked BOOKING_DURATION_OUT_OF_RANGE returns to the duration step with the catalogue message and nothing chosen', async ({
    page,
    browser,
  }) => {
    await loginAsStaff(page, MANAGER_EMAIL, TENANT_SLUG);
    const { service, resourceIds } = await seedVariableDurationService(page, 'e2e-por-tempo-faixa');
    const guest = await newGuestPage(browser);
    await guest.page.route('**/v1/bookings', (route) =>
      route.request().method() === 'POST'
        ? route.fulfill(problemRoute(422, 'BOOKING_DURATION_OUT_OF_RANGE'))
        : route.continue(),
    );

    try {
      await reachDuration(guest.page, service.serviceId);
      await chooseDuration(guest.page, 120, 'R$ 100,00');
      await nextButton(guest.page).click();
      await openFirstDay(guest.page);
      await guest.page.getByTestId('time-slot').first().click();
      await nextButton(guest.page).click();
      await fillGuestContact(guest.page);
      await nextButton(guest.page).click();
      await confirmBooking(guest.page);

      await expect(guest.page.getByTestId('duration-error')).toContainText(
        'A duração selecionada não é válida para este serviço.',
      );
      await expect(guest.page.getByTestId('step-variable-duration')).toBeVisible();
      await expect(guest.page.getByTestId('duration-select')).toHaveValue('');
      await expect(nextButton(guest.page)).toBeDisabled();

      await guest.page.getByTestId('duration-select').selectOption('60');

      await expect(nextButton(guest.page)).toBeEnabled();
      await expect(guest.page.getByTestId('duration-error')).toHaveCount(0);
    } finally {
      await guest.close();
      await deactivateService(page, service.serviceId);
      for (const id of resourceIds) await deactivateResource(page, id);
    }
  });

  test('the duration step has no axe violations on a light tenant or under a dark palette', async ({
    page,
    browser,
  }) => {
    await loginAsStaff(page, MANAGER_EMAIL, TENANT_SLUG);
    const { service, resourceIds } = await seedVariableDurationService(page, 'e2e-por-tempo-axe');
    const guest = await newGuestPage(browser);

    try {
      await reachDuration(guest.page, service.serviceId);
      await expect(guest.page.getByTestId('duration-total')).toBeVisible();

      const light = await new AxeBuilder({ page: guest.page })
        .include('[data-testid="step-variable-duration"]')
        .analyze();
      expect(light.violations).toEqual([]);

      await applyDarkHotsitePalette(guest.page);
      const dark = await new AxeBuilder({ page: guest.page })
        .include('[data-testid="step-variable-duration"]')
        .analyze();
      expect(dark.violations).toEqual([]);
    } finally {
      await guest.close();
      await deactivateService(page, service.serviceId);
      for (const id of resourceIds) await deactivateResource(page, id);
    }
  });
});
