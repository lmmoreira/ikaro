import { notFound, redirect } from 'next/navigation';
import type {
  CustomerBookingDetailResponse,
  CustomerBookingListResponse,
  CustomerLoyaltyBalanceResponse,
  CustomerLoyaltyEntriesResponse,
  CustomerLoyaltyRedemptionsResponse,
} from '@ikaro/types';
import { bffServerFetch } from '@/shared/lib/api/bff-server';
import { assertOk, FetchError } from '@/shared/lib/api/errors';

// GET /v1/loyalty/entries and /redemptions default to limit=20 (shared PaginationSchema) —
// pass limit=50 explicitly to match the my-account list pages' page size.
const LOYALTY_HISTORY_LIMIT = 50;

// GET /v1/bookings defaults to status=PENDING,INFO_REQUESTED and limit=20 — both params
// must be passed explicitly or APPROVED/COMPLETED/CANCELLED/REJECTED are silently dropped.
const ALL_BOOKING_STATUSES = 'PENDING,INFO_REQUESTED,APPROVED,COMPLETED,CANCELLED,REJECTED';
const CUSTOMER_BOOKINGS_LIMIT = 50;

export class CustomerFetchError extends FetchError {
  constructor(status: number, code?: string, field?: string, detail?: string) {
    super(`Customer request failed (${status})`, status, code, field, detail);
    this.name = 'CustomerFetchError';
  }
}

// Wraps a my-account page's BFF read: an expired/invalid session (401) or a tenant/actor
// mismatch (403) redirects to login instead of falling through to the generic error boundary.
// Any other failure (network error, 500) rethrows for MyAccountRouteError to catch.
export async function withAuthRedirect<T>(promise: Promise<T>, tenantSlug: string): Promise<T> {
  try {
    return await promise;
  } catch (err) {
    if (err instanceof CustomerFetchError && (err.status === 401 || err.status === 403)) {
      redirect(`/${tenantSlug}/login`);
    }
    throw err;
  }
}

export async function fetchCustomerBookings(token: string): Promise<CustomerBookingListResponse> {
  const query = new URLSearchParams({
    status: ALL_BOOKING_STATUSES,
    limit: String(CUSTOMER_BOOKINGS_LIMIT),
  });
  const res = await bffServerFetch(token, `/bookings?${query}`);
  await assertOk(res, CustomerFetchError);
  return res.json() as Promise<CustomerBookingListResponse>;
}

export async function fetchLoyaltyBalance(token: string): Promise<CustomerLoyaltyBalanceResponse> {
  const res = await bffServerFetch(token, '/loyalty/balance');
  await assertOk(res, CustomerFetchError);
  return res.json() as Promise<CustomerLoyaltyBalanceResponse>;
}

export async function fetchLoyaltyEntries(token: string): Promise<CustomerLoyaltyEntriesResponse> {
  const res = await bffServerFetch(token, `/loyalty/entries?limit=${LOYALTY_HISTORY_LIMIT}`);
  await assertOk(res, CustomerFetchError);
  return res.json() as Promise<CustomerLoyaltyEntriesResponse>;
}

export async function fetchLoyaltyRedemptions(
  token: string,
): Promise<CustomerLoyaltyRedemptionsResponse> {
  const res = await bffServerFetch(token, `/loyalty/redemptions?limit=${LOYALTY_HISTORY_LIMIT}`);
  await assertOk(res, CustomerFetchError);
  return res.json() as Promise<CustomerLoyaltyRedemptionsResponse>;
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
