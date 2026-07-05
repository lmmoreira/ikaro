import MockAdapter from 'axios-mock-adapter';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type {
  AttachmentSignedUrlResponse,
  BookingResponse,
  CreateBookingRequest,
  GuestBookingReadResponse,
} from '@ikaro/types';
import { bffClient } from '@/shared/lib/api/bff-client';
import {
  createAuthenticatedBooking,
  createAttachmentSignedUrl,
  createBooking,
  createGuestAttachmentSignedUrl,
  CreateBookingError,
  fetchGuestBookingSummary,
  GuestBookingReadError,
  submitGuestBookingInfo,
  SubmitGuestBookingInfoError,
} from './public';

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

describe('createAuthenticatedBooking', () => {
  const mock = new MockAdapter(bffClient);

  beforeEach(() => mock.reset());

  afterEach(() => mock.reset());

  it('calls POST /bookings/authenticated and returns the booking id + status', async () => {
    mock
      .onPost('/bookings/authenticated')
      .reply(201, { bookingId: 'booking-1', status: 'PENDING' });

    const result = await createAuthenticatedBooking({
      scheduledAt: '2026-06-20T13:00:00.000Z',
      serviceIds: ['svc-1'],
    });

    expect(result).toEqual({ bookingId: 'booking-1', status: 'PENDING' });
    expect(mock.history.post?.[0]?.data).toBe(
      JSON.stringify({
        scheduledAt: '2026-06-20T13:00:00.000Z',
        serviceIds: ['svc-1'],
      }),
    );
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
    fetchSpy.mockResolvedValue(
      new Response(JSON.stringify(signedUrl), {
        status: 201,
        headers: { 'content-type': 'application/json' },
      }),
    );

    const result = await createAttachmentSignedUrl('lavacar-beloauto', 'photo.jpg', 'image/jpeg');

    expect(result).toEqual(signedUrl);
    expect(fetchSpy).toHaveBeenCalledWith('/api/bookings/attachments/signed-url', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        fileName: 'photo.jpg',
        contentType: 'image/jpeg',
        tenantSlug: 'lavacar-beloauto',
      }),
    });
  });

  it('includes bookingId when provided', async () => {
    const signedUrl: AttachmentSignedUrlResponse = {
      signedUrl: 'https://storage.example.com/upload?sig=abc',
      filePath: 'tenants/tenant-1/bookings/b-1/photo.jpg',
      expiresAt: '2026-06-15T12:00:00.000Z',
    };
    fetchSpy.mockResolvedValue(
      new Response(JSON.stringify(signedUrl), {
        status: 201,
        headers: { 'content-type': 'application/json' },
      }),
    );

    const result = await createAttachmentSignedUrl(
      'lavacar-beloauto',
      'photo.jpg',
      'image/jpeg',
      'b-1',
    );

    expect(result).toEqual(signedUrl);
    expect(fetchSpy).toHaveBeenCalledWith('/api/bookings/attachments/signed-url', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        fileName: 'photo.jpg',
        contentType: 'image/jpeg',
        tenantSlug: 'lavacar-beloauto',
        bookingId: 'b-1',
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

describe('createGuestAttachmentSignedUrl', () => {
  let fetchSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    fetchSpy = vi.spyOn(globalThis, 'fetch');
  });

  afterEach(() => {
    fetchSpy.mockRestore();
  });

  it('sends guestToken and bookingId (not tenantSlug) to the signed-url route', async () => {
    const signedUrl: AttachmentSignedUrlResponse = {
      signedUrl: 'https://storage.example.com/upload?sig=abc',
      filePath: 'tenants/tenant-1/bookings/booking-1/photo.jpg',
      expiresAt: '2026-06-15T12:00:00.000Z',
    };
    fetchSpy.mockResolvedValue(
      new Response(JSON.stringify(signedUrl), {
        status: 201,
        headers: { 'content-type': 'application/json' },
      }),
    );

    const result = await createGuestAttachmentSignedUrl(
      'signed.jwt.token',
      'booking-1',
      'photo.jpg',
      'image/jpeg',
    );

    expect(result).toEqual(signedUrl);
    expect(fetchSpy).toHaveBeenCalledWith('/api/bookings/attachments/signed-url', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        fileName: 'photo.jpg',
        contentType: 'image/jpeg',
        bookingId: 'booking-1',
        guestToken: 'signed.jwt.token',
      }),
    });
  });

  it('throws when the BFF returns an error', async () => {
    fetchSpy.mockResolvedValue(new Response(null, { status: 401 }));

    await expect(
      createGuestAttachmentSignedUrl('signed.jwt.token', 'booking-1', 'photo.jpg', 'image/jpeg'),
    ).rejects.toThrow(/Failed to create guest attachment signed URL/);
  });
});

