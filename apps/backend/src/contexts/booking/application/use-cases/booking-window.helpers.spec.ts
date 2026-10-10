import { ServiceBuilder } from '../../../../test/builders/booking/service.builder';
import {
  BookingScheduledInPastError,
  BookingTooFarAheadError,
  BookingTooSoonError,
} from '../../domain/errors/booking-domain.error';
import {
  assertWithinBookingWindow,
  assertWithinEffectiveBookingWindow,
  resolveEffectiveBookingWindow,
} from './booking-window.helpers';

const TENANT = { minBookingAdvanceHours: 2, maxBookingAdvanceDays: 90 };
const TIMEZONE = 'America/Sao_Paulo';

function service(policy: Parameters<ServiceBuilder['withBookingPolicy']>[0]) {
  return new ServiceBuilder().withBookingPolicy(policy).build();
}

describe('resolveEffectiveBookingWindow', () => {
  it('returns the tenant window when no service sets an override', () => {
    expect(resolveEffectiveBookingWindow(TENANT, [service({})])).toEqual({
      minAdvanceHours: 2,
      maxAdvanceDays: 90,
    });
  });

  it('returns the tenant window for an empty list of services', () => {
    expect(resolveEffectiveBookingWindow(TENANT, [])).toEqual({
      minAdvanceHours: 2,
      maxAdvanceDays: 90,
    });
  });

  it('lets a service tighten the window, each field independently', () => {
    const onlyMax = service({ maxBookingAdvanceDaysOverride: 30 });
    const onlyMin = service({ minBookingAdvanceHoursOverride: 24 });

    expect(resolveEffectiveBookingWindow(TENANT, [onlyMax])).toEqual({
      minAdvanceHours: 2,
      maxAdvanceDays: 30,
    });
    expect(resolveEffectiveBookingWindow(TENANT, [onlyMin])).toEqual({
      minAdvanceHours: 24,
      maxAdvanceDays: 90,
    });
  });

  it('clamps an override that is looser than the tenant window to the tenant window', () => {
    const looser = service({
      maxBookingAdvanceDaysOverride: 365,
      minBookingAdvanceHoursOverride: 0,
    });

    expect(resolveEffectiveBookingWindow(TENANT, [looser])).toEqual({
      minAdvanceHours: 2,
      maxAdvanceDays: 90,
    });
  });

  it('takes the smallest maximum and the largest minimum across a basket', () => {
    const a = service({ maxBookingAdvanceDaysOverride: 30, minBookingAdvanceHoursOverride: 6 });
    const b = service({ maxBookingAdvanceDaysOverride: 14, minBookingAdvanceHoursOverride: 3 });
    const c = service({});

    expect(resolveEffectiveBookingWindow(TENANT, [a, b, c])).toEqual({
      minAdvanceHours: 6,
      maxAdvanceDays: 14,
    });
  });
});

