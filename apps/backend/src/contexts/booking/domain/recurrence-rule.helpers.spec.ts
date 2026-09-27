import {
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

describe('enumerateRecurrenceOccurrences', () => {
  it('returns one occurrence per matching weekday within the horizon', () => {
    // 2026-09-01 is a Tuesday; horizon covers 3 full weeks.
    const occurrences = enumerateRecurrenceOccurrences(
      weeklyRule(),
      '2026-09-01',
      null,
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
      null,
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

  it('clips to endsOn when it falls before the horizon end', () => {
    const occurrences = enumerateRecurrenceOccurrences(
      weeklyRule(),
      '2026-09-01',
      '2026-09-08',
      '2026-09-21',
      TZ,
    );

    expect(occurrences.map((o) => o.occurrenceStartLocalDate)).toEqual([
      '2026-09-01',
      '2026-09-08',
    ]);
  });

  it('ignores endsOn when it falls after the horizon end', () => {
    const occurrences = enumerateRecurrenceOccurrences(
      weeklyRule(),
      '2026-09-01',
      '2027-01-01',
      '2026-09-08',
      TZ,
    );

    expect(occurrences.map((o) => o.occurrenceStartLocalDate)).toEqual([
      '2026-09-01',
      '2026-09-08',
    ]);
  });

  it('returns an empty array when the effective end is before startsOn', () => {
    const occurrences = enumerateRecurrenceOccurrences(
      weeklyRule(),
      '2026-09-10',
      '2026-09-01',
      '2026-09-21',
      TZ,
    );

    expect(occurrences).toEqual([]);
  });

  it('converts the tenant-local startTime to the correct UTC instant (America/Sao_Paulo, UTC-3)', () => {
    const occurrences = enumerateRecurrenceOccurrences(
      weeklyRule(),
      '2026-09-01',
      null,
      '2026-09-01',
      TZ,
    );

    expect(occurrences).toHaveLength(1);
    expect(occurrences[0].occurrenceStart.toISOString()).toBe('2026-09-01T13:00:00.000Z');
  });
});
