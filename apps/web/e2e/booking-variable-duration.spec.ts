import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Browser, type Page } from '@playwright/test';
import { loginAsCustomer, loginAsStaff, uniqueTestEmail } from './helpers/auth';
import { completeCustomerProfile } from './helpers/customer';
import { deactivateResource } from './helpers/booking';
import {
  applyDarkHotsitePalette,
  confirmBooking,
  fillGuestContact,
  MANAGER_EMAIL,
  nextButton,
  openBooking,
  parseRange,
  pickFirstSlot,
  seedVariableDurationService,
  selectService,
  stepIndicator,
  TENANT_SLUG,
  waitForAnimationsToSettle,
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
  await expect(guest.getByTestId('step-variable-duration')).toBeVisible({ timeout: 20_000 });
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
      // A slot spans the duration plus the tenant's own buffer, so the length is checked against the
      // 1h search rather than against a fixed number: two hours must add exactly one hour.
      const lengths = async () =>
        (await guest.page.getByTestId('time-slot').allTextContents()).map((label) => {
          const { start, end } = parseRange(label);
          return end - start;
        });
      const twoHours = await lengths();
      expect(twoHours.length).toBeGreaterThan(0);
      expect(new Set(twoHours).size).toBe(1);
      await guest.page.getByRole('button', { name: 'Voltar' }).click();
      await chooseDuration(guest.page, 60, 'R$ 50,00');
      await nextButton(guest.page).click();
      await openFirstDay(guest.page);
      const oneHour = await lengths();
      expect(twoHours[0]! - oneHour[0]!).toBe(60);
      await guest.page.getByRole('button', { name: 'Voltar' }).click();
      await chooseDuration(guest.page, 120, 'R$ 100,00');
      await nextButton(guest.page).click();
      await openFirstDay(guest.page);

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
      await expect(nextButton(guest.page)).toBeEnabled();
      await waitForAnimationsToSettle(guest.page);

      const light = await new AxeBuilder({ page: guest.page })
        .include('[data-testid="step-variable-duration"]')
        .analyze();
      expect(light.violations).toEqual([]);

      await applyDarkHotsitePalette(guest.page);
      await waitForAnimationsToSettle(guest.page);
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

  test('an authenticated customer books a chosen duration and the quoted total reaches the details box', async ({
    page,
  }) => {
    await loginAsStaff(page, MANAGER_EMAIL, TENANT_SLUG);
    const { service, resourceIds } = await seedVariableDurationService(
      page,
      'e2e-por-tempo-cliente',
    );

    try {
      // Staff seeding is done: the same page now becomes the customer (they share one cookie jar).
      await loginAsCustomer(page, uniqueTestEmail('e2e-por-tempo'), TENANT_SLUG);
      await completeCustomerProfile(page, TENANT_SLUG);
      await reachDuration(page, service.serviceId);
      await chooseDuration(page, 180, 'R$ 150,00');
      await nextButton(page).click();
      await pickFirstSlot(page);
      await nextButton(page).click();
      await nextButton(page).click();
      await expect(page.getByTestId('confirmation-total')).toHaveText('Total: R$ 150,00 — 3h');
      await confirmBooking(page);

      await expect(page.getByTestId('booking-success')).toBeVisible();
      await expect(page.getByTestId('submitted-total')).toContainText('Total: R$ 150,00');
    } finally {
      await loginAsStaff(page, MANAGER_EMAIL, TENANT_SLUG);
      await deactivateService(page, service.serviceId);
      for (const id of resourceIds) await deactivateResource(page, id);
    }
  });
});
