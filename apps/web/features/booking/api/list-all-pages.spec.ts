import { describe, expect, it, vi } from 'vitest';
import type { StaffBookingListResponse } from '@ikaro/types';
import { listAllPages } from './list-all-pages';

type BookingCard = StaffBookingListResponse['items'][number];

function makeItem(bookingId: string): BookingCard {
  return {
    bookingId,
    status: 'APPROVED',
    scheduledAt: '2026-07-01T09:00:00.000Z',
    contactName: `Customer ${bookingId}`,
    serviceNames: ['Wash'],
    totalPrice: { amount: 100, currency: 'BRL' },
    totalDurationMins: 30,
    isCustomer: false,
    assignedResources: [],
  };
}

function page(items: BookingCard[], total: number, pageNumber: number, limit: number) {
  return { items, total, page: pageNumber, limit };
}

describe('listAllPages', () => {
  it('issues exactly one request when total fits in a single page', async () => {
    const items = [makeItem('b-1'), makeItem('b-2')];
    const fetchPage = vi.fn().mockResolvedValue(page(items, 2, 1, 100));

    const result = await listAllPages(fetchPage);

    expect(fetchPage).toHaveBeenCalledTimes(1);
    expect(fetchPage).toHaveBeenCalledWith(1);
    expect(result.items).toEqual(items);
    expect(result.total).toBe(2);
  });

  it('issues three requests and returns all items in order for a multi-page range', async () => {
    const page1Items = Array.from({ length: 100 }, (_, i) => makeItem(`b-${i + 1}`));
    const page2Items = Array.from({ length: 100 }, (_, i) => makeItem(`b-${i + 101}`));
    const page3Items = Array.from({ length: 30 }, (_, i) => makeItem(`b-${i + 201}`));
    const fetchPage = vi
      .fn()
      .mockResolvedValueOnce(page(page1Items, 230, 1, 100))
      .mockResolvedValueOnce(page(page2Items, 230, 2, 100))
      .mockResolvedValueOnce(page(page3Items, 230, 3, 100));

    const result = await listAllPages(fetchPage);

    expect(fetchPage).toHaveBeenCalledTimes(3);
    expect(fetchPage.mock.calls).toEqual([[1], [2], [3]]);
    expect(result.items).toHaveLength(230);
    expect(result.items.map((item) => item.bookingId)).toEqual([
      ...page1Items.map((item) => item.bookingId),
      ...page2Items.map((item) => item.bookingId),
      ...page3Items.map((item) => item.bookingId),
    ]);
  });

  it('de-duplicates a booking repeated across two pages', async () => {
    const shared = makeItem('b-shared');
    const page1Items = [makeItem('b-1'), shared];
    const page2Items = [shared, makeItem('b-2')];
    const fetchPage = vi
      .fn()
      .mockResolvedValueOnce(page(page1Items, 3, 1, 2))
      .mockResolvedValueOnce(page(page2Items, 3, 2, 2));

    const result = await listAllPages(fetchPage);

    expect(result.items.filter((item) => item.bookingId === 'b-shared')).toHaveLength(1);
    expect(result.items.map((item) => item.bookingId)).toEqual(['b-1', 'b-shared', 'b-2']);
  });

  it('stops on an empty page even when total says more remain', async () => {
    const page1Items = Array.from({ length: 20 }, (_, i) => makeItem(`b-${i + 1}`));
    const fetchPage = vi
      .fn()
      .mockResolvedValueOnce(page(page1Items, 50, 1, 20))
      .mockResolvedValueOnce(page([], 50, 2, 20));

    const result = await listAllPages(fetchPage);

    expect(fetchPage).toHaveBeenCalledTimes(2);
    expect(result.items).toHaveLength(20);
  });
});
