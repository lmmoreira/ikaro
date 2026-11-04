import type { Page } from '@playwright/test';
import { loginAsStaff } from '../auth/staff-login';
import { WEB_INTERNAL_KEY } from '../auth/shared';
import { createAuthenticatedBooking, type AuthenticatedBookingSetup } from './create-booking';

const BFF_URL = process.env.PLAYWRIGHT_BFF_URL ?? 'http://localhost:3002/v1';
const STAFF_TENANT_SLUG = 'lavacar-beloauto';

export async function approveBookingAsStaff(
  page: Page,
  bookingId: string,
  staffEmail: string,
): Promise<void> {
  await loginAsStaff(page, staffEmail, STAFF_TENANT_SLUG);

  const res = await page.request.patch(`${BFF_URL}/bookings/${bookingId}/approve`, {
    data: {},
    headers: { 'X-Web-Internal-Key': WEB_INTERNAL_KEY! },
  });

  if (!res.ok()) {
    throw new Error(`approve booking failed: ${res.status()} ${await res.text()}`);
  }
}

export async function createFreshApprovedBooking(
  page: Page,
  daysAhead: number | 'soonest',
  staffEmail: string,
  options: {
    readonly contactEmail?: string;
    readonly serviceIds?: readonly string[];
  } = {},
): Promise<AuthenticatedBookingSetup> {
  // createAuthenticatedBooking tries every slot of the day and then the following days, so there is
  // no capacity retry to do here: a 409 from it means the tenant has no room left at all.
  const setup = await createAuthenticatedBooking(page, {
    tenantSlug: STAFF_TENANT_SLUG,
    emailPrefix: `lifecycle-${daysAhead}`,
    daysAhead,
    ...(options.contactEmail ? { contactEmail: options.contactEmail } : {}),
    ...(options.serviceIds ? { serviceIds: options.serviceIds } : {}),
  });
  await approveBookingAsStaff(page, setup.bookingId, staffEmail);
  return setup;
}
