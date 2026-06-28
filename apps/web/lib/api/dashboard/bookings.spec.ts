import MockAdapter from 'axios-mock-adapter';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { bffClient } from '../bff-client';
import {
  approveBooking,
  cancelBooking,
  completeBooking,
  createAuthenticatedBooking,
  fetchStaffBookingDetail,
  getBooking,
  listBookings,
  rejectBooking,
  requestMoreInfo,
  rescheduleBooking,
  submitBookingInfo,
} from './bookings';
import { fetchBookingAvailability } from './fetch-booking-availability';

const mock = new MockAdapter(bffClient);

beforeEach(() => mock.reset());
afterEach(() => {
  mock.reset();
  vi.restoreAllMocks();
});

const booking = { bookingId: 'b-1', status: 'PENDING' };

describe('listBookings', () => {
  it('calls GET /bookings and returns the list', async () => {
    mock.onGet('/bookings').reply(200, { items: [booking], total: 1, page: 1, limit: 20 });
    const res = await listBookings();
    expect(res.items).toHaveLength(1);
  });

  it('passes filters as query params', async () => {
    mock.onGet('/bookings').reply(200, { items: [], total: 0, page: 1, limit: 10 });
    await listBookings({ status: 'PENDING', limit: 10 });
    expect(mock.history['get']?.[0]?.params).toMatchObject({ status: 'PENDING', limit: 10 });
  });
});

describe('getBooking', () => {
  it('calls GET /bookings/:id', async () => {
    mock.onGet('/bookings/b-1').reply(200, booking);
    const res = await getBooking('b-1');
    expect(res).toMatchObject(booking);
  });
});

describe('approveBooking', () => {
  it('calls PATCH /bookings/:id/approve', async () => {
    mock
      .onPatch('/bookings/b-1/approve')
      .reply(200, { bookingId: 'b-1', status: 'APPROVED', approvedAt: '' });
    const res = await approveBooking('b-1');
    expect(res.status).toBe('APPROVED');
  });

  it('forwards a retry scheduledAt body when provided', async () => {
    mock
      .onPatch('/bookings/b-1/approve')
      .reply(200, { bookingId: 'b-1', status: 'APPROVED', approvedAt: '' });
    await approveBooking('b-1', { scheduledAt: '2026-07-01T10:00:00.000Z' });
    expect(mock.history.patch?.[0]?.data).toBe(
      JSON.stringify({ scheduledAt: '2026-07-01T10:00:00.000Z' }),
    );
  });
});

describe('fetchStaffBookingDetail', () => {
  it('calls GET /bookings/:id using the provided token', async () => {
    const fetchSpy = vi
      .spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce(new Response(JSON.stringify(booking), { status: 200 }));

    const res = await fetchStaffBookingDetail('access-token', 'b-1');
    expect(res).toMatchObject(booking);
    expect(fetchSpy).toHaveBeenCalledWith(
      expect.stringContaining('/bookings/b-1'),
      expect.objectContaining({
        headers: { Cookie: 'access_token=access-token' },
      }),
    );
  });

  it('throws BookingDetailFetchError on 404', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(new Response(null, { status: 404 }));

    await expect(fetchStaffBookingDetail('access-token', 'b-1')).rejects.toMatchObject({
      name: 'BookingDetailFetchError',
      status: 404,
    });
  });
});

describe('fetchBookingAvailability', () => {
  it('calls GET /schedule/availability with the tenant slug header', async () => {
    mock.onGet('/schedule/availability').reply(200, {
      date: '2026-06-16',
      slots: [{ startsAt: '2026-06-16T09:00:00.000Z', endsAt: '2026-06-16T09:30:00.000Z' }],
      available: true,
    });

    const result = await fetchBookingAvailability('lavacar-bh', '2026-06-16', ['svc-1']);

    expect(result.available).toBe(true);
    expect(mock.history.get?.[0]?.headers).toMatchObject({ 'X-Tenant-Slug': 'lavacar-bh' });
  });
});

describe('rejectBooking', () => {
  it('calls PATCH /bookings/:id/reject with reason', async () => {
    mock
      .onPatch('/bookings/b-1/reject')
      .reply(200, { bookingId: 'b-1', status: 'REJECTED', rejectedAt: '' });
    const res = await rejectBooking('b-1', { reason: 'No availability' });
    expect(res.status).toBe('REJECTED');
  });
});

describe('cancelBooking', () => {
  it('calls PATCH /bookings/:id/cancel', async () => {
    mock.onPatch('/bookings/b-1/cancel').reply(200, { bookingId: 'b-1', status: 'CANCELLED' });
    const res = await cancelBooking('b-1');
    expect(res.status).toBe('CANCELLED');
  });
});

describe('rescheduleBooking', () => {
  it('calls PATCH /bookings/:id/reschedule', async () => {
    mock
      .onPatch('/bookings/b-1/reschedule')
      .reply(200, { bookingId: 'b-1', status: 'APPROVED', scheduledAt: '2026-07-01T09:00:00Z' });
    const res = await rescheduleBooking('b-1', { scheduledAt: '2026-07-01T09:00:00Z' });
    expect(res.scheduledAt).toBe('2026-07-01T09:00:00Z');
  });
});

describe('completeBooking', () => {
  it('calls PATCH /bookings/:id/complete', async () => {
    mock.onPatch('/bookings/b-1/complete').reply(200, {
      bookingId: 'b-1',
      status: 'COMPLETED',
      completedAt: '',
      totalActualPrice: { amount: 100, currency: 'BRL' },
    });
    const res = await completeBooking('b-1', {
      lines: [{ lineId: 'l-1', actualPriceCharged: 100 }],
    });
    expect(res.status).toBe('COMPLETED');
  });
});

describe('requestMoreInfo', () => {
  it('calls PATCH /bookings/:id/request-info', async () => {
    mock
      .onPatch('/bookings/b-1/request-info')
      .reply(200, { bookingId: 'b-1', status: 'INFO_REQUESTED', infoRequestedAt: '' });
    const res = await requestMoreInfo('b-1', { message: 'Please send vehicle photo' });
    expect(res.status).toBe('INFO_REQUESTED');
  });
});

describe('submitBookingInfo', () => {
  it('calls PATCH /bookings/:id/submit-info', async () => {
    mock
      .onPatch('/bookings/b-1/submit-info')
      .reply(200, { bookingId: 'b-1', status: 'PENDING', infoSubmittedAt: '' });
    const res = await submitBookingInfo('b-1', { response: 'Here is the photo' });
    expect(res.status).toBe('PENDING');
  });
});

describe('createAuthenticatedBooking', () => {
  it('calls POST /bookings/authenticated', async () => {
    mock.onPost('/bookings/authenticated').reply(201, { bookingId: 'b-new', status: 'PENDING' });
    const res = await createAuthenticatedBooking({
      scheduledAt: '2026-07-01T09:00:00Z',
      serviceIds: ['svc-1'],
    });
    expect(res.bookingId).toBe('b-new');
  });
});
