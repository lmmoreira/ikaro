import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Browser, type Page } from '@playwright/test';
import { loginAsCustomer, loginAsStaff, uniqueTestEmail } from './helpers/auth';
import { deactivateResource } from './helpers/booking';
import { completeCustomerProfile } from './helpers/customer';
import {
  confirmBooking,
  fillGuestContact,
  MANAGER_EMAIL,
  nextButton,
  openBooking,
  pickFirstSlot,
  seedChoiceService,
  selectService,
  stepIndicator,
  TENANT_SLUG,
} from './helpers/booking-form';
import {
  createService,
  deactivateService,
  makeUniqueServiceName,
  publishIntakeSchema,
} from './helpers/services';

// M23-S11a — UC-068: a service with an intake form adds the intake step, for guests and customers.

const QUESTIONS = [
  {
    fieldKey: 'goal',
    label: 'Qual o objetivo da reserva?',
    type: 'FREE_TEXT' as const,
    required: true,
  },
  {
    fieldKey: 'equipment',
    label: 'Precisa de equipamento?',
    type: 'BOOLEAN' as const,
    required: true,
  },
];

async function newGuestPage(browser: Browser): Promise<{ page: Page; close: () => Promise<void> }> {
  const context = await browser.newContext({
    baseURL: process.env.PLAYWRIGHT_BASE_URL ?? 'http://localhost:3000',
  });
  return { page: await context.newPage(), close: () => context.close() };
}

async function seedIntakeService(
  page: Page,
  extra: { attendees?: boolean; participants?: boolean } = {},
) {
  const service = await createService(page, {
    name: makeUniqueServiceName('e2e-intake'),
    priceAmount: 150,
    durationMinutes: 60,
    loyaltyPointsValue: 10,
  });
  await publishIntakeSchema(page, service.serviceId, {
    questions: QUESTIONS,
    consentText: 'Li e aceito os termos.',
    requiresNamedAttendees: extra.attendees ?? false,
    participantCountRequired: extra.participants ?? false,
  });
  return service;
}

async function reachIntake(guest: Page, serviceId: string): Promise<void> {
  await openBooking(guest);
  await selectService(guest, serviceId);
  await nextButton(guest).click();
  await pickFirstSlot(guest);
  await nextButton(guest).click();
  await fillGuestContact(guest);
  await nextButton(guest).click();
  await expect(guest.getByTestId('step-intake')).toBeVisible();
}

