import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type {
  AttachmentSignedUrlResponse,
  BookingResponse,
  CreateBookingRequest,
} from '@ikaro/types';
import { createAttachmentSignedUrl, createBooking, CreateBookingError } from './bookings';

const BFF_URL = 'http://bff-test:3002';

function makePayload(): CreateBookingRequest {
  return {
    contactEmail: 'maria@example.com',
    contactName: 'Maria Silva',
    contactPhone: '11999998888',
    scheduledAt: '2026-06-20T13:00:00.000Z',
    serviceIds: ['svc-1'],
  };
}

describe('createBooking', () => {
  let fetchSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    process.env.NEXT_PUBLIC_BFF_URL = BFF_URL;
    fetchSpy = vi.spyOn(globalThis, 'fetch');
  });

  afterEach(() => {
    fetchSpy.mockRestore();
  });

  it('returns the booking on a successful BFF response', async () => {
    const booking: BookingResponse = {
      bookingId: 'booking-1',
      status: 'PENDING',
      scheduledAt: '2026-06-20T13:00:00.000Z',
      totalPrice: { amount: 150, currency: 'BRL' },
      totalDurationMins: 60,
      pickupAddress: null,
      beforeServicePhotoUrls: [],
      lines: [],
    };
    fetchSpy.mockResolvedValue(new Response(JSON.stringify(booking), { status: 201 }));

    const result = await createBooking('lavacar-beloauto', makePayload());

    expect(result).toEqual(booking);
    expect(fetchSpy).toHaveBeenCalledWith(`${BFF_URL}/bookings`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Tenant-Slug': 'lavacar-beloauto' },
      body: JSON.stringify(makePayload()),
    });
  });

  it('throws a CreateBookingError with status 409 when the slot is taken', async () => {
    fetchSpy.mockResolvedValue(new Response(null, { status: 409 }));

    await expect(createBooking('lavacar-beloauto', makePayload())).rejects.toThrow(
      CreateBookingError,
    );
    await expect(createBooking('lavacar-beloauto', makePayload())).rejects.toMatchObject({
      status: 409,
    });
  });

  it('throws a CreateBookingError when the BFF returns a generic error', async () => {
    fetchSpy.mockResolvedValue(new Response(null, { status: 500 }));

    await expect(createBooking('lavacar-beloauto', makePayload())).rejects.toMatchObject({
      status: 500,
    });
  });
});

describe('createAttachmentSignedUrl', () => {
  let fetchSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    process.env.NEXT_PUBLIC_BFF_URL = BFF_URL;
    fetchSpy = vi.spyOn(globalThis, 'fetch');
  });

  afterEach(() => {
    fetchSpy.mockRestore();
  });

  it('returns the signed URL on a successful BFF response', async () => {
    const signedUrl: AttachmentSignedUrlResponse = {
      signedUrl: 'https://storage.example.com/upload?sig=abc',
      filePath: 'tenants/tenant-1/uploads/photo.jpg',
      expiresAt: '2026-06-15T12:00:00.000Z',
    };
    fetchSpy.mockResolvedValue(new Response(JSON.stringify(signedUrl), { status: 201 }));

    const result = await createAttachmentSignedUrl('lavacar-beloauto', 'photo.jpg', 'image/jpeg');

    expect(result).toEqual(signedUrl);
    expect(fetchSpy).toHaveBeenCalledWith(`${BFF_URL}/bookings/attachments/signed-url`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        fileName: 'photo.jpg',
        contentType: 'image/jpeg',
        tenantSlug: 'lavacar-beloauto',
      }),
    });
  });

  it('throws when the BFF returns an error', async () => {
    fetchSpy.mockResolvedValue(new Response(null, { status: 400 }));

    await expect(
      createAttachmentSignedUrl('lavacar-beloauto', 'photo.jpg', 'image/jpeg'),
    ).rejects.toThrow(/Failed to create attachment signed URL/);
  });
});
