import {
  addMonthsUTC,
  endOfDayUTC,
  getUtcWeekDayName,
  localDateTimeToUTCIso,
  localDayBoundsUTC,
  startOfDayUTC,
  todayUTC,
  utcDateToLocalDate,
  utcDateToLocalHHMM,
} from './calendar-date';

describe('todayUTC', () => {
  it('returns a YYYY-MM-DD string', () => {
    expect(todayUTC()).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });

  it('matches the UTC date of new Date()', () => {
    expect(todayUTC()).toBe(new Date().toISOString().slice(0, 10));
  });
});

describe('getUtcWeekDayName', () => {
  it('returns sunday for a known Sunday', () => {
    expect(getUtcWeekDayName('2026-06-07')).toBe('sunday');
  });

  it('returns monday for a known Monday', () => {
    expect(getUtcWeekDayName('2026-06-01')).toBe('monday');
  });

  it('returns saturday for a known Saturday', () => {
    expect(getUtcWeekDayName('2026-06-06')).toBe('saturday');
  });

  it('does not shift the day due to local timezone', () => {
    // 2026-06-07 is a Sunday regardless of the machine's local timezone.
    expect(getUtcWeekDayName('2026-06-07')).toBe('sunday');
  });
});

describe('localDateTimeToUTCIso', () => {
  // America/Sao_Paulo is UTC-3 (no DST since 2019).
  const TZ = 'America/Sao_Paulo';

  it('converts 09:00 local to 12:00 UTC', () => {
    expect(localDateTimeToUTCIso('2026-06-01', '09:00', TZ)).toBe('2026-06-01T12:00:00.000Z');
  });

  it('converts 18:00 local to 21:00 UTC', () => {
    expect(localDateTimeToUTCIso('2026-06-01', '18:00', TZ)).toBe('2026-06-01T21:00:00.000Z');
  });

  it('returns an ISO-8601 UTC string with millisecond precision', () => {
    const result = localDateTimeToUTCIso('2026-06-01', '09:00', TZ);
    expect(result).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/);
  });
});

describe('utcDateToLocalHHMM', () => {
  const TZ = 'America/Sao_Paulo'; // UTC-3

  it('converts 12:00 UTC to 09:00 local', () => {
    expect(utcDateToLocalHHMM(new Date('2026-06-01T12:00:00Z'), TZ)).toBe('09:00');
  });

  it('converts 21:00 UTC to 18:00 local', () => {
    expect(utcDateToLocalHHMM(new Date('2026-06-01T21:00:00Z'), TZ)).toBe('18:00');
  });

  it('converts midnight UTC to 21:00 local the previous day (correct cross-day offset)', () => {
    expect(utcDateToLocalHHMM(new Date('2026-06-02T00:00:00Z'), TZ)).toBe('21:00');
  });
});

describe('startOfDayUTC', () => {
  it('appends T00:00:00.000Z to a YYYY-MM-DD string', () => {
    expect(startOfDayUTC('2026-06-01')).toBe('2026-06-01T00:00:00.000Z');
  });
});

describe('endOfDayUTC', () => {
  it('appends T23:59:59.999Z to a YYYY-MM-DD string', () => {
    expect(endOfDayUTC('2026-06-01')).toBe('2026-06-01T23:59:59.999Z');
  });
});

describe('utcDateToLocalDate', () => {
  const TZ = 'America/Sao_Paulo'; // UTC-3

  it('converts a UTC date to the correct local date', () => {
    // 12:00 UTC = 09:00 local — same calendar date
    expect(utcDateToLocalDate(new Date('2026-06-01T12:00:00Z'), TZ)).toBe('2026-06-01');
  });

  it('shifts to the previous local date when UTC time is before 03:00 (offset)', () => {
    // 00:00 UTC = 21:00 on Jun 1 local — date shifts back one day
    expect(utcDateToLocalDate(new Date('2026-06-02T00:00:00Z'), TZ)).toBe('2026-06-01');
  });

  it('returns a YYYY-MM-DD string', () => {
    expect(utcDateToLocalDate(new Date('2026-06-01T12:00:00Z'), TZ)).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });
});

describe('addMonthsUTC', () => {
  it('adds whole months, preserving day/time', () => {
    const result = addMonthsUTC(new Date('2026-01-15T10:30:00.000Z'), 6);
    expect(result.toISOString()).toBe('2026-07-15T10:30:00.000Z');
  });

  it('rolls over the year when the month count crosses a year boundary', () => {
    const result = addMonthsUTC(new Date('2026-08-01T00:00:00.000Z'), 6);
    expect(result.toISOString()).toBe('2027-02-01T00:00:00.000Z');
  });

  it('clamps to the shorter month instead of overflowing (Jan 31 + 1 month => Feb 28)', () => {
    const result = addMonthsUTC(new Date('2026-01-31T00:00:00.000Z'), 1);
    expect(result.toISOString()).toBe('2026-02-28T00:00:00.000Z');
  });
});

describe('localDayBoundsUTC', () => {
  it('returns UTC-shifted boundaries for a non-UTC timezone (America/Sao_Paulo, UTC-3)', () => {
    // 15:00 UTC = 12:00 local on the same calendar day.
    const { start, end } = localDayBoundsUTC(
      new Date('2026-08-24T15:00:00.000Z'),
      'America/Sao_Paulo',
    );
    // Local Aug 24 00:00:00 = Aug 24 03:00:00 UTC; local Aug 24 23:59:59.999 = Aug 25 02:59:59.999 UTC.
    expect(start.toISOString()).toBe('2026-08-24T03:00:00.000Z');
    expect(end.toISOString()).toBe('2026-08-25T02:59:59.999Z');
  });

  it('correctly buckets a submission near local midnight that has already crossed into the next UTC calendar day (PR #417 review finding)', () => {
    // 2026-08-25T01:00:00Z is 2026-08-24T22:00:00 local (America/Sao_Paulo, UTC-3) — still local
    // Aug 24. A bare-UTC-day boundary for "Aug 24" (00:00Z-23:59Z) would NOT contain this instant,
    // silently undercounting it against the tenant's own local-day cap.
    const submittedAt = new Date('2026-08-25T01:00:00.000Z');
    const { start, end } = localDayBoundsUTC(submittedAt, 'America/Sao_Paulo');
    expect(submittedAt.getTime()).toBeGreaterThanOrEqual(start.getTime());
    expect(submittedAt.getTime()).toBeLessThanOrEqual(end.getTime());
  });

  it('returns plain UTC-day boundaries for the UTC timezone itself', () => {
    const { start, end } = localDayBoundsUTC(new Date('2026-06-01T12:00:00.000Z'), 'UTC');
    expect(start.toISOString()).toBe('2026-06-01T00:00:00.000Z');
    expect(end.toISOString()).toBe('2026-06-01T23:59:59.999Z');
  });
});
