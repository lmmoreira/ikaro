import type { Page } from '@playwright/test';
import { createFreshApprovedBooking } from './approve-booking';
import type { AuthenticatedBookingSetup } from './create-booking';

export async function createFreshCompletedBooking(
  page: Page,
  daysAhead: number,
  staffEmail: string,
  options: {
    readonly contactEmail?: string;
    readonly serviceIds?: readonly string[];
  } = {},
): Promise<AuthenticatedBookingSetup> {
  const setup = await createFreshApprovedBooking(page, daysAhead, staffEmail, options);

  await page.goto(`/dashboard/bookings/${setup.bookingId}/complete`);
  await page.getByRole('button', { name: 'Confirmar conclusão' }).click();
  await page.getByTestId('outcome-banner-title').waitFor();

  return setup;
}
