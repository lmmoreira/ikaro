import { expect, test, type Page } from '@playwright/test';
import type { ResourceSelectionItem } from '@ikaro/types';
import { loginAsCustomer, loginAsStaff, uniqueTestEmail } from './helpers/auth';
import {
  createApprovedBookingAt,
  createAuthenticatedBooking,
  createFreshApprovedBooking,
  deactivateResource,
} from './helpers/booking';
import { MANAGER_EMAIL, seedChoiceService, slotsOnDate, TENANT_SLUG } from './helpers/booking-form';
import { deactivateService } from './helpers/services';

const STAFF_EMAIL = 'admin@lavacar.com.br';
const SERVICE_SIMPLES_ID = '00000000-0000-7000-8003-000000000001';
const TENANT_TIMEZONE = 'America/Sao_Paulo';

// The app's own "today" is the tenant-local calendar day, so a day offset is computed the same way
// (docs/ENGINEERING_RULES_TESTING.md — an E2E that computes "today" itself).
function tenantDate(daysAhead: number): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: TENANT_TIMEZONE }).format(
    new Date(Date.now() + daysAhead * 24 * 60 * 60 * 1000),
  );
}

async function firstSlotFromDay(
  page: Page,
  serviceId: string,
  picks: readonly ResourceSelectionItem[],
  fromDay: number,
): Promise<{ readonly date: string; readonly startsAt: string }> {
  for (let offset = fromDay; offset < fromDay + 10; offset += 1) {
    const date = tenantDate(offset);
    const slots = await slotsOnDate(page, serviceId, date, picks);
    if (slots[0]) return { date, startsAt: slots[0].startsAt };
  }
  throw new Error(`no slot found for service ${serviceId} from day +${fromDay}`);
}

const desktopPane = (page: Page) => page.getByTestId('action-pane-desktop');
const detailUrl = (bookingId: string) => `/${TENANT_SLUG}/my-account/bookings/${bookingId}`;

