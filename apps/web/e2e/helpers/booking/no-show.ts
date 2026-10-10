import type { Page } from '@playwright/test';
import { loginAsStaff } from '../auth/staff-login';
import { WEB_INTERNAL_KEY } from '../auth/shared';
import { backdateBooking } from '../db/e2e-db';
import { createFreshApprovedBooking } from './approve-booking';
import type { AuthenticatedBookingSetup } from './create-booking';

const BFF_URL = process.env.PLAYWRIGHT_BFF_URL ?? 'http://localhost:3002/v1';
const TENANT_SLUG = 'lavacar-beloauto';

// An APPROVED customer booking whose end time has already passed — UC-074's precondition. Created
// through the normal helpers (so every slot/approval rule runs), then moved into the past in the
// database, because the API refuses a past `scheduledAt`. Leaves the page logged in as `staffEmail`.
export async function createEndedApprovedBooking(
  page: Page,
  daysAhead: number,
  staffEmail: string,
): Promise<AuthenticatedBookingSetup> {
  const setup = await createFreshApprovedBooking(page, daysAhead, staffEmail);
  await backdateBooking(setup.bookingId);
  return setup;
}

// A booking already marked as a no-show by `staffEmail`, through the real BFF route. Leaves the page
// logged in as that staff member.
export async function createNoShowBooking(
  page: Page,
  daysAhead: number,
  staffEmail: string,
  reason = 'Cliente não atendeu o telefone.',
): Promise<AuthenticatedBookingSetup> {
  const setup = await createEndedApprovedBooking(page, daysAhead, staffEmail);
  await loginAsStaff(page, staffEmail, TENANT_SLUG);

  const res = await page.request.post(`${BFF_URL}/bookings/${setup.bookingId}/no-show`, {
    data: { reason },
    headers: { 'X-Web-Internal-Key': WEB_INTERNAL_KEY! },
  });
  if (!res.ok()) {
    throw new Error(`mark no-show failed: ${res.status()} ${await res.text()}`);
  }
  return setup;
}
