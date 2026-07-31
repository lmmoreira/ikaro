import MockAdapter from 'axios-mock-adapter';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type {
  AttachmentSignedUrlResponse,
  BookingResponse,
  CreateBookingRequest,
  GuestBookingReadResponse,
} from '@ikaro/types';
import { bffClient } from '@/shared/lib/api/bff-client';
import { ApiError, AuthError } from '@/shared/lib/api/errors';
import {
  createAuthenticatedBooking,
  createAttachmentSignedUrl,
  createBooking,
  createGuestAttachmentSignedUrl,
  submitGuestBookingInfo,
} from './public';
import { fetchGuestBookingSummary, GuestBookingReadError } from './public.server';

const BFF_URL = 'http://bff-test:3002';

// One shared MockAdapter per file: its constructor rebinds bffClient's adapter globally, so a
// second `new MockAdapter(bffClient)` elsewhere in this file would silently orphan the first
// instance's registered handlers (they'd stop matching any request, causing a real 404).
const mock = new MockAdapter(bffClient);

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
  beforeEach(() => mock.reset());

  afterEach(() => mock.reset());

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
    mock.onPost('/bookings').reply(201, booking);

    const result = await createBooking('lavacar-beloauto', makePayload());

    expect(result).toEqual(booking);
    expect(mock.history.post?.[0]?.data).toBe(JSON.stringify(makePayload()));
    expect(mock.history.post?.[0]?.headers).toMatchObject({
      'X-Tenant-Slug': 'lavacar-beloauto',
    });
  });

  it('throws an ApiError with status 409 when the slot is taken', async () => {
    mock.onPost('/bookings').reply(409);

    await expect(createBooking('lavacar-beloauto', makePayload())).rejects.toBeInstanceOf(ApiError);
    await expect(createBooking('lavacar-beloauto', makePayload())).rejects.toMatchObject({
      status: 409,
    });
  });

  it('throws an ApiError when the BFF returns a generic error', async () => {
    mock.onPost('/bookings').reply(500);

    await expect(createBooking('lavacar-beloauto', makePayload())).rejects.toMatchObject({
      status: 500,
    });
  });

  it('parses code/field/violations from the response body instead of discarding it', async () => {
    mock.onPost('/bookings').reply(400, {
      code: 'BOOKING_PICKUP_ADDRESS_REQUIRED',
      field: 'pickupAddress',
      violations: [{ field: 'pickupAddress', code: 'ADDRESS_FIELD_REQUIRED' }],
      detail: 'A pickup address is required.',
    });

    await expect(createBooking('lavacar-beloauto', makePayload())).rejects.toMatchObject({
      status: 400,
      data: {
        code: 'BOOKING_PICKUP_ADDRESS_REQUIRED',
        field: 'pickupAddress',
        violations: [{ field: 'pickupAddress', code: 'ADDRESS_FIELD_REQUIRED' }],
      },
    });
  });
});

describe('createAuthenticatedBooking', () => {
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

    const result = await fetchGuestBookingSummary('booking/1', 'signed.jwt.token');

    expect(result).toEqual(summary);
    expect(fetchSpy).toHaveBeenCalledWith(
      `${BFF_URL}/bookings/booking%2F1/guest?token=signed.jwt.token`,
      expect.objectContaining({
        cache: 'no-store',
        signal: expect.any(AbortSignal),
      }),
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

  it('parses code from the response body instead of discarding it', async () => {
    fetchSpy.mockResolvedValue(
      new Response(JSON.stringify({ code: 'BFF_GUEST_TOKEN_BOOKING_MISMATCH' }), { status: 409 }),
    );

    await expect(fetchGuestBookingSummary('booking-1', 'token')).rejects.toMatchObject({
      status: 409,
      code: 'BFF_GUEST_TOKEN_BOOKING_MISMATCH',
    });
  });
});

describe('submitGuestBookingInfo', () => {
  beforeEach(() => mock.reset());

  afterEach(() => mock.reset());

  it('submits the response and returns the updated booking status', async () => {
    const response = {
      bookingId: 'booking-1',
      status: 'PENDING',
      infoSubmittedAt: '2026-06-18T14:00:00.000Z',
    };
    mock.onPatch('/bookings/booking-1/submit-info/guest').reply(200, response);

    const result = await submitGuestBookingInfo('booking-1', 'signed.jwt.token', {
      response: 'Segue a foto do veículo conforme solicitado.',
    });

    expect(result).toEqual(response);
    expect(mock.history.patch?.[0]?.params).toEqual({ token: 'signed.jwt.token' });
    expect(mock.history.patch?.[0]?.data).toBe(
      JSON.stringify({ response: 'Segue a foto do veículo conforme solicitado.' }),
    );
  });

  it('throws an AuthError carrying the GUEST_TOKEN_INVALID code when the token expired mid-flow', async () => {
    mock
      .onPatch('/bookings/booking-1/submit-info/guest')
      .reply(401, { code: 'BFF_GUEST_TOKEN_INVALID', detail: 'Invalid or expired guest token' });

    await expect(
      submitGuestBookingInfo('booking-1', 'token', { response: 'texto' }),
    ).rejects.toBeInstanceOf(AuthError);
    await expect(
      submitGuestBookingInfo('booking-1', 'token', { response: 'texto' }),
    ).rejects.toMatchObject({ data: { code: 'BFF_GUEST_TOKEN_INVALID' } });
  });

  it('throws an ApiError on a network/server error', async () => {
    mock.onPatch('/bookings/booking-1/submit-info/guest').reply(500);

    await expect(
      submitGuestBookingInfo('booking-1', 'token', { response: 'texto' }),
    ).rejects.toMatchObject({ status: 500 });
  });

  it('parses code from the response body instead of discarding it', async () => {
    mock.onPatch('/bookings/booking-1/submit-info/guest').reply(400, {
      code: 'BOOKING_INFO_MESSAGE_TOO_SHORT',
      field: 'response',
      detail: 'The message is too short.',
    });

    await expect(
      submitGuestBookingInfo('booking-1', 'token', { response: 'oi' }),
    ).rejects.toMatchObject({
      status: 400,
      data: { code: 'BOOKING_INFO_MESSAGE_TOO_SHORT', field: 'response' },
    });
  });
});