test.describe('customer my-account: reschedule a booking (M23-S30, UC-069)', () => {
  test('an APPROVED booking inside the window is moved to another slot and stays approved', async ({
    page,
  }) => {
    const customerEmail = uniqueTestEmail('reschedule-happy');
    const setup = await createFreshApprovedBooking(page, 6, STAFF_EMAIL, {
      contactEmail: customerEmail,
    });
    await loginAsCustomer(page, customerEmail, TENANT_SLUG);

    await page.goto(detailUrl(setup.bookingId));
    await desktopPane(page).getByRole('link', { name: 'Reagendar' }).click();
    await expect(page).toHaveURL(`${detailUrl(setup.bookingId)}/reschedule`);

    const slot = page.getByTestId('time-slot').first();
    await expect(slot).toBeVisible();
    const slotText = (await slot.textContent())!.trim();
    await slot.click();
    await expect(desktopPane(page).getByTestId('reschedule-change-summary')).toBeVisible();
    await desktopPane(page).getByRole('button', { name: 'Confirmar novo horário' }).click();

    await expect(page.getByTestId('reschedule-success')).toBeVisible();
    await expect(page.getByTestId('reschedule-fact-when')).toContainText(slotText);

    await page.goto(detailUrl(setup.bookingId));
    await expect(page.getByTestId('topbar-booking-status-badge')).toContainText('Aprovado');
  });

  test('a slot taken meanwhile shows the conflict, keeps the booking and reloads the list', async ({
    page,
    browser,
  }) => {
    const customerEmail = uniqueTestEmail('reschedule-conflict');
    const setup = await createFreshApprovedBooking(page, 7, STAFF_EMAIL, {
      contactEmail: customerEmail,
    });
    const bookingDate = new Intl.DateTimeFormat('en-CA', { timeZone: TENANT_TIMEZONE }).format(
      new Date(setup.scheduledAt),
    );
    await loginAsCustomer(page, customerEmail, TENANT_SLUG);

    await page.goto(`${detailUrl(setup.bookingId)}/reschedule`);
    const firstSlot = page.getByTestId('time-slot').first();
    await expect(firstSlot).toBeVisible();
    const [offered] = await slotsOnDate(page, SERVICE_SIMPLES_ID, bookingDate);
    await firstSlot.click();

    // A PENDING booking on this tenant's degenerate resource holds nothing (a REQUESTED row), so
    // the competing booking is approved — in its own browser context, to keep this session.
    const context = await browser.newContext({
      baseURL: process.env.PLAYWRIGHT_BASE_URL ?? 'http://localhost:3000',
    });
    try {
      await createApprovedBookingAt(await context.newPage(), {
        tenantSlug: TENANT_SLUG,
        staffEmail: STAFF_EMAIL,
        contactEmail: uniqueTestEmail('reschedule-blocker'),
        scheduledAt: offered!.startsAt,
        serviceIds: [SERVICE_SIMPLES_ID],
      });
    } finally {
      await context.close();
    }
    await desktopPane(page).getByRole('button', { name: 'Confirmar novo horário' }).click();

    await expect(page.getByTestId('reschedule-error')).toContainText(
      'O horário solicitado não está mais disponível.',
    );
    await expect(
      desktopPane(page).getByRole('button', { name: 'Confirmar novo horário' }),
    ).toBeDisabled();

    await page.goto(detailUrl(setup.bookingId));
    await expect(page.getByTestId('topbar-booking-status-badge')).toContainText('Aprovado');
    await expect(desktopPane(page).getByRole('link', { name: 'Reagendar' })).toBeVisible();
  });

  test('past the reschedule window of an APPROVED booking: no button, and the direct URL shows the deadline screen', async ({
    page,
  }) => {
    const customerEmail = uniqueTestEmail('reschedule-expired');
    // daysAhead: 1 is tomorrow — always inside the 48h window a customer may reschedule from.
    const setup = await createFreshApprovedBooking(page, 1, STAFF_EMAIL, {
      contactEmail: customerEmail,
    });
    // The fixture helper moves to a later day when every slot of tomorrow is taken; a booking that
    // drifted past the 48h window would make this scenario assert nothing.
    expect(Date.parse(setup.scheduledAt) - Date.now()).toBeLessThan(48 * 60 * 60 * 1000);
    await loginAsCustomer(page, customerEmail, TENANT_SLUG);

    await page.goto(detailUrl(setup.bookingId));
    await expect(page.getByTestId('topbar-booking-status-badge')).toBeVisible();
    await expect(page.getByRole('link', { name: 'Reagendar' })).toHaveCount(0);

    await page.goto(`${detailUrl(setup.bookingId)}/reschedule`);
    await expect(page.getByTestId('reschedule-window-error')).toBeVisible();
    await expect(page.getByTestId('time-slot')).toHaveCount(0);
  });

  test('a PENDING booking offers no reschedule and its reschedule URL returns to the detail', async ({
    page,
  }) => {
    const customerEmail = uniqueTestEmail('reschedule-pending');
    const setup = await createAuthenticatedBooking(page, {
      tenantSlug: TENANT_SLUG,
      emailPrefix: 'reschedule-pending',
      daysAhead: 8,
      contactEmail: customerEmail,
    });
    await loginAsCustomer(page, customerEmail, TENANT_SLUG);

    await page.goto(detailUrl(setup.bookingId));
    await expect(page.getByTestId('topbar-booking-status-badge')).toBeVisible();
    await expect(page.getByRole('link', { name: 'Reagendar' })).toHaveCount(0);

    await page.goto(`${detailUrl(setup.bookingId)}/reschedule`);
    await expect(page).toHaveURL(detailUrl(setup.bookingId));
  });

  test('a chosen-staff booking shows the kept pick read-only and only that staff member’s slots', async ({
    page,
  }) => {
    await loginAsStaff(page, MANAGER_EMAIL, TENANT_SLUG);
    const seeded = await seedChoiceService(page);
    const [staffA] = seeded.resourceIds as [string, string];
    const pick: ResourceSelectionItem = {
      serviceId: seeded.serviceId,
      legIndex: null,
      resourceType: 'STAFF',
      resourceId: staffA,
    };

    try {
      const slot = await firstSlotFromDay(page, seeded.serviceId, [pick], 6);
      const customerEmail = uniqueTestEmail('reschedule-chosen');
      const booking = await createApprovedBookingAt(page, {
        tenantSlug: TENANT_SLUG,
        staffEmail: MANAGER_EMAIL,
        contactEmail: customerEmail,
        scheduledAt: slot.startsAt,
        serviceIds: [seeded.serviceId],
        resourceSelections: [pick],
      });
      await loginAsCustomer(page, customerEmail, TENANT_SLUG);

      await page.goto(`${detailUrl(booking.bookingId)}/reschedule`);

      await expect(page.getByTestId('reschedule-kept-picks')).toContainText('Profissional');
      const pinned = await slotsOnDate(page, seeded.serviceId, slot.date, [pick]);
      await expect(page.getByTestId('time-slot')).toHaveCount(pinned.length);
    } finally {
      await loginAsStaff(page, MANAGER_EMAIL, TENANT_SLUG);
      await deactivateService(page, seeded.serviceId);
      for (const id of seeded.resourceIds) await deactivateResource(page, id);
    }
  });
});
