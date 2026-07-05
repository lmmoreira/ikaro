import type { Page } from '@playwright/test';
import { loginAsStaff } from '../auth/staff-login';
import { uniqueTestEmail } from '../auth';
import { parseDayOffset } from './slot-seed';

const BFF_URL = process.env.PLAYWRIGHT_BFF_URL ?? 'http://localhost:3002/v1';
const TENANT_SLUG = 'lavacar-beloauto';
const SERVICE_SIMPLES_ID = '00000000-0000-7000-8003-000000000001';

export interface GuestInfoRequestedBooking {
  readonly bookingId: string;
  readonly contactEmail: string;
}

// Creates a GUEST (unauthenticated) booking, then flips it to INFO_REQUESTED as staff — the
// same tenant/service constants request-info-booking.ts uses for the authenticated variant.
// Guest bookings (customerId === null) are what mints a tokenised /bookings/:id/submit-info
// link, unlike the authenticated path which links to /dashboard/bookings/:id.
export async function createGuestInfoRequestedBooking(
  page: Page,
  staffEmail: string,
  message: string,
): Promise<GuestInfoRequestedBooking> {
  const contactEmail = uniqueTestEmail('guest-submit-info');
  let bookingId: string | null = null;
  let lastError: string | null = null;

  for (let attempt = 0; attempt < 12; attempt += 1) {
    const scheduledAt = parseDayOffset(5, `${contactEmail}:${attempt}`);
    const res = await page.request.post(`${BFF_URL}/bookings`, {
      headers: { 'X-Tenant-Slug': TENANT_SLUG },
      data: {
        contactEmail,
        contactName: 'E2E Guest',
        contactPhone: '+5531999999999',
        scheduledAt,
        serviceIds: [SERVICE_SIMPLES_ID],
      },
    });

    if (res.ok()) {
      const body = (await res.json()) as { bookingId: string };
      bookingId = body.bookingId;
      break;
    }

    const errorText = await res.text();
    if (res.status() !== 409) {
      throw new Error(`guest booking setup failed: ${res.status()} ${errorText}`);
    }
    lastError = errorText;
  }

  if (!bookingId) {
    throw new Error(
      `guest booking setup failed after retrying available slots: ${lastError ?? '409 conflict'}`,
    );
  }

  await loginAsStaff(page, staffEmail, TENANT_SLUG);
  const res = await page.request.patch(`${BFF_URL}/bookings/${bookingId}/request-info`, {
    data: { message },
  });
  if (!res.ok()) {
    throw new Error(`request-info setup failed: ${res.status()} ${await res.text()}`);
  }

  return { bookingId, contactEmail };
}

export const GUEST_INFO_REQUEST_TENANT_SLUG = TENANT_SLUG;
