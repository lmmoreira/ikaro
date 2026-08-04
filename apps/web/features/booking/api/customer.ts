import { bffClient } from '@/shared/lib/api/bff-client';
import type { AttachmentSignedUrlResponse, ImageContentType } from '@ikaro/types';

// UC-007 — 200 → CANCELLED; 422 → outside the cancellation window (caller redirects to /cancel/error)
export async function cancelBookingAsCustomer(bookingId: string): Promise<void> {
  await bffClient.patch(`/bookings/${bookingId}/cancel`);
}

// UC-005 A2 — 200 → booking status returns to PENDING
// Body field is `response` (SubmitBookingInfoBodySchema in the BFF), not `message`.
// photoUrls get appended to the booking's beforeServicePhotoUrls server-side.
export async function submitBookingInfoAsCustomer(
  bookingId: string,
  response: string,
  photoUrls: readonly string[] = [],
): Promise<void> {
  await bffClient.patch(`/bookings/${bookingId}/submit-info`, {
    response,
    ...(photoUrls.length > 0 ? { photoUrls } : {}),
  });
}

// Intentionally stays on raw fetch() rather than bffClient (same TD31 Story 7 discovery,
// 2026-07-31, as the guest flow's equivalent call in ./public.ts): the target is this app's own
// Route Handler, not the BFF directly. Here the route reads the access_token cookie server-side
// and forwards it as Authorization: Bearer, so an authenticated customer's request is scoped to
// their own tenant automatically — routing through bffClient's same-origin gateway would work
// too, but bypassing the Route Handler's own actor-scoping logic isn't worth the inconsistency
// with the guest-flow call this proxy route also serves.
export async function createCustomerAttachmentSignedUrl(
  fileName: string,
  contentType: ImageContentType,
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
