import type { Page } from '@playwright/test';
import { loginAsCustomer } from '../auth/customer-login';
import { uniqueTestEmail } from '../auth';
import { completeCustomerProfile } from '../customer';
import { parseDayOffset } from './slot-seed';

const BFF_URL = process.env.PLAYWRIGHT_BFF_URL ?? 'http://localhost:3002/v1';
const SERVICE_SIMPLES_ID = '00000000-0000-7000-8003-000000000001';

export interface CreateAuthenticatedBookingOptions {
  readonly tenantSlug: string;
  readonly emailPrefix: string;
  readonly daysAhead: number;
  readonly serviceIds?: readonly string[];
  readonly notes?: string;
}

export interface AuthenticatedBookingSetup {
  readonly bookingId: string;
  readonly scheduledAt: string;
  readonly contactEmail: string;
}

export async function createAuthenticatedBooking(
  page: Page,
  options: CreateAuthenticatedBookingOptions,
): Promise<AuthenticatedBookingSetup> {
  const contactEmail = uniqueTestEmail(options.emailPrefix);
  await loginAsCustomer(page, contactEmail, options.tenantSlug);
  await completeCustomerProfile(page, options.tenantSlug);
  const serviceIds = options.serviceIds ?? [SERVICE_SIMPLES_ID];
  let lastError: string | null = null;

  for (let attempt = 0; attempt < 12; attempt += 1) {
    const scheduledAt = parseDayOffset(options.daysAhead, `${contactEmail}:${attempt}`);
    const res = await page.request.post(`${BFF_URL}/bookings/authenticated`, {
      data: {
        scheduledAt,
        serviceIds,
        ...(options.notes ? { notes: options.notes } : {}),
      },
    });

    if (res.ok()) {
      const body = (await res.json()) as { bookingId: string; scheduledAt: string };
      return {
        bookingId: body.bookingId,
        scheduledAt: body.scheduledAt,
        contactEmail,
      };
    }

    const errorText = await res.text();
    if (res.status() !== 409) {
      throw new Error(`authenticated booking setup failed: ${res.status()} ${errorText}`);
    }
    lastError = errorText;
  }

  throw new Error(
    `authenticated booking setup failed after retrying available slots: ${lastError ?? '409 conflict'}`,
  );
}
