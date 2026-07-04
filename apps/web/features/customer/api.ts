import { bffClient } from '@/shared/lib/api/bff-client';
import type { Address, CustomerProfileResponse, CustomerSearchListResponse } from '@ikaro/types';

export type CustomerAddressResponse = Address;

export interface UpdateCustomerProfileRequest {
  readonly name?: string;
  readonly phone?: string | null;
  readonly defaultAddress?: CustomerAddressResponse | null;
}

export async function getCustomerProfile(): Promise<CustomerProfileResponse> {
  const res = await bffClient.get<CustomerProfileResponse>('/customers/me');
  return res.data;
}

export async function getCustomerById(customerId: string): Promise<CustomerProfileResponse> {
  const res = await bffClient.get<CustomerProfileResponse>(`/customers/${customerId}`);
  return res.data;
}

export async function searchCustomers(
  search?: string,
  limit = 20,
): Promise<CustomerSearchListResponse> {
  const res = await bffClient.get<CustomerSearchListResponse>('/customers', {
    params: search ? { search, limit } : { limit },
  });
  return res.data;
}

export async function updateCustomerProfile(
  body: UpdateCustomerProfileRequest,
): Promise<CustomerProfileResponse> {
  const res = await bffClient.patch<CustomerProfileResponse>('/customers/me', body);
  return res.data;
}

// UC-007 — 200 → CANCELLED; 422 → outside the cancellation window (caller redirects to /cancel/error)
export async function cancelBooking(bookingId: string): Promise<void> {
  await bffClient.patch(`/bookings/${bookingId}/cancel`);
}

// UC-005 A2 — 200 → booking status returns to PENDING
// Body field is `response` (SubmitBookingInfoBodySchema in the BFF), not `message`.
export async function submitInfo(bookingId: string, response: string): Promise<void> {
  await bffClient.patch(`/bookings/${bookingId}/submit-info`, { response });
}
