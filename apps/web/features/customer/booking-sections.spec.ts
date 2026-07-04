import { describe, expect, it } from 'vitest';
import type { CustomerBookingListItem } from '@ikaro/types';
import {
  canCancelBooking,
  countActiveBookings,
  selectHomePreview,
  splitBookingSections,
} from './booking-sections';

const NOW = new Date('2026-06-18T12:00:00.000Z');

function makeItem(overrides: Partial<CustomerBookingListItem> = {}): CustomerBookingListItem {
  return {
    bookingId: 'b1',
    status: 'PENDING',
    scheduledAt: '2026-06-20T10:00:00.000Z',
    lines: [
      {
        lineId: 'l1',
        serviceName: 'Lavagem Completa',
        durationMinsAtBooking: 60,
        priceAtBooking: { amount: 180, currency: 'BRL' },
        actualPriceCharged: null,
      },
    ],
    totalPrice: { amount: 180, currency: 'BRL' },
    cancellableUntil: null,
    ...overrides,
  };
}

describe('splitBookingSections', () => {
  it('puts future APPROVED bookings in upcoming', () => {
    const items = [makeItem({ bookingId: 'a', status: 'APPROVED' })];
    const sections = splitBookingSections(items, NOW);
    expect(sections.upcoming.map((b) => b.bookingId)).toEqual(['a']);
    expect(sections.pending).toHaveLength(0);
    expect(sections.history).toHaveLength(0);
  });

  it('keeps an APPROVED booking scheduled earlier today in upcoming', () => {
    const items = [makeItem({ status: 'APPROVED', scheduledAt: '2026-06-18T08:00:00.000Z' })];
    expect(splitBookingSections(items, NOW).upcoming).toHaveLength(1);
  });

  it('excludes past APPROVED bookings from upcoming', () => {
    const items = [makeItem({ status: 'APPROVED', scheduledAt: '2026-06-10T10:00:00.000Z' })];
    const sections = splitBookingSections(items, NOW);
    expect(sections.upcoming).toHaveLength(0);
    expect(sections.history).toHaveLength(0);
  });

  it('puts PENDING and INFO_REQUESTED in pending regardless of date', () => {
    const items = [
      makeItem({ bookingId: 'p', status: 'PENDING', scheduledAt: '2026-06-01T10:00:00.000Z' }),
      makeItem({ bookingId: 'i', status: 'INFO_REQUESTED' }),
    ];
    const sections = splitBookingSections(items, NOW);
    expect(sections.pending.map((b) => b.bookingId)).toEqual(['p', 'i']);
  });

  it('puts COMPLETED, CANCELLED and REJECTED in history, most recent first', () => {
    const items = [
      makeItem({ bookingId: 'old', status: 'CANCELLED', scheduledAt: '2026-05-15T11:00:00.000Z' }),
      makeItem({ bookingId: 'new', status: 'COMPLETED', scheduledAt: '2026-06-05T09:00:00.000Z' }),
      makeItem({ bookingId: 'rej', status: 'REJECTED', scheduledAt: '2026-06-01T09:00:00.000Z' }),
    ];
    const sections = splitBookingSections(items, NOW);
    expect(sections.history.map((b) => b.bookingId)).toEqual(['new', 'rej', 'old']);
  });

  it('sorts upcoming by soonest first', () => {
    const items = [
      makeItem({ bookingId: 'later', status: 'APPROVED', scheduledAt: '2026-06-25T10:00:00.000Z' }),
      makeItem({ bookingId: 'soon', status: 'APPROVED', scheduledAt: '2026-06-20T10:00:00.000Z' }),
    ];
    expect(splitBookingSections(items, NOW).upcoming.map((b) => b.bookingId)).toEqual([
      'soon',
      'later',
    ]);
  });
});

describe('selectHomePreview', () => {
  it('merges upcoming and pending, soonest first, capped at three', () => {
    const items = [
      makeItem({ bookingId: 'a', status: 'APPROVED', scheduledAt: '2026-06-22T10:00:00.000Z' }),
      makeItem({ bookingId: 'p', status: 'PENDING', scheduledAt: '2026-06-20T10:00:00.000Z' }),
      makeItem({
        bookingId: 'i',
        status: 'INFO_REQUESTED',
        scheduledAt: '2026-06-21T10:00:00.000Z',
      }),
      makeItem({ bookingId: 'z', status: 'APPROVED', scheduledAt: '2026-06-30T10:00:00.000Z' }),
      makeItem({ bookingId: 'done', status: 'COMPLETED', scheduledAt: '2026-06-05T10:00:00.000Z' }),
    ];
    expect(selectHomePreview(items, NOW).map((b) => b.bookingId)).toEqual(['p', 'i', 'a']);
  });
});

describe('countActiveBookings', () => {
  it('counts APPROVED and COMPLETED bookings only', () => {
    const items = [
      makeItem({ status: 'APPROVED' }),
      makeItem({ status: 'COMPLETED' }),
      makeItem({ status: 'PENDING' }),
      makeItem({ status: 'CANCELLED' }),
      makeItem({ status: 'REJECTED' }),
      makeItem({ status: 'INFO_REQUESTED' }),
    ];
    expect(countActiveBookings(items)).toBe(2);
  });
});

describe('canCancelBooking', () => {
  it('allows cancelling PENDING and INFO_REQUESTED at any time', () => {
    expect(canCancelBooking(makeItem({ status: 'PENDING' }), NOW)).toBe(true);
    expect(canCancelBooking(makeItem({ status: 'INFO_REQUESTED' }), NOW)).toBe(true);
  });

  it('allows cancelling APPROVED while now is before cancellableUntil', () => {
    const item = makeItem({ status: 'APPROVED', cancellableUntil: '2026-06-19T10:00:00.000Z' });
    expect(canCancelBooking(item, NOW)).toBe(true);
  });

  it('blocks cancelling APPROVED after cancellableUntil has passed', () => {
    const item = makeItem({ status: 'APPROVED', cancellableUntil: '2026-06-18T10:00:00.000Z' });
    expect(canCancelBooking(item, NOW)).toBe(false);
  });

  it('blocks cancelling APPROVED when cancellableUntil is missing', () => {
    expect(canCancelBooking(makeItem({ status: 'APPROVED' }), NOW)).toBe(false);
  });

  it('blocks cancelling terminal statuses', () => {
    expect(canCancelBooking(makeItem({ status: 'COMPLETED' }), NOW)).toBe(false);
    expect(canCancelBooking(makeItem({ status: 'CANCELLED' }), NOW)).toBe(false);
    expect(canCancelBooking(makeItem({ status: 'REJECTED' }), NOW)).toBe(false);
  });
});
