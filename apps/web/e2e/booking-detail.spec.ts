import { expect, test } from '@playwright/test';
import { loginAsCustomer, loginAsStaff, uniqueTestEmail } from './helpers/auth';
import { seedJourney, findFirstSlot } from './helpers/booking-form';
import {
  bookAsNewCustomer,
  cancelBookingInDashboard,
  createFreshApprovedBooking,
  createFreshCompletedBooking,
  roomPick,
  seedBundleWithIntake,
} from './helpers/booking';

const TENANT_SLUG = 'lavacar-beloauto';
const STAFF_EMAIL = 'admin@lavacar.com.br';
const TIME_RANGE = /\d{2}:\d{2}\s+—\s+\d{2}:\d{2}/;

const NEW_CARD_TEST_IDS = [
  'booking-resources-card',
  'booking-itinerary-card',
  'booking-participants-card',
  'booking-intake-card',
  'booking-addresses-card',
  'booking-cancellation-card',
  'booking-rejection-card',
];

test.describe('full booking detail (staff and customer)', () => {
  test('a plain booking shows the origin card and none of the resource, participant or intake cards', async ({
    page,
  }) => {
    const setup = await createFreshApprovedBooking(page, 40, STAFF_EMAIL);
    await loginAsStaff(page, STAFF_EMAIL, TENANT_SLUG);

    await page.goto(`/dashboard/bookings/${setup.bookingId}`);

    await expect(page.getByTestId('booking-origin-card')).toContainText('Solicitado em');
    for (const testId of NEW_CARD_TEST_IDS) {
      await expect(page.getByTestId(testId)).toHaveCount(0);
    }
  });

  test('a bundle with participants and an intake form: staff see everything, the customer sees their subset, and the resources outlive a cancellation', async ({
    page,
    browser,
  }) => {
    await loginAsStaff(page, STAFF_EMAIL, TENANT_SLUG);
    const seeded = await seedBundleWithIntake(page);
    const pick = roomPick(seeded.serviceId, seeded.room.id);
    const slot = await findFirstSlot(page, seeded.serviceId, [pick]);
    const customer = await bookAsNewCustomer(browser, 'detail-bundle', TENANT_SLUG, {
      scheduledAt: slot.startsAt,
      serviceIds: [seeded.serviceId],
      resourceSelections: [pick],
      participantCount: 2,
      attendees: [{ name: 'Maria Souza' }, { name: 'Pedro Souza', isMinor: true }],
      intakeAnswers: { level: 'Iniciante', injury: true },
      consentAccepted: true,
      notes: 'Primeira aula',
    });

    try {
      await page.goto(`/dashboard/bookings/${customer.bookingId}`);
      const resources = page.getByTestId('booking-resources-card');
      await expect(resources).toContainText(seeded.room.name);
      await expect(resources).toContainText('escolhido pelo cliente');
      await expect(resources).toContainText(seeded.staff.name);
      await expect(resources).toContainText('atribuído pelo sistema');
      const participants = page.getByTestId('booking-participants-card');
      await expect(participants).toContainText('Maria Souza');
      await expect(participants).toContainText('Pedro Souza');
      await expect(participants).toContainText('menor');
      const intake = page.getByTestId('booking-intake-card');
      await expect(intake).toContainText('Formulário de entrada');
      await expect(intake).toContainText('Nível de experiência');
      await expect(intake).toContainText('Iniciante');
      await expect(intake).toContainText('Sim');
      await expect(page.getByTestId('booking-customer-notes-card')).toContainText('Primeira aula');

      await customer.page.goto(`/${TENANT_SLUG}/my-account/bookings/${customer.bookingId}`);
      await expect(customer.page.getByTestId('booking-resources-card')).toContainText(
        seeded.room.name,
      );
      await expect(customer.page.getByTestId('booking-participants-card')).toContainText(
        'Pedro Souza',
      );
      await expect(customer.page.getByTestId('booking-intake-card')).toContainText(
        'Suas respostas',
      );
      await expect(customer.page.getByTestId('booking-internal-notes-card')).toHaveCount(0);
      await expect(customer.page.getByTestId('booking-origin-card')).toHaveCount(0);

      await cancelBookingInDashboard(page, customer.bookingId, 'Sala em reforma');

      // The reservation is released, but the booking still says which resources it had.
      await page.goto(`/dashboard/bookings/${customer.bookingId}`);
      await expect(page.getByTestId('booking-resources-card')).toContainText(seeded.room.name);
      await expect(page.getByTestId('booking-cancellation-card')).toContainText('Sala em reforma');
      await customer.page.goto(`/${TENANT_SLUG}/my-account/bookings/${customer.bookingId}`);
      await expect(customer.page.getByTestId('booking-resources-card')).toContainText(
        seeded.room.name,
      );
      await expect(customer.page.getByTestId('booking-cancellation-card')).toContainText(
        'O estabelecimento',
      );
      await expect(customer.page.getByTestId('booking-cancellation-card')).toContainText(
        'Sala em reforma',
      );
    } finally {
      await customer.close();
    }
  });

  test('a legged booking keeps its legs, with their times while live and without them once cancelled', async ({
    page,
    browser,
  }) => {
    await loginAsStaff(page, STAFF_EMAIL, TENANT_SLUG);
    const journey = await seedJourney(page, 'e2e-detalhe-jornada');
    const serviceId = journey.service.serviceId;
    const picks = [
      {
        serviceId,
        legIndex: 1,
        resourceType: 'STAFF' as const,
        resourceId: journey.staffs[0]!.id,
      },
      {
        serviceId,
        legIndex: 2,
        resourceType: 'EQUIPMENT' as const,
        resourceId: journey.equipments[0]!.id,
      },
    ];
    const slot = await findFirstSlot(page, serviceId, picks);
    const customer = await bookAsNewCustomer(browser, 'detail-journey', TENANT_SLUG, {
      scheduledAt: slot.startsAt,
      serviceIds: [serviceId],
      resourceSelections: picks,
    });

    try {
      await page.goto(`/dashboard/bookings/${customer.bookingId}`);
      const itinerary = page.getByTestId('booking-itinerary-card');
      await expect(itinerary).toContainText('Sauna');
      await expect(itinerary).toContainText('Massagem');
      await expect(itinerary).toContainText('Relaxamento');
      await expect(itinerary).toContainText(TIME_RANGE);

      await cancelBookingInDashboard(page, customer.bookingId, 'Imprevisto');

      await page.goto(`/dashboard/bookings/${customer.bookingId}`);
      const cancelled = page.getByTestId('booking-itinerary-card');
      await expect(cancelled).toContainText('Sauna');
      await expect(cancelled).toContainText('Massagem');
      await expect(cancelled).toContainText('Relaxamento');
      await expect(cancelled).not.toContainText(TIME_RANGE);
    } finally {
      await customer.close();
    }
  });

  test('a cancelled booking shows who cancelled and the way back, to staff and to the customer', async ({
    page,
    browser,
  }) => {
    const customerEmail = uniqueTestEmail('detail-cancelled');
    const setup = await createFreshApprovedBooking(page, 44, STAFF_EMAIL, {
      contactEmail: customerEmail,
    });
    await loginAsStaff(page, STAFF_EMAIL, TENANT_SLUG);

    await cancelBookingInDashboard(page, setup.bookingId, 'Equipamento em manutenção');

    // Reloaded, the detail is the read-only terminal state: the cancellation card, no actions,
    // and the way back to the Agenda.
    await page.goto(`/dashboard/bookings/${setup.bookingId}`);
    const card = page.getByTestId('booking-cancellation-card');
    await expect(card).toContainText('Cancelado por');
    await expect(card).toContainText('Equipamento em manutenção');
    await expect(
      page.locator('main aside').getByRole('link', { name: 'Voltar à agenda' }),
    ).toBeVisible();

    const customerContext = await browser.newContext();
    const customerPage = await customerContext.newPage();
    try {
      await loginAsCustomer(customerPage, customerEmail, TENANT_SLUG);
      await customerPage.goto(`/${TENANT_SLUG}/my-account/bookings/${setup.bookingId}`);

      await expect(customerPage.getByTestId('booking-ended-notice')).toContainText(
        'Agendamento cancelado',
      );
      const customerCard = customerPage.getByTestId('booking-cancellation-card');
      await expect(customerCard).toContainText('O estabelecimento');
      await expect(customerCard).toContainText('Equipamento em manutenção');
      await expect(customerPage.getByTestId('booking-internal-notes-card')).toHaveCount(0);
      await expect(customerPage.getByTestId('booking-origin-card')).toHaveCount(0);
      await expect(
        customerPage.getByRole('link', { name: 'Fazer novo agendamento' }).first(),
      ).toBeVisible();
    } finally {
      await customerContext.close();
    }
  });

  test('a completed booking keeps showing what was charged', async ({ page }) => {
    const setup = await createFreshCompletedBooking(page, 48, STAFF_EMAIL);

    await page.goto(`/dashboard/bookings/${setup.bookingId}`);

    await expect(page.getByTestId('booking-completed-title')).toBeVisible();
    await expect(page.getByTestId('complete-summary-quoted')).toBeVisible();
    await expect(page.getByTestId('complete-summary-charged')).toBeVisible();
  });
});
