import type {
  AttachmentSignedUrlResponse,
  BookingResponse,
  CreateBookingRequest,
  Address,
} from '@ikaro/types';
import { bffClient } from '@/shared/lib/api/bff-client';

export class CreateBookingError extends Error {
  constructor(
    public readonly status: number,
    message: string,
  ) {
    super(message);
    this.name = 'CreateBookingError';
    Object.setPrototypeOf(this, new.target.prototype);
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
    throw new CreateBookingError(res.status, `Failed to create booking for slug "${slug}"`);
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