describe('fetchGuestBookingSummary', () => {
  let fetchSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    process.env.NEXT_PUBLIC_BFF_URL = BFF_URL;
    fetchSpy = vi.spyOn(globalThis, 'fetch');
  });

  afterEach(() => {
    fetchSpy.mockRestore();
  });

  it('returns the booking summary on a successful BFF response', async () => {
    const summary: GuestBookingReadResponse = {
      bookingId: 'booking-1',
      status: 'INFO_REQUESTED',
      serviceSummary: 'Lavagem Simples',
      scheduledAt: '2026-06-18T13:00:00.000Z',
      infoRequestMessage: 'Envie fotos do veículo.',
      contactName: 'João da Silva',
    };
    fetchSpy.mockResolvedValue(new Response(JSON.stringify(summary), { status: 200 }));

    const result = await fetchGuestBookingSummary('booking-1', 'signed.jwt.token');

    expect(result).toEqual(summary);
    expect(fetchSpy).toHaveBeenCalledWith(
      `${BFF_URL}/bookings/booking-1/guest?token=signed.jwt.token`,
    );
  });

  it('throws a GuestBookingReadError with status 409 when already processed', async () => {
    fetchSpy.mockResolvedValue(new Response(null, { status: 409 }));

    await expect(fetchGuestBookingSummary('booking-1', 'token')).rejects.toMatchObject({
      status: 409,
    });
    await expect(fetchGuestBookingSummary('booking-1', 'token')).rejects.toBeInstanceOf(
      GuestBookingReadError,
    );
  });

  it('throws a GuestBookingReadError when the endpoint does not exist (M13-S39 not shipped)', async () => {
    fetchSpy.mockResolvedValue(new Response(null, { status: 404 }));

    await expect(fetchGuestBookingSummary('booking-1', 'token')).rejects.toMatchObject({
      status: 404,
    });
  });
});

describe('submitGuestBookingInfo', () => {
  let fetchSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    process.env.NEXT_PUBLIC_BFF_URL = BFF_URL;
    fetchSpy = vi.spyOn(globalThis, 'fetch');
  });

  afterEach(() => {
    fetchSpy.mockRestore();
  });

  it('submits the response and returns the updated booking status', async () => {
    const response = {
      bookingId: 'booking-1',
      status: 'PENDING',
      infoSubmittedAt: '2026-06-18T14:00:00.000Z',
    };
    fetchSpy.mockResolvedValue(new Response(JSON.stringify(response), { status: 200 }));

    const result = await submitGuestBookingInfo('booking-1', 'signed.jwt.token', {
      response: 'Segue a foto do veículo conforme solicitado.',
    });

    expect(result).toEqual(response);
    expect(fetchSpy).toHaveBeenCalledWith(
      `${BFF_URL}/bookings/booking-1/submit-info/guest?token=signed.jwt.token`,
      {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ response: 'Segue a foto do veículo conforme solicitado.' }),
      },
    );
  });

  it('throws a SubmitGuestBookingInfoError with status 401 when the token expired mid-flow', async () => {
    fetchSpy.mockResolvedValue(new Response(null, { status: 401 }));

    await expect(
      submitGuestBookingInfo('booking-1', 'token', { response: 'texto' }),
    ).rejects.toMatchObject({ status: 401 });
    await expect(
      submitGuestBookingInfo('booking-1', 'token', { response: 'texto' }),
    ).rejects.toBeInstanceOf(SubmitGuestBookingInfoError);
  });

  it('throws a SubmitGuestBookingInfoError on a network/server error', async () => {
    fetchSpy.mockResolvedValue(new Response(null, { status: 500 }));

    await expect(
      submitGuestBookingInfo('booking-1', 'token', { response: 'texto' }),
    ).rejects.toMatchObject({ status: 500 });
  });
});
