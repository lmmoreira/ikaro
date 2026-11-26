import { BookingErrorCode } from '@ikaro/types/protocol/errors';
import { ServiceBuilder } from '../../../../test/builders/booking/service.builder';
import {
  BookingScheduledInPastError,
  BookingTooFarAheadError,
  BookingTooSoonError,
} from '../../domain/errors/booking-domain.error';
import {
  assertBookingWindowOverridesValid,
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

  describe('the billing bookable-until cap (M26-S18b)', () => {
    // 2026-06-10T15:00Z is 12:00 on 2026-06-10 in São Paulo (UTC-3).
    const now = new Date('2026-06-10T15:00:00.000Z');
    const capped = (bookableUntil: string | null | undefined, timezone: string | undefined) => ({
      ...TENANT,
      bookableUntil,
      timezone,
    });

    it('clamps maxAdvanceDays to the whole days until the cap and leaves minAdvanceHours alone', () => {
      expect(
        resolveEffectiveBookingWindow(capped('2026-06-15', TIMEZONE), [service({})], now),
      ).toEqual({ minAdvanceHours: 2, maxAdvanceDays: 5 });
    });

    it('counts the cap day in the tenant timezone, not the UTC day', () => {
      // 2026-06-11T01:00Z is still 22:00 on 2026-06-10 in São Paulo: today is the 10th there.
      const lateEvening = new Date('2026-06-11T01:00:00.000Z');

      expect(
        resolveEffectiveBookingWindow(capped('2026-06-15', TIMEZONE), [service({})], lateEvening),
      ).toEqual({ minAdvanceHours: 2, maxAdvanceDays: 5 });
      expect(
        resolveEffectiveBookingWindow(
          capped('2026-06-15', 'Asia/Tokyo'),
          [service({})],
          lateEvening,
        ),
      ).toEqual({ minAdvanceHours: 2, maxAdvanceDays: 4 });
    });

    it('takes the smaller of the configured window and the days until the cap', () => {
      expect(
        resolveEffectiveBookingWindow(capped('2026-12-31', TIMEZONE), [service({})], now),
      ).toEqual({ minAdvanceHours: 2, maxAdvanceDays: 90 });
    });

    it('offers no day when the cap is today or already passed', () => {
      expect(
        resolveEffectiveBookingWindow(capped('2026-06-10', TIMEZONE), [service({})], now),
      ).toEqual({ minAdvanceHours: 2, maxAdvanceDays: 0 });
      expect(
        resolveEffectiveBookingWindow(capped('2026-06-01', TIMEZONE), [service({})], now),
      ).toEqual({ minAdvanceHours: 2, maxAdvanceDays: 0 });
    });

    it('never changes minAdvanceHours, even for a service notice override', () => {
      const strict = service({ minBookingAdvanceHoursOverride: 48 });

      expect(resolveEffectiveBookingWindow(capped('2026-06-15', TIMEZONE), [strict], now)).toEqual({
        minAdvanceHours: 48,
        maxAdvanceDays: 5,
      });
    });

    it('keeps a service override that is tighter than the cap', () => {
      const tight = service({ maxBookingAdvanceDaysOverride: 3 });

      expect(resolveEffectiveBookingWindow(capped('2026-06-15', TIMEZONE), [tight], now)).toEqual({
        minAdvanceHours: 2,
        maxAdvanceDays: 3,
      });
    });

    it('clamps a basket by the cap after taking the strictest service value', () => {
      const a = service({ maxBookingAdvanceDaysOverride: 30 });
      const b = service({ maxBookingAdvanceDaysOverride: 20 });

      expect(resolveEffectiveBookingWindow(capped('2026-06-15', TIMEZONE), [a, b], now)).toEqual({
        minAdvanceHours: 2,
        maxAdvanceDays: 5,
      });
    });

    it.each([
      ['a null cap', null, TIMEZONE],
      ['an absent cap', undefined, TIMEZONE],
      ['an absent timezone', '2026-06-15', undefined],
      ['neither', undefined, undefined],
    ])('equals the uncapped result for %s', (_label, bookableUntil, timezone) => {
      const services = [service({ maxBookingAdvanceDaysOverride: 30 })];

      expect(resolveEffectiveBookingWindow(capped(bookableUntil, timezone), services, now)).toEqual(
        resolveEffectiveBookingWindow(TENANT, services, now),
      );
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

describe('assertBookingWindowOverridesValid', () => {
  function errorOf(overrides: Parameters<typeof assertBookingWindowOverridesValid>[0]): unknown {
    try {
      assertBookingWindowOverridesValid(overrides, TENANT);
    } catch (err) {
      return err;
    }
    throw new Error('expected the overrides to be rejected');
  }

  it('accepts overrides that only tighten the business window', () => {
    expect(() =>
      assertBookingWindowOverridesValid(
        { minBookingAdvanceHoursOverride: 24, maxBookingAdvanceDaysOverride: 30 },
        TENANT,
      ),
    ).not.toThrow();
  });

  it('ignores the billing cap: a temporary cap must not rewrite a saved service policy', () => {
    const tenantWithCap = { ...TENANT, bookableUntil: '2026-06-15', timezone: TIMEZONE };

    // 30 days is far past a cap 5 days away, yet it is still a valid policy under the 90-day window.
    expect(() =>
      assertBookingWindowOverridesValid(
        { minBookingAdvanceHoursOverride: 24 * 10, maxBookingAdvanceDaysOverride: 30 },
        tenantWithCap,
      ),
    ).not.toThrow();
  });

  it('reports the configured business maximum, not the capped one, when a maximum above it is requested', () => {
    const tenantWithCap = { ...TENANT, bookableUntil: '2026-06-15', timezone: TIMEZONE };

    expect(() =>
      assertBookingWindowOverridesValid(
        { minBookingAdvanceHoursOverride: null, maxBookingAdvanceDaysOverride: 365 },
        tenantWithCap,
      ),
    ).toThrow(expect.objectContaining({ params: { maxAdvanceDays: 90 } }));
  });

  it('names the business maximum when a maximum above it is requested', () => {
    expect(
      errorOf({ minBookingAdvanceHoursOverride: null, maxBookingAdvanceDaysOverride: 365 }),
    ).toMatchObject({
      code: BookingErrorCode.SERVICE_POLICY_MAX_ADVANCE_EXCEEDS_TENANT,
      field: 'maxBookingAdvanceDaysOverride',
      params: { maxAdvanceDays: 90 },
    });
  });

  it('names the business minimum when a minimum below it is requested', () => {
    expect(
      errorOf({ minBookingAdvanceHoursOverride: 1, maxBookingAdvanceDaysOverride: null }),
    ).toMatchObject({
      code: BookingErrorCode.SERVICE_POLICY_MIN_ADVANCE_BELOW_TENANT,
      field: 'minBookingAdvanceHoursOverride',
      params: { minAdvanceHours: 2 },
    });
  });

  it('names the effective window when the notice leaves no bookable day', () => {
    expect(
      errorOf({ minBookingAdvanceHoursOverride: 24 * 10, maxBookingAdvanceDaysOverride: 5 }),
    ).toMatchObject({
      code: BookingErrorCode.SERVICE_POLICY_WINDOW_EMPTY,
      field: 'minBookingAdvanceHoursOverride',
      params: { minAdvanceHours: 240, maxAdvanceDays: 5 },
    });
  });
});
