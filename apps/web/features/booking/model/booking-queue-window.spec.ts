import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { resolveBookingQueueWindow } from './booking-queue-window';

describe('resolveBookingQueueWindow', () => {
  it("uses the tenant's local day, not the UTC day, late in a UTC-3 evening", () => {
    // 2026-08-16T01:30Z is already Sunday in UTC but still Saturday 22:30 in São Paulo.
    const result = resolveBookingQueueWindow({
      now: new Date('2026-08-16T01:30:00.000Z'),
      timezone: 'America/Sao_Paulo',
      windowDays: 14,
    });

    expect(result.today).toBe('2026-08-15');
    expect(result.tomorrow).toBe('2026-08-16');
    expect(result.windowEnd).toBe('2026-08-28');
  });

  it("uses the tenant's local day for a UTC+ zone that is already ahead of UTC's date", () => {
    // 2026-08-15T20:00Z is still Saturday in UTC but already Sunday 08:00 in Auckland (UTC+12).
    const result = resolveBookingQueueWindow({
      now: new Date('2026-08-15T20:00:00.000Z'),
      timezone: 'Pacific/Auckland',
      windowDays: 7,
    });

    expect(result.today).toBe('2026-08-16');
    expect(result.tomorrow).toBe('2026-08-17');
    expect(result.windowEnd).toBe('2026-08-22');
  });

  it('agrees with the UTC date when the tenant zone is UTC', () => {
    const result = resolveBookingQueueWindow({
      now: new Date('2026-08-16T01:30:00.000Z'),
      timezone: 'UTC',
      windowDays: 14,
    });

    expect(result.today).toBe('2026-08-16');
  });

  it('crosses a month boundary when deriving tomorrow and the window end', () => {
    const result = resolveBookingQueueWindow({
      now: new Date('2026-08-30T15:00:00.000Z'),
      timezone: 'America/Sao_Paulo',
      windowDays: 14,
    });

    expect(result.today).toBe('2026-08-30');
    expect(result.tomorrow).toBe('2026-08-31');
    expect(result.windowEnd).toBe('2026-09-12');
  });

  it('makes windowEnd equal today for a one-day window', () => {
    const result = resolveBookingQueueWindow({
      now: new Date('2026-08-16T15:00:00.000Z'),
      timezone: 'America/Sao_Paulo',
      windowDays: 1,
    });

    expect(result.windowEnd).toBe(result.today);
  });

  describe('with a fixed system clock', () => {
    beforeEach(() => {
      vi.useFakeTimers();
      vi.setSystemTime(new Date('2026-08-16T01:30:00.000Z'));
    });

    afterEach(() => {
      vi.useRealTimers();
    });

    it("resolves the tenant's today from the faked clock, as the queue page does with new Date()", () => {
      const result = resolveBookingQueueWindow({
        now: new Date(),
        timezone: 'America/Sao_Paulo',
        windowDays: 14,
      });

      expect(result.today).toBe('2026-08-15');
    });
  });
});
