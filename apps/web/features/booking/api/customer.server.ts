import { notFound, redirect } from 'next/navigation';
import type { CustomerBookingDetailResponse, CustomerBookingListResponse } from '@ikaro/types';
import { bffServerFetch } from '@/shared/lib/api/bff-server';
import { assertOk, CustomerFetchError } from '@/shared/lib/api/errors';

// GET /v1/bookings defaults to status=PENDING,INFO_REQUESTED and limit=20 — both params
// must be passed explicitly or APPROVED/COMPLETED/CANCELLED/REJECTED/NO_SHOW are silently dropped.
const ALL_BOOKING_STATUSES = 'PENDING,INFO_REQUESTED,APPROVED,COMPLETED,CANCELLED,REJECTED,NO_SHOW';
const CUSTOMER_BOOKINGS_LIMIT = 50;

export interface FetchCustomerBookingsOptions {
  /** Only this recurring schedule's occurrence bookings (M23-S08). */
  readonly recurringScheduleId?: string;
  /** Comma-separated BookingStatus values; defaults to every status. */
  readonly status?: string;
  /** A tenant-local calendar day (YYYY-MM-DD): bookings from that day on. */
  readonly from?: string;
  /** 1-based page; defaults to the first. */
  readonly page?: number;
  readonly limit?: number;
}

export async function fetchCustomerBookings(
  token: string,
  options: FetchCustomerBookingsOptions = {},
): Promise<CustomerBookingListResponse> {
  const query = new URLSearchParams({
    status: options.status ?? ALL_BOOKING_STATUSES,
    limit: String(options.limit ?? CUSTOMER_BOOKINGS_LIMIT),
  });
  if (options.page !== undefined) query.set('page', String(options.page));
  if (options.from !== undefined) query.set('from', options.from);
  if (options.recurringScheduleId !== undefined) {
    query.set('recurringScheduleId', options.recurringScheduleId);
  }
  const res = await bffServerFetch(token, `/bookings?${query}`);
  await assertOk(res, CustomerFetchError);
  return res.json() as Promise<CustomerBookingListResponse>;
}

async function fetchCustomerBookingDetail(
  token: string,
  bookingId: string,
): Promise<CustomerBookingDetailResponse> {
  const res = await bffServerFetch(token, `/bookings/${bookingId}`);
  await assertOk(res, CustomerFetchError);
  return res.json() as Promise<CustomerBookingDetailResponse>;
}

// Used by every bookings/[id]/** route (detail, cancel confirm, cancel error) — 404 means the
// booking doesn't exist or belongs to a different customer/tenant; 401/403 means the session
// no longer authenticates this customer at this tenant. Both cases are indistinguishable to the
// caller by design (never reveal whether a booking exists to someone who can't access it).
export async function fetchCustomerBookingDetailOrRedirect(
  token: string,
  bookingId: string,
  tenantSlug: string,
): Promise<CustomerBookingDetailResponse> {
  try {
    return await fetchCustomerBookingDetail(token, bookingId);
  } catch (err) {
    if (err instanceof CustomerFetchError) {
      if (err.status === 404) notFound();
      if (err.status === 401 || err.status === 403) redirect(`/${tenantSlug}/login`);
    }
    throw err;
  }
}
