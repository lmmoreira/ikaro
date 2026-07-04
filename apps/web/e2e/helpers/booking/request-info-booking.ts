import type { Page } from '@playwright/test';
import { loginAsStaff } from '../auth/staff-login';
import { createAuthenticatedBooking, type AuthenticatedBookingSetup } from './create-booking';

const BFF_URL = process.env.PLAYWRIGHT_BFF_URL ?? 'http://localhost:3002/v1';
const STAFF_TENANT_SLUG = 'lavacar-beloauto';

// Creates a PENDING booking then flips it to INFO_REQUESTED as staff (UC-005 main flow),
// mirroring the API path exercised via UI in staff-booking-lifecycle.spec.ts.
export async function createInfoRequestedBooking(
  page: Page,
  daysAhead: number,
  staffEmail: string,
  message: string,
  options: { readonly contactEmail?: string } = {},
): Promise<AuthenticatedBookingSetup> {
  const setup = await createAuthenticatedBooking(page, {
    tenantSlug: STAFF_TENANT_SLUG,
    emailPrefix: `info-requested-${daysAhead}`,
    daysAhead,
    ...(options.contactEmail ? { contactEmail: options.contactEmail } : {}),
  });

  await loginAsStaff(page, staffEmail, STAFF_TENANT_SLUG);
  const res = await page.request.patch(`${BFF_URL}/bookings/${setup.bookingId}/request-info`, {
    data: { message },
  });
  if (!res.ok()) {
    throw new Error(`request-info setup failed: ${res.status()} ${await res.text()}`);
  }

  return setup;
}

export const INFO_REQUEST_STAFF_TENANT_SLUG = STAFF_TENANT_SLUG;