describe('assertWithinBookingWindow', () => {
  // 2026-06-10T15:00Z is 12:00 in São Paulo (UTC−3).
  const now = new Date('2026-06-10T15:00:00.000Z');
  const window = { minAdvanceHours: 2, maxAdvanceDays: 3 };

  function assertAt(startsAt: string, override = window): void {
    assertWithinBookingWindow({
      startsAt: new Date(startsAt),
      now,
      timezone: TIMEZONE,
      window: override,
    });
  }

  it('rejects a start in the past with BookingScheduledInPastError', () => {
    expect(() => assertAt('2026-06-10T14:00:00.000Z')).toThrow(BookingScheduledInPastError);
  });

  it('rejects a start exactly at now with BookingScheduledInPastError', () => {
    expect(() => assertAt('2026-06-10T15:00:00.000Z')).toThrow(BookingScheduledInPastError);
  });

  it('accepts a start exactly at the minimum notice and rejects one minute short', () => {
    expect(() => assertAt('2026-06-10T17:00:00.000Z')).not.toThrow();
    expect(() => assertAt('2026-06-10T16:59:00.000Z')).toThrow(BookingTooSoonError);
  });

  it('accepts a future start with no minimum notice', () => {
    expect(() =>
      assertAt('2026-06-10T15:01:00.000Z', { ...window, minAdvanceHours: 0 }),
    ).not.toThrow();
  });

  it('accepts the last bookable local day and rejects the day after', () => {
    // today 06-10, maxAdvanceDays 3 → last bookable day is 06-12 (local).
    expect(() => assertAt('2026-06-13T01:59:00.000Z')).not.toThrow();
    expect(() => assertAt('2026-06-13T03:00:00.000Z')).toThrow(BookingTooFarAheadError);
  });

  it("rolls 'today' over at local midnight, not at 21:00 local", () => {
    // 23:00 local on 06-09 → 02:00Z on 06-10. Local today is still 06-09.
    const lateNow = new Date('2026-06-10T02:00:00.000Z');
    const oneDay = { minAdvanceHours: 0, maxAdvanceDays: 1 };
    const at = (startsAt: string): void =>
      assertWithinBookingWindow({
        startsAt: new Date(startsAt),
        now: lateNow,
        timezone: TIMEZONE,
        window: oneDay,
      });

    expect(() => at('2026-06-10T02:59:00.000Z')).not.toThrow();
    expect(() => at('2026-06-10T04:00:00.000Z')).toThrow(BookingTooFarAheadError);
  });
});

describe('assertWithinEffectiveBookingWindow', () => {
  const request = (daysAhead: number) => ({
    scheduledAt: new Date(Date.now() + daysAhead * 86_400_000).toISOString(),
    timezone: TIMEZONE,
    tenantBookingWindow: TENANT,
  });

  it('applies the strictest service window to the requested start', () => {
    expect(() =>
      assertWithinEffectiveBookingWindow(request(10), [
        service({ maxBookingAdvanceDaysOverride: 5 }),
      ]),
    ).toThrow(BookingTooFarAheadError);
    expect(() => assertWithinEffectiveBookingWindow(request(10), [service({})])).not.toThrow();
  });

  describe('ignoreMinAdvance (staff-created booking, UC-108)', () => {
    const insideMinNotice = () => ({
      scheduledAt: new Date(Date.now() + 30 * 60_000).toISOString(),
      timezone: TIMEZONE,
      tenantBookingWindow: TENANT,
    });

    // Negative guarantee: the default path keeps enforcing the minimum notice.
    it('still enforces the minimum notice when the option is not passed', () => {
      expect(() => assertWithinEffectiveBookingWindow(insideMinNotice(), [service({})])).toThrow(
        BookingTooSoonError,
      );
      expect(() =>
        assertWithinEffectiveBookingWindow(insideMinNotice(), [service({})], {
          ignoreMinAdvance: false,
        }),
      ).toThrow(BookingTooSoonError);
    });

    it('skips the minimum notice, tenant-wide and per-service', () => {
      const options = { ignoreMinAdvance: true };

      expect(() =>
        assertWithinEffectiveBookingWindow(insideMinNotice(), [service({})], options),
      ).not.toThrow();
      expect(() =>
        assertWithinEffectiveBookingWindow(
          insideMinNotice(),
          [service({ minBookingAdvanceHoursOverride: 48 })],
          options,
        ),
      ).not.toThrow();
    });

    it('still rejects a start in the past', () => {
      const past = {
        ...insideMinNotice(),
        scheduledAt: new Date(Date.now() - 60_000).toISOString(),
      };

      expect(() =>
        assertWithinEffectiveBookingWindow(past, [service({})], { ignoreMinAdvance: true }),
      ).toThrow(BookingScheduledInPastError);
    });

    it('still rejects a start beyond the maximum advance', () => {
      expect(() =>
        assertWithinEffectiveBookingWindow(
          request(10),
          [service({ maxBookingAdvanceDaysOverride: 5 })],
          { ignoreMinAdvance: true },
        ),
      ).toThrow(BookingTooFarAheadError);
    });
  });
});
