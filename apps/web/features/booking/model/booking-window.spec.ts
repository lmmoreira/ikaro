import { describe, expect, it } from 'vitest';
import type { HotsiteServiceResponse } from '@ikaro/types';
import {
  addIsoDays,
  earliestBookableDate,
  isSlotBookable,
  lastBookableDate,
  resolveBasketBookingWindow,
  tenantToday,
} from './booking-window';

const TZ = 'America/Sao_Paulo';

function service(minHours: number, maxDays: number): HotsiteServiceResponse {
  return {
    bookingPolicy: {
      effectiveMinBookingAdvanceHours: minHours,
      effectiveMaxBookingAdvanceDays: maxDays,
    },
  } as HotsiteServiceResponse;
}

describe('resolveBasketBookingWindow', () => {
  it('uses the tenant maximum and no minimum for an empty basket', () => {
    expect(resolveBasketBookingWindow([], 90)).toEqual({ minAdvanceHours: 0, maxAdvanceDays: 90 });
  });

  it("uses a single service's effective window", () => {
    expect(resolveBasketBookingWindow([service(24, 30)], 90)).toEqual({
      minAdvanceHours: 24,
      maxAdvanceDays: 30,
    });
  });

  it('takes the smallest maximum and the largest minimum across a basket', () => {
    expect(
      resolveBasketBookingWindow([service(2, 60), service(24, 14), service(6, 30)], 90),
    ).toEqual({ minAdvanceHours: 24, maxAdvanceDays: 14 });
  });
});

describe('addIsoDays', () => {
  it('adds calendar days across a month boundary', () => {
    expect(addIsoDays('2026-06-29', 3)).toBe('2026-07-02');
  });
});

describe('tenant-local dates', () => {
  // 23:00 on 2026-06-09 in São Paulo is already 2026-06-10 in UTC.
  const lateEvening = new Date('2026-06-10T02:00:00.000Z');

  it("tenantToday is the tenant's calendar day, not the UTC day", () => {
    expect(tenantToday(lateEvening, TZ)).toBe('2026-06-09');
  });

  it('lastBookableDate is today + max − 1 in the tenant timezone', () => {
    expect(lastBookableDate(lateEvening, 3, TZ)).toBe('2026-06-11');
    expect(lastBookableDate(lateEvening, 1, TZ)).toBe('2026-06-09');
  });

  it('earliestBookableDate moves to the next tenant day once the minimum notice crosses midnight', () => {
    expect(earliestBookableDate(lateEvening, 0, TZ)).toBe('2026-06-09');
    expect(earliestBookableDate(lateEvening, 2, TZ)).toBe('2026-06-10');
    expect(earliestBookableDate(lateEvening, 24, TZ)).toBe('2026-06-10');
    expect(earliestBookableDate(lateEvening, 25, TZ)).toBe('2026-06-11');
  });
});

describe('isSlotBookable', () => {
  const now = new Date('2026-06-10T15:00:00.000Z');

  it('rejects a slot that has already started', () => {
    expect(isSlotBookable('2026-06-10T14:00:00.000Z', now, 0)).toBe(false);
  });

  it('accepts a slot exactly at the minimum notice and rejects one minute short', () => {
    expect(isSlotBookable('2026-06-10T17:00:00.000Z', now, 2)).toBe(true);
    expect(isSlotBookable('2026-06-10T16:59:00.000Z', now, 2)).toBe(false);
  });

  it('accepts any future slot when there is no minimum notice', () => {
    expect(isSlotBookable('2026-06-10T15:01:00.000Z', now, 0)).toBe(true);
  });
});
