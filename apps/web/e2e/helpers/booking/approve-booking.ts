import type { Page } from '@playwright/test';
import { loginAsStaff } from '../auth/staff-login';
import { createAuthenticatedBooking, type AuthenticatedBookingSetup } from './create-booking';

const BFF_URL = process.env.PLAYWRIGHT_BFF_URL ?? 'http://localhost:3002/v1';
const STAFF_TENANT_SLUG = 'lavacar-beloauto';

async function approveBookingAsStaff(
  page: Page,
  bookingId: string,
  staffEmail: string,
): Promise<void> {
  await loginAsStaff(page, staffEmail, STAFF_TENANT_SLUG);

  const res = await page.request.patch(`${BFF_URL}/bookings/${bookingId}/approve`, {
    data: {},
  });

  if (!res.ok()) {
    throw new Error(`approve booking failed: ${res.status()} ${await res.text()}`);
  }
}

export async function createFreshApprovedBooking(
  page: Page,
  daysAhead: number,
  staffEmail: string,
  options: {
    readonly contactEmail?: string;
    readonly serviceIds?: readonly string[];
  } = {},
): Promise<AuthenticatedBookingSetup> {
  let lastError: string | null = null;

  for (let attempt = 0; attempt < 12; attempt += 1) {
    const setup = await createAuthenticatedBooking(page, {
      tenantSlug: STAFF_TENANT_SLUG,
      emailPrefix: `lifecycle-${daysAhead}`,
      daysAhead: daysAhead + attempt,
      ...(options.contactEmail ? { contactEmail: options.contactEmail } : {}),
      ...(options.serviceIds ? { serviceIds: options.serviceIds } : {}),
    });

    try {
      await approveBookingAsStaff(page, setup.bookingId, staffEmail);
      return setup;
    } catch (error) {
      lastError = error instanceof Error ? error.message : String(error);
      if (!lastError.includes('409')) {
        throw error;
      }
    }
  }

  throw new Error(
    `approved booking setup failed after retrying available slots: ${lastError ?? '409 conflict'}`,
  );
}
