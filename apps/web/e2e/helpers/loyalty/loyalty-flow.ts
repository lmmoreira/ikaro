import type { Page } from '@playwright/test';
import { createFreshApprovedBooking } from '../booking';

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
  await page.getByRole('button', { name: 'Usar todos' }).click();
  await page.getByRole('button', { name: 'Confirmar conclusão' }).click();
  await page.getByTestId('booking-loyalty-points-active').waitFor();

  return {
    customerEmail,
    earnedBookingId: earnedSetup.bookingId,
    redeemBookingId: redeemSetup.bookingId,
  };
}

export const LOYALTY_STAFF_TENANT_SLUG = STAFF_TENANT_SLUG;
