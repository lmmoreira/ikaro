import { BookingTooFarAheadError } from '../../domain/errors/booking-domain.error';
import {
  alertLastMatchableInstant,
  assertEndsWithinBookableUntil,
  assertTermWithinBookableUntil,
  bookableUntilBoundary,
  commitmentEnd,
} from './bookable-until.helpers';
import {
  clampAdvanceDaysToBookableUntil,
  daysUntilBookableUntil,
} from '../../../../shared/utils/bookable-until-days';

const SP = 'America/Sao_Paulo';
// America/Sao_Paulo has no daylight saving time since 2019: local midnight is 03:00 UTC.
const BOUNDARY_DEC_15 = new Date('2026-12-15T03:00:00.000Z');
// Today is Thursday 10 Dec 2026, 12:00 in São Paulo.
const NOW = new Date('2026-12-10T15:00:00.000Z');

describe('the billing bookable-until cap (M26-S18b)', () => {
  describe('bookableUntilBoundary', () => {
    it('is the local midnight that opens the date, whatever the UTC day', () => {
      expect(bookableUntilBoundary('2026-12-15', SP)).toEqual(BOUNDARY_DEC_15);
      expect(bookableUntilBoundary('2026-12-15', 'Asia/Tokyo')).toEqual(
        new Date('2026-12-14T15:00:00.000Z'),
      );
    });
  });

  describe('assertEndsWithinBookableUntil', () => {
    const cases: {
      name: string;
      endsAt: Date;
      cap: string | null | undefined;
      refused: boolean;
    }[] = [
      {
        name: 'a null cap accepts everything',
        endsAt: new Date('2030-01-01'),
        cap: null,
        refused: false,
      },
      {
        name: 'an absent cap accepts everything',
        endsAt: new Date('2030-01-01'),
        cap: undefined,
        refused: false,
      },
      {
        name: 'an end well before the cap is accepted',
        endsAt: new Date('2026-12-12T15:00:00Z'),
        cap: '2026-12-15',
        refused: false,
      },
      {
        name: 'an end on the last bookable day is accepted',
        endsAt: new Date('2026-12-15T02:59:00Z'),
        cap: '2026-12-15',
        refused: false,
      },
      {
        name: 'an end exactly at the boundary instant is accepted',
        endsAt: BOUNDARY_DEC_15,
        cap: '2026-12-15',
        refused: false,
      },
      {
        name: 'an end one minute after the boundary is refused',
        endsAt: new Date('2026-12-15T03:01:00Z'),
        cap: '2026-12-15',
        refused: true,
      },
      {
        name: 'an end on the cap day is refused',
        endsAt: new Date('2026-12-15T15:00:00Z'),
        cap: '2026-12-15',
        refused: true,
      },
      {
        name: 'an end after the cap is refused',
        endsAt: new Date('2026-12-20T15:00:00Z'),
        cap: '2026-12-15',
        refused: true,
      },
    ];

    it.each(cases)('$name', ({ endsAt, cap, refused }) => {
      const act = () => assertEndsWithinBookableUntil(endsAt, cap, SP, NOW);

      if (refused) expect(act).toThrow(BookingTooFarAheadError);
      else expect(act).not.toThrow();
    });

    it('refuses a booking that starts the day before and runs past midnight into the cap day', () => {
      const startsAt = new Date('2026-12-15T02:30:00Z'); // 23:30 on the 14th, local
      const endsAt = commitmentEnd(startsAt, 60); // 00:30 on the 15th, local

      expect(() => assertEndsWithinBookableUntil(endsAt, '2026-12-15', SP, NOW)).toThrow(
        BookingTooFarAheadError,
      );
    });

    it('uses the tenant timezone: the same instant is on different sides of the boundary', () => {
      const endsAt = new Date('2026-12-14T20:00:00Z');

      expect(() => assertEndsWithinBookableUntil(endsAt, '2026-12-15', SP, NOW)).not.toThrow();
      expect(() => assertEndsWithinBookableUntil(endsAt, '2026-12-15', 'Asia/Tokyo', NOW)).toThrow(
        BookingTooFarAheadError,
      );
    });

    it('reports the days still bookable, not the configured maximum', () => {
      expect.assertions(2);
      try {
        assertEndsWithinBookableUntil(new Date('2026-12-20T15:00:00Z'), '2026-12-15', SP, NOW);
      } catch (err) {
        expect(err).toBeInstanceOf(BookingTooFarAheadError);
        expect((err as Error).message).toContain('5 days');
      }
    });
  });

  describe('daysUntilBookableUntil and the clamp', () => {
    it.each([
      { cap: '2026-12-15', days: 5 },
      { cap: '2026-12-11', days: 1 },
      { cap: '2026-12-10', days: 0 },
      { cap: '2026-12-01', days: 0 },
    ])('counts $days whole days to $cap in the tenant-local calendar', ({ cap, days }) => {
      expect(daysUntilBookableUntil(cap, SP, NOW)).toBe(days);
    });

    it('takes the tenant-local today, not the UTC day, late in the evening', () => {
      // 23:30 on the 10th in São Paulo is already the 11th in UTC.
      const lateEvening = new Date('2026-12-11T02:30:00Z');

      expect(daysUntilBookableUntil('2026-12-15', SP, lateEvening)).toBe(5);
      expect(daysUntilBookableUntil('2026-12-15', 'UTC', lateEvening)).toBe(4);
    });

    it.each([
      { max: 90, cap: '2026-12-15', clamped: 5 },
      { max: 3, cap: '2026-12-15', clamped: 3 },
      { max: 90, cap: null, clamped: 90 },
      { max: 90, cap: undefined, clamped: 90 },
      { max: 90, cap: '2026-12-10', clamped: 0 },
    ])('clamps $max with the cap $cap to $clamped', ({ max, cap, clamped }) => {
      expect(clampAdvanceDaysToBookableUntil(max, cap, SP, NOW)).toBe(clamped);
    });
  });

  describe('assertTermWithinBookableUntil (a recurring request)', () => {
    const lastStart = new Date('2026-12-11T13:00:00Z');

    it('accepts a term that ends before the cap, last occurrence included', () => {
      expect(() =>
        assertTermWithinBookableUntil(
          { endsOn: '2026-12-11', lastOccurrenceStart: lastStart, durationMinutes: 60 },
          '2026-12-15',
          SP,
          NOW,
        ),
      ).not.toThrow();
    });

    it('refuses the whole term when endsOn reaches the cap, even with an earlier last occurrence', () => {
      expect(() =>
        assertTermWithinBookableUntil(
          { endsOn: '2026-12-15', lastOccurrenceStart: lastStart, durationMinutes: 60 },
          '2026-12-15',
          SP,
          NOW,
        ),
      ).toThrow(BookingTooFarAheadError);
    });

    it('refuses a term that ends the day before but whose last occurrence runs past the boundary', () => {
      expect(() =>
        assertTermWithinBookableUntil(
          {
            endsOn: '2026-12-14',
            lastOccurrenceStart: new Date('2026-12-15T02:30:00Z'),
            durationMinutes: 60,
          },
          '2026-12-15',
          SP,
          NOW,
        ),
      ).toThrow(BookingTooFarAheadError);
    });

    it('accepts anything without a cap', () => {
      expect(() =>
        assertTermWithinBookableUntil(
          {
            endsOn: '2030-01-01',
            lastOccurrenceStart: new Date('2030-01-01'),
            durationMinutes: 60,
          },
          null,
          SP,
          NOW,
        ),
      ).not.toThrow();
    });
  });

  describe('alertLastMatchableInstant', () => {
    const expiresAt = new Date('2026-12-30T00:00:00Z');

    it('is the earlier of a one-time range end and the expiry', () => {
      const rangeEnd = new Date('2026-12-12T00:00:00Z');
      const criteria = {
        criteriaType: 'ONE_TIME_RANGE' as const,
        acceptableStartAt: new Date('2026-12-11T00:00:00Z'),
        acceptableEndAt: rangeEnd,
      };

      expect(alertLastMatchableInstant(criteria, expiresAt)).toEqual(rangeEnd);
      expect(alertLastMatchableInstant(criteria, new Date('2026-12-11T12:00:00Z'))).toEqual(
        new Date('2026-12-11T12:00:00Z'),
      );
    });
  });
});
