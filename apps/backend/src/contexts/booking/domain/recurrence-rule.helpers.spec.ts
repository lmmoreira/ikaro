import {
  RecurringBookingScheduleInvalidDateRangeError,
  RecurringBookingScheduleTermExceededError,
} from './errors/recurring-booking-schedule.error';
import {
  assertValidTerm,
  enumerateRecurrenceOccurrences,
  RecurrenceRule,
  resolveHorizonEndDate,
} from './recurrence-rule.helpers';

const TZ = 'America/Sao_Paulo';

function weeklyRule(overrides: Partial<RecurrenceRule> = {}): RecurrenceRule {
  return {
    frequency: 'WEEKLY',
    daysOfWeek: ['tuesday'],
    startTime: '10:00',
    durationMinutes: 120,
    ...overrides,
  };
}

describe('resolveHorizonEndDate', () => {
  it('adds the given number of calendar days to startsOn', () => {
    expect(resolveHorizonEndDate('2026-09-01', 90)).toBe('2026-11-30');
  });

  it('handles a horizon crossing a month/year boundary', () => {
    expect(resolveHorizonEndDate('2026-12-20', 30)).toBe('2027-01-19');
  });
});

describe('assertValidTerm', () => {
  it('accepts an endsOn equal to startsOn', () => {
    expect(() => assertValidTerm('2026-09-01', '2026-09-01', 90)).not.toThrow();
  });

  it('accepts an endsOn exactly at the maximum term', () => {
    expect(() => assertValidTerm('2026-09-01', '2026-11-30', 90)).not.toThrow();
  });

  it('rejects a reversed range as an invalid date range', () => {
    expect(() => assertValidTerm('2026-09-10', '2026-09-01', 90)).toThrow(
      RecurringBookingScheduleInvalidDateRangeError,
    );
  });

  it('rejects one day past the maximum term and reports the limit', () => {
    expect.assertions(2);
    try {
      assertValidTerm('2026-09-01', '2026-12-01', 90);
    } catch (err) {
      expect(err).toBeInstanceOf(RecurringBookingScheduleTermExceededError);
      expect((err as RecurringBookingScheduleTermExceededError).params).toEqual({
        maxTermDays: 90,
        latestEndsOn: '2026-11-30',
      });
    }
  });

  it('reports a reversed range before a term overrun', () => {
    // A range that is both reversed and (numerically) past the cap can only be reversed.
    expect(() => assertValidTerm('2026-09-10', '2026-09-01', 0)).toThrow(
      RecurringBookingScheduleInvalidDateRangeError,
    );
  });
});

describe('enumerateRecurrenceOccurrences', () => {
  it('returns one occurrence per matching weekday within the term', () => {
    // 2026-09-01 is a Tuesday; the term covers 3 full weeks.
    const occurrences = enumerateRecurrenceOccurrences(
      weeklyRule(),
      '2026-09-01',
      '2026-09-21',
      TZ,
    );

    expect(occurrences.map((o) => o.occurrenceStartLocalDate)).toEqual([
      '2026-09-01',
      '2026-09-08',
      '2026-09-15',
    ]);
  });

  it('matches every listed weekday when more than one is set', () => {
    const occurrences = enumerateRecurrenceOccurrences(
      weeklyRule({ daysOfWeek: ['tuesday', 'thursday'] }),
      '2026-09-01',
      '2026-09-10',
      TZ,
    );

    expect(occurrences.map((o) => o.occurrenceStartLocalDate)).toEqual([
      '2026-09-01',
      '2026-09-03',
      '2026-09-08',
      '2026-09-10',
    ]);
  });

  it('includes an occurrence on endsOn itself', () => {
    const occurrences = enumerateRecurrenceOccurrences(
      weeklyRule(),
      '2026-09-01',
      '2026-09-08',
      TZ,
    );

    expect(occurrences.map((o) => o.occurrenceStartLocalDate)).toEqual([
      '2026-09-01',
      '2026-09-08',
    ]);
  });

  it('returns an empty array when endsOn is before startsOn', () => {
    const occurrences = enumerateRecurrenceOccurrences(
      weeklyRule(),
      '2026-09-10',
      '2026-09-01',
      TZ,
    );

    expect(occurrences).toEqual([]);
  });

  it('converts the tenant-local startTime to the correct UTC instant (America/Sao_Paulo, UTC-3)', () => {
    const occurrences = enumerateRecurrenceOccurrences(
      weeklyRule(),
      '2026-09-01',
      '2026-09-01',
      TZ,
    );

    expect(occurrences).toHaveLength(1);
    expect(occurrences[0].occurrenceStart.toISOString()).toBe('2026-09-01T13:00:00.000Z');
  });

  it('enumerates a full 90-day term without an upper limit of its own', () => {
    const occurrences = enumerateRecurrenceOccurrences(
      weeklyRule(),
      '2026-09-01',
      '2026-11-30',
      TZ,
    );

    // 2026-09-01 (Tue) … 2026-11-24 (Tue): 13 weekly occurrences.
    expect(occurrences).toHaveLength(13);
    expect(occurrences.at(-1)?.occurrenceStartLocalDate).toBe('2026-11-24');
  });
});
