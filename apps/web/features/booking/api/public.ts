import type {
  AttachmentSignedUrlResponse,
  AuthenticatedBookingRequest,
  BookingResponse,
  CreateBookingRequest,
  HotsiteServiceQuoteResponse,
  HotsiteServiceResourceOptionsResponse,
  ImageContentType,
  PublicServiceIntakeSchemaResponse,
} from '@ikaro/types';
import { bffClient } from '@/shared/lib/api/bff-client';

export async function createBooking(
  slug: string,
  payload: CreateBookingRequest,
): Promise<BookingResponse> {
  const res = await bffClient.post<BookingResponse>('/bookings', payload, {
    headers: { 'X-Tenant-Slug': slug },
  });
  return res.data;
}

export async function createAuthenticatedBooking(
  payload: AuthenticatedBookingRequest,
): Promise<BookingResponse> {
  const res = await bffClient.post<BookingResponse>('/bookings/authenticated', payload);
  return res.data;
}

export async function fetchPublicIntakeSchema(
  slug: string,
  serviceId: string,
): Promise<PublicServiceIntakeSchemaResponse> {
  const res = await bffClient.get<PublicServiceIntakeSchemaResponse>(
    `/public/services/${serviceId}/intake-schema`,
    { headers: { 'X-Tenant-Slug': slug } },
  );
  return res.data;
}

export async function fetchServiceResourceOptions(
  slug: string,
  serviceId: string,
): Promise<HotsiteServiceResourceOptionsResponse> {
  const res = await bffClient.get<HotsiteServiceResourceOptionsResponse>(
    `/public/services/${serviceId}/resource-options`,
    { headers: { 'X-Tenant-Slug': slug } },
  );
  return res.data;
}

// Consumed by the variable-duration step (M23-S11b); the fetcher lands with the other public
// service reads so that story is UI-only.
export async function fetchServiceQuote(
  slug: string,
  serviceId: string,
  durationMinutes: number,
): Promise<HotsiteServiceQuoteResponse> {
  const res = await bffClient.get<HotsiteServiceQuoteResponse>(
    `/public/services/${serviceId}/quote`,
    { params: { durationMinutes }, headers: { 'X-Tenant-Slug': slug } },
  );
  return res.data;
}

export interface SubmitGuestBookingInfoRequest {
  readonly response: string;
  readonly photoUrls?: readonly string[];
}

export interface SubmitGuestBookingInfoResponse {
  readonly bookingId: string;
  readonly status: string;
  readonly infoSubmittedAt: string;
}

export async function submitGuestBookingInfo(
  bookingId: string,
  token: string,
  body: SubmitGuestBookingInfoRequest,
): Promise<SubmitGuestBookingInfoResponse> {
  const res = await bffClient.patch<SubmitGuestBookingInfoResponse>(
    `/bookings/${bookingId}/submit-info/guest`,
    body,
    { params: { token } },
  );
  return res.data;
}

// These two calls intentionally stay on raw fetch() rather than bffClient (TD31 Story 7
// discovery, 2026-07-31): the target is `/api/bookings/attachments/signed-url`, this app's own
// Route Handler, not the BFF directly — that route reads the httpOnly session cookie itself and
// deliberately ignores any leftover cookie when a `guestToken` is present in the body (see its
// own comment). Routing through bffClient would send the request through the generic `/v1/[...
// path]` same-origin gateway instead, which transparently forwards whatever cookie the browser
// has — dropping that guest-token-overrides-cookie safety check and risking an upload being
// misattributed to the wrong actor/tenant.
export async function createAttachmentSignedUrl(
  slug: string,
  fileName: string,
  contentType: ImageContentType,
  bookingId?: string,
): Promise<AttachmentSignedUrlResponse> {
  const res = await fetch('/api/bookings/attachments/signed-url', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      fileName,
      contentType,
      tenantSlug: slug,
      ...(bookingId ? { bookingId } : {}),
    }),
  });

  if (!res.ok) {
    throw new Error(`Failed to create attachment signed URL for slug "${slug}"`);
  }

  return res.json() as Promise<AttachmentSignedUrlResponse>;
}

// Guest variant (UC-005 A2, M13-S40): same /api/bookings/attachments/signed-url route, but
// identifies the caller via the signed guestToken instead of tenantSlug. The BFF's
// generateAttachmentSignedUrl() already has a guestToken+bookingId branch (Scenario 3) —
// verifies the token and scopes the upload to tenants/<tenantId>/bookings/<bookingId>/<file>,
// same as every other booking photo. No backend or BFF change needed.
export async function createGuestAttachmentSignedUrl(
  guestToken: string,
  bookingId: string,
  fileName: string,
  contentType: ImageContentType,
): Promise<AttachmentSignedUrlResponse> {
  const res = await fetch('/api/bookings/attachments/signed-url', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ fileName, contentType, bookingId, guestToken }),
  });

  if (!res.ok) {
    throw new Error(`Failed to create guest attachment signed URL for booking "${bookingId}"`);
  }

  return res.json() as Promise<AttachmentSignedUrlResponse>;
}
