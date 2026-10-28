import { expect, test, type Browser, type Page } from '@playwright/test';
import { loginAsCustomer, loginAsStaff, uniqueTestEmail } from './helpers/auth';
import { createFreshApprovedBooking } from './helpers/booking';
import {
  confirmBooking,
  fillGuestContact,
  MANAGER_EMAIL,
  nextButton,
  openBooking,
  openFirstDayWithSlots,
  parseRange,
  selectService,
  slotsOnDate,
  TENANT_SLUG,
} from './helpers/booking-form';
import {
  createService,
  deactivateService,
  makeUniqueServiceName,
  updateService,
} from './helpers/services';

// TD51-S01 — a slot is shown to people as start–appointment end (start + the service's duration);
// the service's trailing buffer keeps the resource held internally and is never displayed.

const STAFF_EMAIL = 'admin@lavacar.com.br';
const SERVICE_SIMPLES_ID = '00000000-0000-7000-8003-000000000001';
const TENANT_TIMEZONE = 'America/Sao_Paulo';
const DURATION_MINUTES = 50;
const BUFFER_MINUTES = 10;

// The tenant is closed on Sundays, so a booking made for one has no slot to reschedule into; the
// weekday is read the way the fixture builds its date (the runner's own calendar).
function skipSunday(daysAhead: number): number {
  const date = new Date();
  date.setDate(date.getDate() + daysAhead);
  return date.getDay() === 0 ? daysAhead + 1 : daysAhead;
}

const hhmm = (iso: string): string =>
  new Intl.DateTimeFormat('pt-BR', {
    timeZone: TENANT_TIMEZONE,
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).format(new Date(iso));

const toMinutes = (label: string): number => {
  const [hours, minutes] = label.split(':').map(Number) as [number, number];
  return hours * 60 + minutes;
};

const label = (minutes: number): string =>
  `${String(Math.floor(minutes / 60)).padStart(2, '0')}:${String(minutes % 60).padStart(2, '0')}`;

async function newGuestPage(browser: Browser): Promise<{ page: Page; close: () => Promise<void> }> {
  const context = await browser.newContext({
    baseURL: process.env.PLAYWRIGHT_BASE_URL ?? 'http://localhost:3000',
  });
  return { page: await context.newPage(), close: () => context.close() };
}

test.describe('TD51-S01 — appointment end vs reserved end', () => {
  test('guest booking: the picker and the details show the 50-minute appointment, never the 10-minute buffer', async ({
    page,
    browser,
  }) => {
    await loginAsStaff(page, MANAGER_EMAIL, TENANT_SLUG);
    const created = await createService(page, {
      name: makeUniqueServiceName('e2e-appointment-end'),
      priceAmount: 40,
      durationMinutes: DURATION_MINUTES,
      loyaltyPointsValue: 0,
    });
    await updateService(page, created.serviceId, { bufferAfterMinutes: BUFFER_MINUTES });
    const guest = await newGuestPage(browser);

    try {
      await openBooking(guest.page);
      await selectService(guest.page, created.serviceId);
      await nextButton(guest.page).click();

      const date = await openFirstDayWithSlots(guest.page);
      const firstSlot = guest.page.getByTestId('time-slot').first();
      await expect(firstSlot).toBeVisible();
      const range = parseRange((await firstSlot.textContent()) ?? '');

      // 09:00–09:50 for a 50-minute service, even though the resource is held until 10:00.
      expect(range.end - range.start).toBe(DURATION_MINUTES);

      const [apiSlot] = (await slotsOnDate(page, created.serviceId, date)).filter(
        (slot) => toMinutes(hhmm(slot.startsAt)) === range.start,
      );
      expect(apiSlot, 'the API offers the slot the page shows').toBeDefined();
      expect(toMinutes(hhmm(apiSlot!.endsAt)) - range.end).toBe(BUFFER_MINUTES);

      await firstSlot.click();
      await nextButton(guest.page).click();
      await fillGuestContact(guest.page);
      await nextButton(guest.page).click();
      // The review step carries the same appointment range as the picker, never the buffered end.
      const review = guest.page.getByTestId('confirmation-datetime');
      await expect(review).toContainText(`${label(range.start)} – ${label(range.end)}`);
      await expect(review).not.toContainText(
        label(range.start + DURATION_MINUTES + BUFFER_MINUTES),
      );
      await confirmBooking(guest.page);

      await expect(guest.page.getByTestId('booking-success')).toBeVisible();
      const details = guest.page.getByTestId('submitted-datetime');
      await expect(details).toContainText(`${label(range.start)}–${label(range.end)}`);
      await expect(details).not.toContainText(
        label(range.start + DURATION_MINUTES + BUFFER_MINUTES),
      );
    } finally {
      await guest.close();
      await deactivateService(page, created.serviceId);
    }
  });

  test('customer reschedule: the slot and the summary show the appointment end', async ({
    page,
  }) => {
    const customerEmail = uniqueTestEmail('appointment-end-reschedule');
    const setup = await createFreshApprovedBooking(page, skipSunday(6), STAFF_EMAIL, {
      contactEmail: customerEmail,
    });
    const bookingDate = new Intl.DateTimeFormat('en-CA', { timeZone: TENANT_TIMEZONE }).format(
      new Date(setup.scheduledAt),
    );
    await loginAsCustomer(page, customerEmail, TENANT_SLUG);

    await page.goto(`/${TENANT_SLUG}/my-account/bookings/${setup.bookingId}/reschedule`);
    const slot = page.getByTestId('time-slot').first();
    await expect(slot).toBeVisible();
    const slotText = ((await slot.textContent()) ?? '').trim();
    const range = parseRange(slotText);

    const apiSlots = await slotsOnDate(page, SERVICE_SIMPLES_ID, bookingDate);
    const apiSlot = apiSlots.find(
      (candidate) => toMinutes(hhmm(candidate.startsAt)) === range.start,
    );
    expect(apiSlot, 'the API offers the slot the page shows').toBeDefined();
    expect(range.end).toBe(toMinutes(hhmm(apiSlot!.appointmentEndsAt)));

    await slot.click();
    const summary = page
      .getByTestId('action-pane-desktop')
      .getByTestId('reschedule-change-summary');
    await expect(summary).toBeVisible();
    if (apiSlot!.endsAt !== apiSlot!.appointmentEndsAt) {
      await expect(summary).not.toContainText(hhmm(apiSlot!.endsAt));
    }
  });
});
