import type {
  CustomerBookingDetailResponse,
  CustomerBookingListResponse,
  CustomerLoyaltyBalanceResponse,
} from '@ikaro/types';
import { bffServerFetch } from '@/shared/lib/api/bff-server';

// GET /v1/bookings defaults to status=PENDING,INFO_REQUESTED and limit=20 — both params
// must be passed explicitly or APPROVED/COMPLETED/CANCELLED/REJECTED are silently dropped.
const ALL_BOOKING_STATUSES = 'PENDING,INFO_REQUESTED,APPROVED,COMPLETED,CANCELLED,REJECTED';
const CUSTOMER_BOOKINGS_LIMIT = 50;

export async function fetchCustomerBookings(token: string): Promise<CustomerBookingListResponse> {
  const query = new URLSearchParams({
    status: ALL_BOOKING_STATUSES,
    limit: String(CUSTOMER_BOOKINGS_LIMIT),
  });
  const res = await bffServerFetch(token, `/bookings?${query}`);
  if (!res.ok) throw new Error(`Failed to fetch customer bookings (${res.status})`);
  return res.json() as Promise<CustomerBookingListResponse>;
}

export async function fetchLoyaltyBalance(token: string): Promise<CustomerLoyaltyBalanceResponse> {
  const res = await bffServerFetch(token, '/loyalty/balance');
  if (!res.ok) throw new Error(`Failed to fetch loyalty balance (${res.status})`);
  return res.json() as Promise<CustomerLoyaltyBalanceResponse>;
}

export class CustomerBookingDetailFetchError extends Error {
  constructor(
    public readonly status: number,
    message: string,
  ) {
    super(message);
    this.name = 'CustomerBookingDetailFetchError';
    Object.setPrototypeOf(this, new.target.prototype);
  }
}

export async function fetchCustomerBookingDetail(
  token: string,
  bookingId: string,
): Promise<CustomerBookingDetailResponse> {
  const res = await bffServerFetch(token, `/bookings/${bookingId}`);
  if (!res.ok) {
    throw new CustomerBookingDetailFetchError(
      res.status,
      res.status === 404 ? 'Booking not found' : `Failed to fetch booking detail (${res.status})`,
    );
  }
  return res.json() as Promise<CustomerBookingDetailResponse>;
}
