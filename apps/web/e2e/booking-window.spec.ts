import { expect, test, type Page } from '@playwright/test';
import { loginAsStaff } from './helpers/auth';
import {
  MANAGER_EMAIL,
  nextButton,
  openBooking,
  selectService,
  slotsOnDate,
  TENANT_SLUG,
} from './helpers/booking-form';
import { createService, makeUniqueServiceName, setBookingPolicy } from './helpers/services';

const MS_PER_HOUR = 3_600_000;
const MIN_SLOTS_ON_DAY = 6;

// M23-S33 — the public booking page offers exactly the window the backend enforces: a service's
// own maximum narrows the day strip, its minimum notice disables the days that can no longer hold
// a bookable slot, and on the day it reaches it hides the slots that start inside the notice.

async function seedServiceWithWindow(
  page: Page,
  window: { minBookingAdvanceHoursOverride?: number; maxBookingAdvanceDaysOverride?: number },
): Promise<string> {
  const service = await createService(page, {
    name: makeUniqueServiceName('e2e-janela'),
    priceAmount: 40,
    durationMinutes: 30,
    loyaltyPointsValue: 5,
  });
  await setBookingPolicy(page, service.serviceId, window);
  return service.serviceId;
}

async function reachAvailability(guest: Page, serviceId: string): Promise<void> {
  await openBooking(guest);
  await selectService(guest, serviceId);
  await nextButton(guest).click();
  await expect(guest.getByTestId('day-option').first()).toBeVisible({ timeout: 20_000 });
}

test.describe('M23-S33 — booking window on the public page', () => {
  test("a service's own maximum limits the day strip to that many days", async ({ page }) => {
    await loginAsStaff(page, MANAGER_EMAIL, TENANT_SLUG);
    const serviceId = await seedServiceWithWindow(page, { maxBookingAdvanceDaysOverride: 3 });

    await reachAvailability(page, serviceId);

    await expect(page.getByTestId('day-option')).toHaveCount(3);
  });

  test("a service's minimum notice disables the days before the first one it leaves", async ({
    page,
  }) => {
    await loginAsStaff(page, MANAGER_EMAIL, TENANT_SLUG);
    // 72 hours: today and the next two days can no longer hold a slot.
    const serviceId = await seedServiceWithWindow(page, { minBookingAdvanceHoursOverride: 72 });

    await reachAvailability(page, serviceId);

    const days = page.getByTestId('day-option');
    for (const index of [0, 1, 2]) {
      await expect(days.nth(index)).toBeDisabled();
    }
  });

  test("a service's minimum notice hides the slots that start inside it on the first day it reaches, and keeps the later ones", async ({
    page,
  }) => {
    await loginAsStaff(page, MANAGER_EMAIL, TENANT_SLUG);

    // A probe service with no override shows which days the strip offers and what each lists. A
    // day after today is used: today's slots are also trimmed by the clock, which would blur it.
    const probeId = await seedServiceWithWindow(page, {});
    await reachAvailability(page, probeId);
    const stripDates = await Promise.all(
      (await page.getByTestId('day-option').all()).map(
        async (day) => (await day.getAttribute('data-date')) ?? '',
      ),
    );
    let day = '';
    let daySlots: Awaited<ReturnType<typeof slotsOnDate>> = [];
    for (const date of stripDates.slice(1)) {
      const slots = await slotsOnDate(page, probeId, date);
      if (slots.length >= MIN_SLOTS_ON_DAY) {
        day = date;
        daySlots = slots;
        break;
      }
    }
    expect(day, 'a strip day after today listing enough slots to straddle a cutoff').not.toBe('');

    // Whole hours that put the cutoff just after the day's third slot: the first slots are inside
    // the notice, the later ones are not.
    const cutoffSlot = daySlots[Math.floor(daySlots.length / 3)];
    if (!cutoffSlot) throw new Error(`no slots listed on ${day}`);
    const hours = Math.ceil((Date.parse(cutoffSlot.startsAt) - Date.now()) / MS_PER_HOUR);
    const serviceId = await seedServiceWithWindow(page, { minBookingAdvanceHoursOverride: hours });
    const startingBy = (cutoffMs: number): number =>
      daySlots.filter((slot) => Date.parse(slot.startsAt) >= cutoffMs).length;
    const requested = Date.now();
    expect(startingBy(requested + hours * MS_PER_HOUR)).toBeLessThan(daySlots.length);

    await reachAvailability(page, serviceId);
    await page.locator(`[data-testid="day-option"][data-date="${day}"]`).click();

    // The page hides what starts before now + the notice. The notice's edge moves with the clock
    // between the click and the read, so the shown count is bounded by both ends rather than pinned.
    await expect
      .poll(async () => {
        const shown = await page.getByTestId('time-slot').count();
        const atLeast = startingBy(Date.now() + hours * MS_PER_HOUR);
        const atMost = startingBy(requested + hours * MS_PER_HOUR);
        return shown > 0 && shown >= atLeast && shown <= atMost;
      })
      .toBe(true);
  });
});
