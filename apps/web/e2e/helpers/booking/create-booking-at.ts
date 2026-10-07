import type { Page } from '@playwright/test';
import type { ResourceSelectionItem } from '@ikaro/types';
import { loginAsCustomer } from '../auth/customer-login';
import { WEB_INTERNAL_KEY } from '../auth/shared';
import { completeCustomerProfile } from '../customer';
import { approveBookingAsStaff } from './approve-booking';

const BFF_URL = process.env.PLAYWRIGHT_BFF_URL ?? 'http://localhost:3002/v1';

export interface CreateApprovedBookingAtOptions {
  readonly tenantSlug: string;
  readonly staffEmail: string;
  readonly contactEmail: string;
  readonly scheduledAt: string;
  readonly serviceIds: readonly string[];
  readonly resourceSelections?: readonly ResourceSelectionItem[];
}

// An APPROVED customer booking at an exact slot with optional resource picks — the fixed-slot
// counterpart of createFreshApprovedBooking, for a spec that must book one specific slot (a
// chosen resource's own free slot) instead of whichever slot a day-offset search lands on. Leaves
// the page logged in as staff, like createFreshApprovedBooking does.
export async function createApprovedBookingAt(
  page: Page,
  options: CreateApprovedBookingAtOptions,
): Promise<{ readonly bookingId: string }> {
  await loginAsCustomer(page, options.contactEmail, options.tenantSlug);
  await completeCustomerProfile(page, options.tenantSlug);

  const res = await page.request.post(`${BFF_URL}/bookings/authenticated`, {
    data: {
      scheduledAt: options.scheduledAt,
      serviceIds: options.serviceIds,
      ...(options.resourceSelections ? { resourceSelections: options.resourceSelections } : {}),
    },
    headers: { 'X-Web-Internal-Key': WEB_INTERNAL_KEY! },
  });
  if (!res.ok()) {
    throw new Error(`booking at a fixed slot failed: ${res.status()} ${await res.text()}`);
  }

  const { bookingId } = (await res.json()) as { bookingId: string };
  await approveBookingAsStaff(page, bookingId, options.staffEmail);
  return { bookingId };
}