test.describe('M23-S11a — intake step', () => {
  test('guest: field errors and the summary on missing answers; "Não" is a valid answer; the booking completes', async ({
    page,
    browser,
  }) => {
    await loginAsStaff(page, MANAGER_EMAIL, TENANT_SLUG);
    const service = await seedIntakeService(page, { participants: true, attendees: true });
    const guest = await newGuestPage(browser);

    try {
      await reachIntake(guest.page, service.serviceId);
      await expect(stepIndicator(guest.page, 4, 5)).toBeVisible();

      await nextButton(guest.page).click();
      await expect(
        guest.page.locator('[data-testid="intake-field-error"][data-field-key="goal"]'),
      ).toBeVisible();
      await expect(
        guest.page.locator('[data-testid="intake-field-error"][data-field-key="equipment"]'),
      ).toBeVisible();
      await expect(guest.page.getByTestId('intake-field-error-participants')).toBeVisible();
      await expect(guest.page.getByTestId('intake-consent-error')).toBeVisible();
      await expect(guest.page.getByTestId('intake-error-summary')).toContainText(
        '4 campos precisam de atenção',
      );

      await guest.page
        .locator('[data-testid="intake-input"][data-field-key="goal"]')
        .fill('Treino');
      await guest.page.getByRole('radio', { name: 'Não' }).check();
      await guest.page.getByTestId('intake-participants').fill('0');
      await nextButton(guest.page).click();
      await expect(guest.page.getByTestId('intake-field-error-participants')).toBeVisible();

      await guest.page.getByTestId('intake-participants').fill('2');
      await guest.page.getByRole('button', { name: 'Adicionar participante' }).click();
      await guest.page.getByTestId('intake-attendee-name').first().fill('Ana');
      await guest.page.getByRole('checkbox', { name: 'Menor de idade' }).check();
      await guest.page.getByTestId('intake-consent').check();
      await nextButton(guest.page).click();
      await confirmBooking(guest.page);

      await expect(guest.page.getByTestId('booking-success')).toBeVisible();
    } finally {
      await guest.close();
      await deactivateService(page, service.serviceId);
    }
  });

  test('the displayed schema version is submitted even when a newer one is published meanwhile', async ({
    page,
    browser,
  }) => {
    await loginAsStaff(page, MANAGER_EMAIL, TENANT_SLUG);
    const service = await seedIntakeService(page);
    const guest = await newGuestPage(browser);

    try {
      await openBooking(guest.page);
      await selectService(guest.page, service.serviceId);
      await nextButton(guest.page).click();
      await expect(stepIndicator(guest.page, 2, 5)).toBeVisible();

      await publishIntakeSchema(page, service.serviceId, {
        questions: [
          ...QUESTIONS,
          { fieldKey: 'extra', label: 'Nova pergunta', type: 'FREE_TEXT', required: true },
        ],
        consentText: 'Termos v2.',
      });

      await pickFirstSlot(guest.page);
      await nextButton(guest.page).click();
      await fillGuestContact(guest.page);
      await nextButton(guest.page).click();
      await guest.page
        .locator('[data-testid="intake-input"][data-field-key="goal"]')
        .fill('Treino');
      await guest.page.getByRole('radio', { name: 'Sim' }).check();
      await guest.page.getByTestId('intake-consent').check();
      await expect(
        guest.page.locator('[data-testid="intake-input"][data-field-key="extra"]'),
      ).toHaveCount(0);
      await nextButton(guest.page).click();
      await confirmBooking(guest.page);

      await expect(guest.page.getByTestId('booking-success')).toBeVisible();
    } finally {
      await guest.close();
      await deactivateService(page, service.serviceId);
    }
  });

  test('a mocked server-side rejection shows the summary banner only and keeps the answers', async ({
    page,
    browser,
  }) => {
    await loginAsStaff(page, MANAGER_EMAIL, TENANT_SLUG);
    const service = await seedIntakeService(page);
    const guest = await newGuestPage(browser);
    await guest.page.route('**/v1/bookings', (route) =>
      route.request().method() === 'POST'
        ? route.fulfill({
            status: 422,
            contentType: 'application/problem+json',
            body: JSON.stringify({
              type: 'about:blank',
              title: 'Unprocessable',
              status: 422,
              code: 'BOOKING_INTAKE_ANSWER_MISSING',
              detail: 'goal',
            }),
          })
        : route.continue(),
    );

    try {
      await reachIntake(guest.page, service.serviceId);
      await guest.page
        .locator('[data-testid="intake-input"][data-field-key="goal"]')
        .fill('Treino');
      await guest.page.getByRole('radio', { name: 'Não' }).check();
      await guest.page.getByTestId('intake-consent').check();
      await nextButton(guest.page).click();
      await confirmBooking(guest.page);

      await expect(guest.page.getByTestId('intake-error-summary')).toContainText(
        'É necessário responder às perguntas obrigatórias e aceitar os termos.',
      );
      await expect(guest.page.getByTestId('intake-field-error')).toHaveCount(0);
      await expect(
        guest.page.locator('[data-testid="intake-input"][data-field-key="goal"]'),
      ).toHaveValue('Treino');
    } finally {
      await guest.close();
      await deactivateService(page, service.serviceId);
    }
  });

  test('a basket with two intake-bearing services shows the backend rejection inline on Step 1', async ({
    page,
    browser,
  }) => {
    await loginAsStaff(page, MANAGER_EMAIL, TENANT_SLUG);
    const first = await seedIntakeService(page);
    const second = await seedIntakeService(page);
    const guest = await newGuestPage(browser);

    try {
      await openBooking(guest.page);
      await selectService(guest.page, first.serviceId);
      await selectService(guest.page, second.serviceId);
      await nextButton(guest.page).click();
      await pickFirstSlot(guest.page);
      await nextButton(guest.page).click();
      await fillGuestContact(guest.page);
      await nextButton(guest.page).click();
      await guest.page
        .locator('[data-testid="intake-input"][data-field-key="goal"]')
        .fill('Treino');
      await guest.page.getByRole('radio', { name: 'Não' }).check();
      await guest.page.getByTestId('intake-consent').check();
      await nextButton(guest.page).click();
      await confirmBooking(guest.page);

      await expect(guest.page.getByTestId('step1-submit-error')).toContainText(
        'Só é possível incluir um serviço de duração variável ou com formulário na mesma reserva.',
      );
      await expect(stepIndicator(guest.page, 1, 5)).toBeVisible();
    } finally {
      await guest.close();
      await deactivateService(page, first.serviceId);
      await deactivateService(page, second.serviceId);
    }
  });

  test('the intake step has no axe violations', async ({ page, browser }) => {
    await loginAsStaff(page, MANAGER_EMAIL, TENANT_SLUG);
    const service = await seedIntakeService(page, { participants: true, attendees: true });
    const guest = await newGuestPage(browser);

    try {
      await reachIntake(guest.page, service.serviceId);
      await nextButton(guest.page).click();
      const results = await new AxeBuilder({ page: guest.page })
        .include('[data-testid="step-intake"]')
        .analyze();

      expect(results.violations).toEqual([]);
    } finally {
      await guest.close();
      await deactivateService(page, service.serviceId);
    }
  });

  test('an authenticated customer completes an intake service with a chosen staff member and sees the pick in the details box', async ({
    page,
  }) => {
    await loginAsStaff(page, MANAGER_EMAIL, TENANT_SLUG);
    const seeded = await seedChoiceService(page);
    await publishIntakeSchema(page, seeded.serviceId, {
      questions: QUESTIONS,
      consentText: 'Li e aceito os termos.',
    });

    try {
      // Staff seeding is done: the same page now becomes the customer (they share one cookie jar).
      await loginAsCustomer(page, uniqueTestEmail('e2e-intake'), TENANT_SLUG);
      await completeCustomerProfile(page, TENANT_SLUG);
      await openBooking(page);
      await selectService(page, seeded.serviceId);
      await nextButton(page).click();

      await expect(stepIndicator(page, 2, 6)).toBeVisible();
      await page.locator(`[data-resource-id="${seeded.resourceIds[0]}"]`).click();
      await nextButton(page).click();
      await pickFirstSlot(page);
      await nextButton(page).click();
      await nextButton(page).click();
      await page.locator('[data-testid="intake-input"][data-field-key="goal"]').fill('Treino');
      await page.getByRole('radio', { name: 'Não' }).check();
      await page.getByTestId('intake-consent').check();
      await nextButton(page).click();
      await confirmBooking(page);

      await expect(page.getByTestId('booking-success')).toBeVisible();
      await expect(page.getByTestId('submitted-resource')).toBeVisible();
    } finally {
      await loginAsStaff(page, MANAGER_EMAIL, TENANT_SLUG);
      await deactivateService(page, seeded.serviceId);
      for (const id of seeded.resourceIds) await deactivateResource(page, id);
    }
  });
});
