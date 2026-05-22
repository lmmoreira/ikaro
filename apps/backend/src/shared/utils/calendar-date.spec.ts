import { getUtcWeekDayName, localDateTimeToUTCIso, utcDateToLocalHHMM } from './calendar-date';

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
