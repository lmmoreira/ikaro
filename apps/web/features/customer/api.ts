import { bffClient } from '@/shared/lib/api/bff-client';
import type {
  Address,
  AttachmentSignedUrlResponse,
  CustomerProfileResponse,
  CustomerSearchListResponse,
} from '@ikaro/types';

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
// photoUrls get appended to the booking's beforeServicePhotoUrls server-side.
export async function submitInfo(
  bookingId: string,
  response: string,
  photoUrls: readonly string[] = [],
): Promise<void> {
  await bffClient.patch(`/bookings/${bookingId}/submit-info`, {
    response,
    ...(photoUrls.length > 0 ? { photoUrls } : {}),
  });
}

// Same Next.js proxy route the guest booking flow's photo upload uses — the route reads the
// access_token cookie server-side and forwards it as Authorization: Bearer to the BFF, so an
// authenticated customer's request is scoped to their own tenant automatically.
export async function createCustomerAttachmentSignedUrl(
  fileName: string,
  contentType: 'image/jpeg' | 'image/png',
  bookingId: string,
): Promise<AttachmentSignedUrlResponse> {
  const res = await fetch('/api/bookings/attachments/signed-url', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ fileName, contentType, bookingId }),
  });
  if (!res.ok) throw new Error(`Failed to create signed upload URL (${res.status})`);
  return res.json() as Promise<AttachmentSignedUrlResponse>;
}
