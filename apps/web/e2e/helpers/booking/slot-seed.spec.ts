import { expect, test } from '@playwright/test';
import { parseSoonestSlot } from './slot-seed';

const HOUR_MS = 60 * 60 * 1000;
const HALF_HOUR_MS = HOUR_MS / 2;
const SUNDAY = 0;
const SATURDAY = 6;
const MONDAY = 1;
const LAST_SATURDAY_START_UTC_MINUTES = 15 * 60 + 30;

function everyHalfHourOfTwoWeeks(): Date[] {
  const start = Date.parse('2026-10-26T00:00:00Z');
  return Array.from({ length: 14 * 48 }, (_, step) => new Date(start + step * HALF_HOUR_MS));
}

function soonest(now: Date, seed = 'seed'): Date {
  return new Date(parseSoonestSlot(seed, { now }));
}

test.describe('parseSoonestSlot', () => {
  test('is at least an hour ahead and under 48 hours away, at every half hour of every weekday', () => {
    for (const now of everyHalfHourOfTwoWeeks()) {
      const hoursAway = (soonest(now).getTime() - now.getTime()) / HOUR_MS;

      expect(hoursAway, `from ${now.toISOString()}`).toBeGreaterThanOrEqual(1);
      expect(hoursAway, `from ${now.toISOString()}`).toBeLessThan(48);
    }
  });

  test('never starts on a Sunday, and on a Saturday only while the tenant is open', () => {
    for (const now of everyHalfHourOfTwoWeeks()) {
      const slot = soonest(now);
      const minutes = slot.getUTCHours() * 60 + slot.getUTCMinutes();

      expect(slot.getUTCDay(), `from ${now.toISOString()}`).not.toBe(SUNDAY);
      if (slot.getUTCDay() === SATURDAY) {
        expect(minutes, `from ${now.toISOString()}`).toBeLessThanOrEqual(
          LAST_SATURDAY_START_UTC_MINUTES,
        );
      }
    }
  });

  test('moves from a Friday evening to Saturday morning, where the next weekday would be Monday', () => {
    expect(soonest(new Date('2026-10-30T19:00:00Z')).getUTCDay()).toBe(SATURDAY);
  });

  test('moves from a Saturday evening to the first Monday slots, which are inside the window', () => {
    const now = new Date('2026-10-31T20:00:00Z');

    const slot = soonest(now);

    expect(slot.getUTCDay()).toBe(MONDAY);
    expect(slot.getTime() - now.getTime()).toBeLessThanOrEqual(47 * HOUR_MS);
  });

  test('throws instead of returning a start outside the window it was asked for', () => {
    const now = new Date('2026-10-31T20:00:00Z');

    expect(() => parseSoonestSlot('seed', { now, withinHours: 2 })).toThrow(/no open slot/);
  });

  test('the same seed picks the same slot, and different seeds spread over the open slots', () => {
    const now = new Date('2026-10-27T00:00:00Z');

    expect(parseSoonestSlot('a', { now })).toBe(parseSoonestSlot('a', { now }));
    const slots = new Set(
      Array.from({ length: 40 }, (_, index) => parseSoonestSlot(`seed-${index}`, { now })),
    );
    expect(slots.size).toBeGreaterThan(3);
  });
});
