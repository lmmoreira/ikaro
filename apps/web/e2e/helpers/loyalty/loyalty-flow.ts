import { expect, type Page } from '@playwright/test';
import { createFreshApprovedBooking } from '../booking';
import { openCustomerLoyaltyDetailByEmail } from './open-loyalty-customer-detail';

const STAFF_TENANT_SLUG = 'lavacar-beloauto';
const SERVICE_COMPLETA_ID = '00000000-0000-7000-8003-000000000002';
const SERVICE_SIMPLES_ID = '00000000-0000-7000-8003-000000000001';

export interface CompletedLoyaltyFlowSetup {
  readonly customerEmail: string;
  readonly earnedBookingId: string;
  readonly redeemBookingId: string;
}

export async function createCompletedLoyaltyFlow(
  page: Page,
  staffEmail: string,
  customerEmail: string,
): Promise<CompletedLoyaltyFlowSetup> {
  const earnedSetup = await createFreshApprovedBooking(page, 9, staffEmail, {
    contactEmail: customerEmail,
    serviceIds: [SERVICE_COMPLETA_ID],
  });

  await page.goto(`/dashboard/bookings/${earnedSetup.bookingId}/complete`);
  await page.getByRole('button', { name: 'Confirmar conclusão' }).click();
  await page.getByTestId('booking-loyalty-points-active').waitFor();

  const redeemSetup = await createFreshApprovedBooking(page, 10, staffEmail, {
    contactEmail: customerEmail,
    // Use a different service so the E2E label check does not collide with the earned row.
    serviceIds: [SERVICE_SIMPLES_ID],
  });

  await page.goto(`/dashboard/bookings/${redeemSetup.bookingId}/complete`);
  await waitForEarnedPoints(page);
  await page.getByRole('button', { name: 'Usar todos' }).click();
  await page.getByRole('button', { name: 'Confirmar conclusão' }).click();
  await page.getByTestId('booking-loyalty-points-active').waitFor();
  await waitForRedemption(page, customerEmail);

  return {
    customerEmail,
    earnedBookingId: earnedSetup.bookingId,
    redeemBookingId: redeemSetup.bookingId,
  };
}

// Points are credited by the loyalty handler when it consumes BookingCompleted, not by the request
// that completed the booking, and the page showing "points active" reads the balance it had at load.
// So the first completion has not credited anything yet when the redeem booking's page opens, and
// "Usar todos" would redeem nothing. Reload until the balance is there.
async function waitForEarnedPoints(page: Page): Promise<void> {
  await expect(async () => {
    await page.reload();
    const text = await page.getByTestId('complete-loyalty-available-points').innerText();
    expect(Number(/\d+/.exec(text)?.[0] ?? 0)).toBeGreaterThan(0);
  }).toPass({ timeout: EFFECTS_TIMEOUT_MS });
}

// The redemption is recorded by the same asynchronous handler: return only once the customer's
// loyalty detail (staff side) lists it, so a spec that opens the loyalty page next never races it.
async function waitForRedemption(page: Page, customerEmail: string): Promise<void> {
  await expect(async () => {
    await openCustomerLoyaltyDetailByEmail(page, customerEmail);
    await page.getByRole('button', { name: 'Resgates' }).click();
    await expect(page.getByTestId('loyalty-redemption-title').first()).toBeVisible({
      timeout: 2_000,
    });
  }).toPass({ timeout: EFFECTS_TIMEOUT_MS });
}

const EFFECTS_TIMEOUT_MS = 30_000;

export const LOYALTY_STAFF_TENANT_SLUG = STAFF_TENANT_SLUG;
