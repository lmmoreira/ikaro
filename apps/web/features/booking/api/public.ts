import type {
  AttachmentSignedUrlResponse,
  BookingResponse,
  CreateBookingRequest,
  Address,
  ValidationViolation,
} from '@ikaro/types';
import { bffClient } from '@/shared/lib/api/bff-client';
import { FetchError, parseErrorBody } from '@/shared/lib/api/errors';

export class CreateBookingError extends FetchError {
  constructor(
    status: number,
    code?: string,
    field?: string,
    public readonly violations?: readonly ValidationViolation[],
    detail?: string,
  ) {
    super(status, code, field, detail ?? `Failed to create booking (${status})`);
    this.name = 'CreateBookingError';
  }
}

export async function createBooking(
  slug: string,
  payload: CreateBookingRequest,
): Promise<BookingResponse> {
  const res = await fetch(`${process.env.NEXT_PUBLIC_BFF_URL}/bookings`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-Tenant-Slug': slug },
    body: JSON.stringify(payload),
  });

  if (!res.ok) {
    const body = await parseErrorBody(res);
    throw new CreateBookingError(res.status, body.code, body.field, body.violations, body.detail);
  }

  return res.json() as Promise<BookingResponse>;
}

export interface AuthenticatedBookingRequest {
  readonly scheduledAt: string;
  readonly serviceIds: readonly string[];
  readonly pickupAddress?: Address;
  readonly beforeServicePhotoUrls?: readonly string[];
}

export async function createAuthenticatedBooking(
  payload: AuthenticatedBookingRequest,
): Promise<{ bookingId: string; status: string }> {
  const res = await bffClient.post<{ bookingId: string; status: string }>(
    '/bookings/authenticated',
    payload,
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

export class SubmitGuestBookingInfoError extends FetchError {
  constructor(
    status: number,
    code?: string,
    field?: string,
    public readonly violations?: readonly ValidationViolation[],
    detail?: string,
  ) {
    super(status, code, field, detail ?? `Failed to submit guest booking info (${status})`);
    this.name = 'SubmitGuestBookingInfoError';
  }
}

export async function submitGuestBookingInfo(
  bookingId: string,
  token: string,
  body: SubmitGuestBookingInfoRequest,
): Promise<SubmitGuestBookingInfoResponse> {
  const res = await fetch(
    `${process.env.NEXT_PUBLIC_BFF_URL}/bookings/${bookingId}/submit-info/guest?token=${encodeURIComponent(token)}`,
    {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    },
  );

  if (!res.ok) {
    const errorBody = await parseErrorBody(res);
    throw new SubmitGuestBookingInfoError(
      res.status,
      errorBody.code,
      errorBody.field,
      errorBody.violations,
      errorBody.detail,
    );
  }

  return res.json() as Promise<SubmitGuestBookingInfoResponse>;
}

export async function createAttachmentSignedUrl(
  slug: string,
  fileName: string,
  contentType: 'image/jpeg' | 'image/png',
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
  contentType: 'image/jpeg' | 'image/png',
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
